import { Router } from 'express';
import { z } from 'zod';
import { initSSE, endSSE, sendSSE } from '../lib/sse.js';
import { ActionService } from '../services/ActionService.js';
import { computeVideoActionCost, parseVideoDuration } from '../services/media/videoUtils.js';
import { omniPhaseToVideoStep } from '../services/omniReality/omniEvents.js';
import { sanitizeErrorForUser } from '../lib/sanitizeUserResponse.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

const generateSchema = z.object({
  prompt: z.string().min(1).max(10000),
  projectId: z.string().uuid().optional(),
  duration: z.number().min(3).max(300).optional(),
});

/**
 * Dedicated Omni-Reality video generation with SSE streaming.
 * POST /api/video/generate?stream=true
 */
router.post('/generate', async (req: AuthRequest, res) => {
  const parsed = generateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request — provide a video prompt.' });
    return;
  }

  const userId = req.userId!;
  const prompt = parsed.data.prompt;
  const duration = parsed.data.duration ?? parseVideoDuration(prompt);
  const actionCost = computeVideoActionCost(duration);

  const deduct = await ActionService.deduct(userId, 'video', { customCost: actionCost });
  if (!deduct.success) {
    res.status(402).json({
      error: deduct.error ?? 'Insufficient actions',
      remaining: deduct.remaining,
      cost: actionCost,
    });
    return;
  }

  const wantsStream =
    req.query.stream === 'true' || req.headers.accept?.includes('text/event-stream');

  if (wantsStream) {
    initSSE(res);
    const runId = crypto.randomUUID();

    try {
      sendSSE(res, { event: 'start', data: { runId, prompt: prompt.slice(0, 200), duration } });

      const { produceOmniVideo } = await import('../services/omniReality/videoProduction.js');
      const output = await produceOmniVideo({
        userId,
        prompt,
        projectId: parsed.data.projectId,
        runId,
        onOmniEvent: (event) => {
          sendSSE(res, {
            event: 'omni',
            data: {
              phase: event.phase,
              message: event.message,
              detail: event.detail,
              videoStep: omniPhaseToVideoStep(event.phase),
              sceneIndex: event.sceneIndex,
              sceneTotal: event.sceneTotal,
              provider: event.provider,
            },
          });
        },
        onProgress: (step, message, detail) => {
          sendSSE(res, {
            event: 'progress',
            data: { videoStep: step, message: detail ?? message },
          });
        },
      });

      sendSSE(res, {
        event: 'complete',
        data: { success: true, output, featureCategory: 'video_studio' },
      });
      endSSE(res);
    } catch (err) {
      sendSSE(res, {
        event: 'error',
        data: { message: sanitizeErrorForUser(err) },
      });
      res.end();
    }
    return;
  }

  try {
    const { produceOmniVideo } = await import('../services/omniReality/videoProduction.js');
    const output = await produceOmniVideo({
      userId,
      prompt,
      projectId: parsed.data.projectId,
    });
    res.json({ success: true, output });
  } catch (err) {
    res.status(500).json({ error: sanitizeErrorForUser(err) });
  }
});

export default router;
