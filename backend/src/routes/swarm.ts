import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuthRequest } from '../middleware/auth.js';
import { requireTenantContext, requireResourceOwner } from '../security/tenantContext.js';
import { TenantAccessError } from '../security/tenantErrors.js';
import { runBuildPipeline } from '../ai/pipeline.js';
import { builderProjectExists, closeBuilderRun, openBuilderRun } from '../builder/swarmBridge.js';
import type { BuilderRunBinding } from '../builder/service.js';
import {enqueueGoogleSwarm,googleBackgroundSelected} from '../workers/googleSwarmQueue.js';
import { initSSE, sendSSE, endSSE } from '../lib/sse.js';
import { slimOutputForSse } from '../lib/slimOutputForSse.js';
import { bindBuildStreamDisconnect } from '../lib/buildStreamLifecycle.js';
import { buildFullProjectFiles } from '../services/projectScaffold.js';
import { notifyBuildComplete, notifyBuildFailed } from '../services/notificationService.js';
import { isValidClientRunId } from '../lib/clientRunId.js';
import { publicAiPayload, publicAiText } from '../lib/publicAiIdentity.js';
import {
  failRun,
  getRun,
  getRunAsync,
  appendRunEvent,
  persistRunState,
  listRunsForUser,
  listRunsForUserAsync,
  saveConversation,
  persistConversationOnly,
  requestRunCancellation,
  isRunCancellationRequested,
  withRunAttempt,
  hasAdmittedRunAttempt,
  persistTerminalRunAuthority,
} from '../ai/runStore.js';

const router = Router();
const activeBuildControllers = new Map<string, AbortController>();

/** A local terminal label alone cannot authorize a user-facing notification. */
export async function persistTerminalNotificationAuthority(runId: string, userId: string): Promise<'complete' | 'error' | 'cancelled'> {
  return persistTerminalRunAuthority(runId,userId);
}

/**
 * POST /api/swarm/execute
 * SSE: start → progress → preview (code ready) → complete
 */
