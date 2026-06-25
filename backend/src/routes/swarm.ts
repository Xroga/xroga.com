import { Router } from 'express';
import { z } from 'zod';
import { SwarmService } from '../services/SwarmService.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

router.post('/execute', async (req: AuthRequest, res) => {
  const schema = z.object({
    prompt: z.string().min(1).max(10000),
    projectId: z.string().uuid().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
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
