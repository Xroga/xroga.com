import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { runBuildPipeline } from '../ai/pipeline.js';
import { MODELS } from '../ai/models.js';
import { initSSE, sendSSE, endSSE } from '../lib/sse.js';
import { buildFullProjectFiles } from '../services/projectScaffold.js';
import {
  completeRun,
  createRun,
  getRun,
  listRunsForUser,
  saveConversation,
} from '../ai/runStore.js';

const router = Router();

/**
 * POST /api/swarm/execute
 * SSE stream: start → progress → delta* → complete
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
      return res.json(result);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'OUT_OF_TOKENS') {
        return res.status(402).json({
          error: e.message,
          code: 'OUT_OF_ACTIONS',
          paymentLink: '/pricing',
        });
      }
      return res.status(500).json({ error: e.message || 'Build failed' });
    }
  }

  initSSE(res);
  const keepalive = setInterval(() => {
    if (!res.writableEnded) {
      sendSSE(res, { event: 'progress', data: { keepalive: true, message: 'Working…' } });
    }
  }, 15_000);

  const abort = () => {
    clearInterval(keepalive);
  };
  req.on('close', abort);

  try {
    sendSSE(res, {
      event: 'start',
      data: { message: 'Xroga AI Swarm online', aiBackend: 'kimi-glm-deepseek-grok' },
    });
    sendSSE(res, {
      event: 'pipeline',
      data: { message: 'Converter → Builder → QA → Deploy', stage: 'init' },
    });

    const result = await runBuildPipeline({
      userId,
      prompt: prompt.trim(),
      history,
      projectId,
      clientMeta,
      attachments,
      onProgress: (event) => {
        sendSSE(res, { event: 'progress', data: { ...event } });
      },
      onDelta: (delta) => {
        sendSSE(res, { event: 'delta', data: { delta } });
      },
      signal: undefined,
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
      result.output.builderModel = MODELS[result.route.builder].label;
    }

    sendSSE(res, {
      event: 'complete',
      data: {
        runId: result.runId,
        success: result.success,
        featureCategory: result.featureCategory,
        output: result.output,
        tokenUsage: result.tokenUsage,
        followUps: result.followUps,
      },
    });
    clearInterval(keepalive);
    endSSE(res);
  } catch (err) {
    clearInterval(keepalive);
    const e = err as Error & { code?: string };
    const code =
      e.code === 'OUT_OF_TOKENS'
        ? 'OUT_OF_ACTIONS'
        : e.code === 'MODEL_CAP_REACHED'
          ? 'MODEL_CAP_REACHED'
          : 'BUILD_FAILED';
    sendSSE(res, {
      event: 'error',
      data: {
        error: e.message || 'Build failed',
        code,
        paymentLink:
          code === 'OUT_OF_ACTIONS' || code === 'MODEL_CAP_REACHED' ? '/pricing' : undefined,
      },
    });
    if (!res.writableEnded) res.end();
  }
});

router.get('/history', (req: AuthRequest, res) => {
  const userId = req.userId;
  if (!userId) return res.status(401).json({ error: 'Sign in required' });
  const runs = listRunsForUser(userId).map((r) => ({
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

router.get('/runs/:runId', (req: AuthRequest, res) => {
  const runId = String(req.params.runId || '');
  const run = getRun(runId);
  if (!run) {
    return res.json({
      id: runId,
      prompt: '',
      status: 'unknown',
      output: null,
      created_at: new Date().toISOString(),
      completed_at: null,
      iteration_count: 0,
    });
  }
  if (req.userId && run.userId !== req.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.json({
    id: run.id,
    prompt: run.prompt,
    status: run.status,
    output: run.output,
    featureCategory: run.featureCategory,
    created_at: run.created_at,
    completed_at: run.completed_at,
    iteration_count: run.iteration_count,
    messages: run.messages ?? [],
  });
});

function saveConversationHandler(req: AuthRequest, res: import('express').Response) {
  const runId = String(req.params.runId || '');
  const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  if (!runId) return res.status(400).json({ error: 'runId required' });

  // Ensure a stub run exists so conversation can attach
  if (!getRun(runId) && req.userId) {
    createRun(req.userId, '', runId);
    completeRun(runId, { output: { type: 'chat', content: '' }, success: true });
  }

  const saved = saveConversation(runId, messages);
  res.json({ saved: true, persisted: saved });
}

router.post('/runs/:runId/conversation', saveConversationHandler);
router.patch('/runs/:runId/conversation', saveConversationHandler);

export default router;