router.post('/execute', (req: AuthRequest, res) => withRunAttempt(async () => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Sign in required', code: 'UNAUTHORIZED' });
  }

  const prompt =
    (typeof req.body?.prompt === 'string' && req.body.prompt) ||
    (typeof req.body?.message === 'string' && req.body.message) ||
    '';
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : undefined;
  if (!prompt.trim() && !(attachments && attachments.length)) {
    return res.status(400).json({ error: 'prompt or attachments required' });
  }

  const history = Array.isArray(req.body?.history)
    ? (req.body.history as Array<{ role: 'user' | 'assistant'; content: string }>)
    : [];
  const projectId =
    typeof req.body?.projectId === 'string' ? req.body.projectId : undefined;
  const clientMeta =
    req.body?.clientMeta && typeof req.body.clientMeta === 'object'
      ? (req.body.clientMeta as Record<string, unknown>)
      : undefined;
  const wantStream = req.body?.stream !== false;
  // AI Product Builder: build against a durable builder project. Ownership is verified from the
  // issued identity before anything runs; the id in the body is never trusted on its own.
  const builderProjectId = typeof req.body?.builderProjectId === 'string' && req.body.builderProjectId ? req.body.builderProjectId : undefined;
  if (builderProjectId && !(await builderProjectExists(requireTenantContext(req.tenantContext), builderProjectId))) {
    return res.status(404).json({ error: 'Project not found.', code: 'PROJECT_NOT_FOUND' });
  }

  if(googleBackgroundSelected()){
    const runId=isValidClientRunId(req.body?.runId)?req.body.runId:randomUUID();
    try{return await enqueueGoogleSwarm(req,res,requireTenantContext(req.tenantContext),runId,
      {prompt:prompt.trim(),history,projectId,clientMeta,attachments},wantStream);}
    catch(error){
      if(error instanceof TenantAccessError)return res.status(error.status).json({error:error.message,code:error.code});
      if((error as {code?:string})?.code==='OUT_OF_TOKENS')return res.status(402).json({error:publicAiText((error as Error).message),code:'OUT_OF_ACTIONS',paymentLink:'/pricing'});
      return res.status(503).json({runId,error:'Durable execution admission is unavailable.',code:'RUN_ADMISSION_UNAVAILABLE'});
    }
  }

  if (!wantStream) {
    let builderRun: BuilderRunBinding | null = null;
    try {
      const plainRunId = randomUUID();
      builderRun = builderProjectId ? await openBuilderRun(requireTenantContext(req.tenantContext), builderProjectId, plainRunId) : null;
      const result = await runBuildPipeline({
        ...(builderRun ? { runId: plainRunId, builder: builderRun } : {}),
        userId,
        tenantContext:requireTenantContext(req.tenantContext),
        prompt: prompt.trim(),
        history,
        projectId,
        clientMeta,
        attachments,
      });
      if (builderRun) await closeBuilderRun(requireTenantContext(req.tenantContext), builderRun, { ok: result.success });
      await persistRunState(result.runId);
      const { route: _internalRoute, ...publicResult } = result;
      return res.json(publicAiPayload(publicResult));
    } catch (err) {
      if (builderRun) await closeBuilderRun(requireTenantContext(req.tenantContext), builderRun, { ok: false, cancelled: (err as { code?: string }).code === 'BUILD_CANCELLED', blocked: (err as { code?: string }).code === 'BUILDER_ENGINE_DISABLED', reason: (err as Error).message });
      if(err instanceof TenantAccessError)return res.status(err.status).json({error:err.message,code:err.code});
      const e = err as Error & { code?: string };
      if (e.code === 'OUT_OF_TOKENS' || e.code === 'PAID_PROVIDER_CAPACITY_UNAVAILABLE') {
        return res.status(402).json({
          error: publicAiText(e.message),
          code: 'OUT_OF_ACTIONS',
          paymentLink: '/pricing',
        });
      }
      return res.status(500).json({ error: publicAiText(e.message || 'Build failed') });
    }
  }

  initSSE(res);
  // The client generates and sends its own ID when it can, rather than waiting for
  // this response to hand one back. Production evidence: three consecutive builds
  // where the backend produced 25-49 real events each, and the browser received zero
  // bytes of the stream — a proxy or dropped connection between here and the browser,
  // with no fix on our side that guarantees delivery. Previously the client only
  // learned its own runId from the first SSE byte, so a stream that never delivers
  // anything left it with no ID to fall back to polling with — it could only wait
  // forever. A client-supplied ID (any v4-shaped UUID; a malformed one is ignored, not
  // trusted) means the browser always knows what to poll for, independent of whether
  // this connection ever delivers a single byte.
  const runId = isValidClientRunId(req.body?.runId) ? req.body.runId : randomUUID();

  if (activeBuildControllers.has(runId)) {
    sendSSE(res, {
      event: 'error',
      data: {
        error:
          'This build is already running. Reconnecting to the existing run.',
        code: 'RUN_ALREADY_ACTIVE',
        runId,
      },
    });
    endSSE(res);
    return;
  }

  let streamConnected = true;
  const keepalive = setInterval(() => {
    if (streamConnected && !res.writableEnded) {
      sendSSE(res, { event: 'progress', data: { keepalive: true, message: 'Working…' } });
    }
  }, 15_000);

  const ac = new AbortController();
  activeBuildControllers.set(runId, ac);
  let cancellationCheckActive = false;
  let cancellationAuthorityFailed = false;
  const cancellationWatch = setInterval(() => {
    if (ac.signal.aborted || cancellationCheckActive || !hasAdmittedRunAttempt(runId)) return;
    cancellationCheckActive = true;
    void isRunCancellationRequested(runId, userId)
      .then((cancelled) => {
        if (cancelled && !ac.signal.aborted) ac.abort();
      })
      .catch(() => {
        cancellationAuthorityFailed = true;
        ac.abort();
      })
      .finally(() => {
        cancellationCheckActive = false;
      });
  }, 1_500);
  cancellationWatch.unref?.();
  const detachDisconnectHandlers = bindBuildStreamDisconnect(req, res, () => {
    streamConnected = false;
    clearInterval(keepalive);
  });

  let builderRun: BuilderRunBinding | null = null;
  try {
    builderRun = builderProjectId ? await openBuilderRun(requireTenantContext(req.tenantContext), builderProjectId, runId) : null;
    sendSSE(res, {
      event: 'start',
      data: { runId, message: 'Xroga AI execution started', engine: 'xroga' },
    });
    sendSSE(res, {
      event: 'pipeline',
      data: {
        message: 'Understand → Build → Review → Security → Deploy → Verify',
        stage: 'init',
      },
    });

    const result = await runBuildPipeline({
      runId,
      userId,
      tenantContext:requireTenantContext(req.tenantContext),
      prompt: prompt.trim(),
      history,
      projectId,
      clientMeta,
      attachments,
      ...(builderRun ? { builder: builderRun } : {}),
      onProgress: (event) => {
        const recorded = appendRunEvent(runId, 'progress', event as Record<string, unknown>);
        if (streamConnected && !res.writableEnded) {
          sendSSE(res, {
            event: 'progress',
            data: publicAiPayload({ ...event, ...(recorded ? { sequence: recorded.sequence } : {}) }),
          });
        }
      },
      onDelta: (delta) => {
        if (streamConnected && !res.writableEnded) sendSSE(res, { event: 'delta', data: { delta: publicAiText(delta) } });
      },
      onCodeReady: (output) => {
        if (streamConnected && !res.writableEnded) {
          sendSSE(res, {
            event: 'preview',
            data: {
              success: true,
              shipPending: true,
              output: publicAiPayload(slimOutputForSse(output)),
            },
          });
        }
      },
      signal: ac.signal,
    });

    if (result.output?.type === 'landing_page') {
      const html = String(result.output.html ?? '');
      const css = String(result.output.css ?? '');
      const js = String(result.output.js ?? '');
      if (html.trim()) {
        const files = buildFullProjectFiles({
          html,
          css,
          js,
          projectName: String(result.output.projectName ?? 'Xroga Build'),
          userPrompt: prompt,
        });
        result.output.scaffoldPaths = files.map((f) => f.path);
      }
    }

    const output = result.output as Record<string, unknown>;
    if (builderRun) await closeBuilderRun(requireTenantContext(req.tenantContext), builderRun, { ok: result.success });
    if (cancellationAuthorityFailed) throw new Error('Run authority is unavailable. Retry after service recovery.');
    const terminalStatus = await persistTerminalNotificationAuthority(runId, userId);
    if (terminalStatus === 'cancelled') throw Object.assign(new Error('Build cancelled'), { code: 'BUILD_CANCELLED' });
    if (output.type === 'landing_page' && clientMeta?.assistantMessageId) {
      const generatedFiles = Array.isArray(output.generatedFiles) ? output.generatedFiles : [];
      const blockers = Array.isArray(output.shipBlockers)
        ? output.shipBlockers.filter((item): item is string => typeof item === 'string')
        : [];
      const hasVerifiedHandoff = output.fullyShipped === true || output.handoffReady === true;
      if (terminalStatus === 'complete' && result.success && hasVerifiedHandoff) {
        void notifyBuildComplete(requireTenantContext(req.tenantContext), {
          projectName: String(output.projectName ?? 'Xroga project'),
          prompt: prompt.trim(),
          githubRepoUrl: typeof output.githubRepoUrl === 'string' ? output.githubRepoUrl : undefined,
          githubPushConfirmed: output.githubPushConfirmed === true,
          fullyShipped: output.fullyShipped === true,
          handoffReady: output.handoffReady === true,
          deployUrl: typeof output.deployUrl === 'string' ? output.deployUrl : undefined,
          deployVerified: output.deployVerified === true,
          fileCount: generatedFiles.length || undefined,
          assistantMessageId: String(clientMeta.assistantMessageId),
        }).catch(() => {});
      } else {
        void notifyBuildFailed(requireTenantContext(req.tenantContext), {
          projectName: String(output.projectName ?? 'Xroga project'),
          prompt: prompt.trim(),
          error: blockers[0] || 'Build finished without verified GitHub and deployment evidence',
          assistantMessageId: String(clientMeta.assistantMessageId),
        }).catch(() => {});
      }
    }
    if (streamConnected && !res.writableEnded) {
      sendSSE(res, {
        event: 'complete',
        data: {
          runId: result.runId,
          success: result.success,
          featureCategory: result.featureCategory,
          output: publicAiPayload(slimOutputForSse(output)),
          tokenUsage: result.tokenUsage,
          followUps: result.followUps,
        },
      });
      endSSE(res);
    }
  } catch (err) {
    const e = (cancellationAuthorityFailed
      ? new Error('Run authority is unavailable. Retry after service recovery.')
      : err) as Error & { code?: string; nextUnlockAt?: string | null };
    const code =
      e instanceof TenantAccessError ? e.code :
      e.code === 'RUN_ALREADY_EXISTS' ? 'RUN_ALREADY_EXISTS' :
      e.code === 'OUT_OF_TOKENS'
        ? 'OUT_OF_ACTIONS'
        : e.code === 'PAID_PROVIDER_CAPACITY_UNAVAILABLE'
          ? 'CAPACITY_UNAVAILABLE'
        : e.code === 'MODEL_CAP_REACHED'
          ? 'MODEL_CAP_REACHED'
          : e.code === 'BUILD_CANCELLED'
            ? 'BUILD_CANCELLED'
            : e.code === 'RUN_ALREADY_ACTIVE'
              ? 'RUN_ALREADY_ACTIVE'
              : e.code === 'RUN_ALREADY_COMPLETE'
                ? 'RUN_ALREADY_COMPLETE'
                : e.code === 'RUN_NOT_FOUND'
                  ? 'RUN_NOT_FOUND'
                  : e.code === 'RUN_RESUME_CONFLICT'
                    ? 'RUN_RESUME_CONFLICT'
                    : 'BUILD_FAILED';

    const resumeControlError = e instanceof TenantAccessError || [
      'RUN_ALREADY_EXISTS',
      'RUN_ALREADY_ACTIVE',
      'RUN_ALREADY_COMPLETE',
      'RUN_NOT_FOUND',
      'RUN_RESUME_CONFLICT',
    ].includes(code);

    // CAPACITY_UNAVAILABLE is a pacing cap that lifts on its own — it is not a "buy
    // more" moment the way running out of the plan entirely is, so it does not carry
    // the same payment link, and nextUnlockAt (when the cap genuinely caused this) rides
    // along so the run knows when to say "try again" without naming a dollar amount.
    const nextUnlockAt = code === 'CAPACITY_UNAVAILABLE' ? e.nextUnlockAt ?? undefined : undefined;

    if (builderRun && !resumeControlError) {
      await closeBuilderRun(requireTenantContext(req.tenantContext), builderRun, { ok: false, cancelled: code === 'BUILD_CANCELLED', blocked: e.code === 'BUILDER_ENGINE_DISABLED', reason: e.message });
    }
    let failurePersisted = false;
    if (!resumeControlError) {
      failRun(runId, e.message || 'Build failed', code === 'BUILD_CANCELLED' ? 'cancelled' : 'error', {
        code,
        nextUnlockAt,
      });
      try {
        failurePersisted = await persistTerminalNotificationAuthority(runId, userId) === 'error';
      } catch {
        console.warn('[swarm] failed-run persistence unavailable');
      }
    }
    if (failurePersisted && clientMeta?.assistantMessageId && code !== 'BUILD_CANCELLED') {
      void notifyBuildFailed(requireTenantContext(req.tenantContext), {
        projectName: 'Xroga project',
        prompt: prompt.trim(),
        error: e.message || 'Build failed',
        assistantMessageId: String(clientMeta.assistantMessageId),
      }).catch(() => {});
    }
    if (streamConnected && !res.writableEnded) {
      sendSSE(res, {
        event: 'error',
        data: {
          error: publicAiText(e.message || 'Build failed'),
          code,
          nextUnlockAt,
          paymentLink: code === 'OUT_OF_ACTIONS' || code === 'MODEL_CAP_REACHED' ? '/pricing' : undefined,
        },
      });
      res.end();
    }
  } finally {
    clearInterval(keepalive);
    clearInterval(cancellationWatch);
    detachDisconnectHandlers();
    activeBuildControllers.delete(runId);
  }
}));

