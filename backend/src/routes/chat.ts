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
 * Natural Language Command (#1)
 * Dynamically instantiates the Swarm, routes via Architect, streams progress via SSE.
 */
router.post('/', async (req: AuthRequest, res) => {
  const parsed = executeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const wantsStream =
    parsed.data.stream === true ||
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
        res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
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
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
