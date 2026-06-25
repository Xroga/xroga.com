import { Router } from 'express';
import { z } from 'zod';
import { SwarmService, handleInsufficientActions } from '../services/SwarmService.js';
import { InsufficientActionsError } from '../errors/InsufficientActionsError.js';
import { initSSE, endSSE } from '../lib/sse.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

const executeSchema = z.object({
  prompt: z.string().min(1).max(10000),
  projectId: z.string().uuid().optional(),
  stream: z.boolean().optional(),
});

/**
 * Swarm execute – triggers Phase 2 feature routing via Natural Language Command.
 * Supports SSE streaming for Real-Time Progress Updates (Feature #6).
 */
router.post('/execute', async (req: AuthRequest, res) => {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const wantsStream =
    parsed.data.stream === true ||
    req.query.stream === 'true' ||
    req.headers.accept?.includes('text/event-stream');

  if (wantsStream) {
    initSSE(res);
    try {
      await SwarmService.runWithSSE(
        req.userId!,
        parsed.data.prompt,
        res,
        parsed.data.projectId
      );
      endSSE(res);
    } catch (err) {
      if (err instanceof InsufficientActionsError) {
        res.write(`event: error\ndata: ${JSON.stringify(err.toJSON())}\n\n`);
      } else {
        const message = (err as Error).message;
        res.write(`event: error\ndata: ${JSON.stringify({ error: message, code: 'SWARM_ERROR' })}\n\n`);
      }
      res.end();
    }
    return;
  }

  try {
    const result = await SwarmService.run(req.userId!, parsed.data.prompt, parsed.data.projectId);
    res.json(result);
  } catch (err) {
    if (err instanceof InsufficientActionsError) {
      handleInsufficientActions(res, err);
      return;
    }
    const message = (err as Error).message;
    if (message.includes('Insufficient actions')) {
      res.status(402).json({ error: message, code: 'OUT_OF_ACTIONS' });
      return;
    }
    res.status(500).json({ error: message });
  }
});

router.get('/runs/:runId', async (req: AuthRequest, res) => {
  try {
    const runId = String(req.params.runId);
    const run = await SwarmService.getRun(req.userId!, runId);
    res.json(run);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

router.get('/runs/:runId/status', async (req: AuthRequest, res) => {
  try {
    const runId = String(req.params.runId);
    const status = await SwarmService.getStatus(req.userId!, runId);
    res.json(status);
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

export default router;