router.get('/history', async (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Sign in required' });
  const listed = await listRunsForUserAsync(userId);
  const runs = listed.map((r) => ({
    id: r.id,
    prompt: r.prompt,
    status: r.status,
    featureCategory: r.featureCategory,
    created_at: r.created_at,
    completed_at: r.completed_at,
    iteration_count: r.iteration_count,
  }));
  res.json(runs);
});

router.get('/runs/:runId', async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Sign in again and retry.' });
  const runId = String(req.params.runId || '');
  let run;
  try{run=await getRunAsync(runId,req.userId,googleBackgroundSelected());}
  catch{return res.status(503).json({error:'Durable run status is temporarily unavailable.',code:'RUN_STATUS_UNAVAILABLE'});}
  if (!run) {
    return res.json({
      id: runId,
      prompt: '',
      status: 'unknown',
      output: null,
      created_at: new Date().toISOString(),
      completed_at: null,
      iteration_count: 0,
      events: [],
      lastSequence: 0,
    });
  }
  if (req.userId && run.userId !== req.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const afterSequence = Math.max(0, Number(req.query.afterSequence ?? 0) || 0);
  res.json({
    id: run.id,
    prompt: run.prompt,
    status: run.status,
    output: publicAiPayload(run.output),
    featureCategory: run.featureCategory,
    tokenUsage: run.tokenUsage,
    created_at: run.created_at,
    completed_at: run.completed_at,
    iteration_count: run.iteration_count,
    messages: publicAiPayload(run.messages ?? []),
    events: publicAiPayload(run.events.filter((event) => event.sequence > afterSequence)),
    lastSequence: run.lastSequence,
  });
});

