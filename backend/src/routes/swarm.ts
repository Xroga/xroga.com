import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { runBuildPipeline } from '../ai/pipeline.js';
import { MODELS } from '../ai/models.js';
import { initSSE, sendSSE, endSSE } from '../lib/sse.js';
import { buildFullProjectFiles } from '../services/projectScaffold.js';

const router = Router();

/**
 * POST /api/swarm/execute
 * SSE stream: start → progress → delta* → complete
 * Converter (deepseek/deepseek-v4-flash via OpenRouter) → Builder (Kimi / GLM / DeepSeek Pro / Grok)
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
  if (!prompt.trim()) {
    return res.status(400).json({ error: 'prompt is required' });
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
      data: { message: 'Converter → Builder pipeline', stage: 'init' },
    });

    const result = await runBuildPipeline({
      userId,
      prompt: prompt.trim(),
      history,
      projectId,
      clientMeta,
      onProgress: (event) => {
        sendSSE(res, { event: 'progress', data: { ...event } });
      },
      onDelta: (delta) => {
        sendSSE(res, { event: 'delta', data: { delta } });
      },
      signal: undefined,
    });

    // Attach scaffold paths for GitHub push helpers (no fake deploy URLs)
    if (result.output?.type === 'landing_page') {
      const html = String(result.output.html ?? '');
      const css = String(result.output.css ?? '');
      const js = String(result.output.js ?? '');
      const files = buildFullProjectFiles({
        html,
        css,
        js,
        projectName: String(result.output.projectName ?? 'Xroga Build'),
        userPrompt: prompt,
      });
      result.output.scaffoldPaths = files.map((f) => f.path);
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
    const code = e.code === 'OUT_OF_TOKENS' ? 'OUT_OF_ACTIONS' : 'BUILD_FAILED';
    sendSSE(res, {
      event: 'error',
      data: {
        error: e.message || 'Build failed',
        code,
        paymentLink: code === 'OUT_OF_ACTIONS' ? '/pricing' : undefined,
      },
    });
    if (!res.writableEnded) res.end();
  }
});

router.get('/history', (_req, res) => {
  res.json([]);
});

router.get('/runs/:runId', (req, res) => {
  res.json({
    id: req.params.runId,
    prompt: '',
    status: 'unknown',
    output: null,
    created_at: new Date().toISOString(),
    completed_at: null,
    iteration_count: 0,
  });
});

router.post('/runs/:runId/conversation', (_req, res) => {
  res.json({ saved: true });
});

export default router;
