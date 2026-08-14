import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { AuthRequest } from '../middleware/auth.js';
import { runBuildPipeline } from '../ai/pipeline.js';
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
} from '../ai/runStore.js';

const router = Router();
const activeBuildControllers = new Map<string, AbortController>();

/**
 * POST /api/swarm/execute
 * SSE: start → progress → preview (code ready) → complete
 */
router.post('/execute', async (req: AuthRequest, res) => {
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

  if (!wantStream) {
    try {
      const result = await runBuildPipeline({
        userId,
        prompt: prompt.trim(),
        history,
        projectId,
        clientMeta,
        attachments,
      });
      const { route: _internalRoute, ...publicResult } = result;
      return res.json(publicAiPayload(publicResult));
    } catch (err) {
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
  let streamConnected = true;
  const keepalive = setInterval(() => {
    if (streamConnected && !res.writableEnded) {
      sendSSE(res, { event: 'progress', data: { keepalive: true, message: 'Working…' } });
    }
  }, 15_000);

  const ac = new AbortController();
  activeBuildControllers.set(runId, ac);
  let cancellationCheckActive = false;
  const cancellationWatch = setInterval(() => {
    if (ac.signal.aborted || cancellationCheckActive) return;
    cancellationCheckActive = true;
    void isRunCancellationRequested(runId)
      .then((cancelled) => {
        if (cancelled && !ac.signal.aborted) ac.abort();
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

  try {
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
      prompt: prompt.trim(),
      history,
      projectId,
      clientMeta,
      attachments,
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
    if (output.type === 'landing_page' && clientMeta?.assistantMessageId) {
      const generatedFiles = Array.isArray(output.generatedFiles) ? output.generatedFiles : [];
      const blockers = Array.isArray(output.shipBlockers)
        ? output.shipBlockers.filter((item): item is string => typeof item === 'string')
        : [];
      const hasVerifiedHandoff = output.fullyShipped === true || output.handoffReady === true;
      if (result.success && hasVerifiedHandoff) {
        void notifyBuildComplete(userId, {
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
        void notifyBuildFailed(userId, {
          projectName: String(output.projectName ?? 'Xroga project'),
          prompt: prompt.trim(),
          error: blockers[0] || 'Build finished without verified GitHub and deployment evidence',
          assistantMessageId: String(clientMeta.assistantMessageId),
        }).catch(() => {});
      }
    }
    await persistRunState(runId);
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
    const e = err as Error & { code?: string; nextUnlockAt?: string | null };
    const code =
      e.code === 'OUT_OF_TOKENS'
        ? 'OUT_OF_ACTIONS'
        : e.code === 'PAID_PROVIDER_CAPACITY_UNAVAILABLE'
          ? 'CAPACITY_UNAVAILABLE'
        : e.code === 'MODEL_CAP_REACHED'
          ? 'MODEL_CAP_REACHED'
          : e.code === 'BUILD_CANCELLED'
            ? 'BUILD_CANCELLED'
            : 'BUILD_FAILED';
    // CAPACITY_UNAVAILABLE is a pacing cap that lifts on its own — it is not a "buy
    // more" moment the way running out of the plan entirely is, so it does not carry
    // the same payment link, and nextUnlockAt (when the cap genuinely caused this) rides
    // along so the run knows when to say "try again" without naming a dollar amount.
    const nextUnlockAt = code === 'CAPACITY_UNAVAILABLE' ? e.nextUnlockAt ?? undefined : undefined;
    failRun(runId, e.message || 'Build failed', code === 'BUILD_CANCELLED' ? 'cancelled' : 'error', {
      code,
      nextUnlockAt,
    });
    await persistRunState(runId).catch((persistError) => {
      console.warn('[swarm] failed-run persistence:', (persistError as Error).message);
    });
    if (clientMeta?.assistantMessageId && code !== 'BUILD_CANCELLED') {
      void notifyBuildFailed(userId, {
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
});

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
  const runId = String(req.params.runId || '');
  const run = await getRunAsync(runId);
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
  const runId = String(req.params.runId || '');
  const run = await getRunAsync(runId);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  if (!req.userId || run.userId !== req.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if (run.status !== 'running') {
    return res.json({ cancelled: false, status: run.status });
  }

  const cancelled = await requestRunCancellation(runId, req.userId);
  const controller = activeBuildControllers.get(runId);
  controller?.abort();
  res.json({
    cancelled: cancelled || Boolean(controller),
    status: cancelled || controller ? 'cancelled' : run.status,
  });
});

async function saveConversationHandler(req: AuthRequest, res: import('express').Response) {
  const runId = String(req.params.runId || '');
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (!runId) return res.status(400).json({ error: 'runId required' });

  // In memory: the normal path, on the machine that owns the run.
  if (getRun(runId)) {
    const saved = saveConversation(runId, messages);
    return res.json({ saved: true, persisted: saved });
  }

  // Not in memory. The run map is per-process and production runs more than one
  // machine, so this is ordinary — not a missing run. This used to fabricate a stub
  // run and complete it, which upserted on `id` and destroyed the real row: prompt,
  // created_at, the whole event transcript, and the actual outcome, replaced by an
  // empty chat marked complete. Write only the messages column instead.
  if (!req.userId) return res.status(401).json({ error: 'unauthorized' });
  const persisted = await persistConversationOnly(runId, req.userId, messages);
  return res.json({ saved: true, persisted });
}

router.post('/runs/:runId/conversation', saveConversationHandler);
router.patch('/runs/:runId/conversation', saveConversationHandler);

export default router;