router.post('/runs/:runId/cancel', async (req: AuthRequest, res) => {
  if (!req.userId) return res.status(401).json({ error: 'Sign in again and retry.' });
  const runId = String(req.params.runId || '');
  const run = await getRunAsync(runId, req.userId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (!req.userId || run.userId !== req.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (run.status !== 'running' && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.json({ cancelled: false, status: run.status });
  }

  let cancelled: boolean;
  try {
    cancelled = await requestRunCancellation(runId, req.userId);
  } catch {
    return res.status(503).json({ cancelled: false, error: 'Cancellation could not be saved. Retry after service recovery.' });
  }
  const controller = activeBuildControllers.get(runId);
  if (cancelled) controller?.abort();
  res.json({
    cancelled,
    status: cancelled ? 'cancelled' : run.status,
  });
});

async function saveConversationHandler(req: AuthRequest, res: import('express').Response) {
  const runId = String(req.params.runId || '');
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (!runId) return res.status(400).json({ error: 'runId required' });

  let context;
  try { context = requireTenantContext(req.tenantContext); }
  catch { return res.status(401).json({ error: 'Sign in again and retry.' }); }

  // A cache hit is not permission to mutate another owner's run.
  const cached = getRun(runId);
  if (cached) {
    try { requireResourceOwner(context, cached.userId); }
    catch (error) {
      if (error instanceof TenantAccessError) return res.status(error.status).json({ error: error.message, code: error.code });
      throw error;
    }
    const saved = await saveConversation(runId, messages);
    return res.status(saved ? 200 : 503).json({ saved, persisted: saved });
  }

  // Not in memory. The run map is per-process and production runs more than one
  // machine, so this is ordinary — not a missing run. This used to fabricate a stub
  // run and complete it, which upserted on `id` and destroyed the real row: prompt,
  // created_at, the whole event transcript, and the actual outcome, replaced by an
  // empty chat marked complete. Write only the messages column instead.
  if (!req.userId) return res.status(401).json({ error: 'unauthorized' });
  const persisted = await persistConversationOnly(runId, req.userId, messages);
  return res.status(persisted ? 200 : 503).json({ saved: persisted, persisted });
}

router.post('/runs/:runId/conversation', saveConversationHandler);
router.patch('/runs/:runId/conversation', saveConversationHandler);

export default router;
