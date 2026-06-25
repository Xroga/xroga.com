import { Router } from 'express';
import { z } from 'zod';
import { SwarmService } from '../services/SwarmService.js';
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
      const message = (err as Error).message;
      if (message.includes('Insufficient actions')) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: message, code: 'OUT_OF_ACTIONS' })}\n\n`);
      } else {
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
    const message = (err as Error).message;
    if (message.includes('Insufficient actions')) {
      res.status(402).json({ error: message, code: 'OUT_OF_ACTIONS' });
      return;
    }
    res.status(500).json({ error: message });
  }
});

export default router;
