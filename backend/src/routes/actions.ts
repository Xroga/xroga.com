import { Router } from 'express';
import { z } from 'zod';
import { ActionService } from '../services/ActionService.js';
import { ACTION_COSTS } from '../types/index.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get('/balance', async (req: AuthRequest, res) => {
  try {
    const balance = await ActionService.getBalance(req.userId!);
    if (!balance) {
      res.status(404).json({ error: 'Actions record not found' });
      return;
    }
    res.json(balance);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get('/costs', (_req, res) => {
  res.json(ACTION_COSTS);
});

router.post('/deduct', async (req: AuthRequest, res) => {
  const schema = z.object({
    taskType: z.enum([
      'chat', 'translate', 'image', 'code_fix', 'scrape', '3d_model',
      'voice', 'website', 'desktop_app', 'mobile_app', 'video', 'research', 'game',
    ]),
    projectId: z.string().uuid().optional(),
    description: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await ActionService.deduct(req.userId!, parsed.data.taskType, {
      projectId: parsed.data.projectId,
      description: parsed.data.description,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/check', async (req: AuthRequest, res) => {
  const schema = z.object({
    taskType: z.enum([
      'chat', 'translate', 'image', 'code_fix', 'scrape', '3d_model',
      'voice', 'website', 'desktop_app', 'mobile_app', 'video', 'research', 'game',
    ]),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const cost = ActionService.getCost(parsed.data.taskType);
  const canAfford = await ActionService.canAfford(req.userId!, cost);
  const balance = await ActionService.getBalance(req.userId!);

  res.json({ canAfford, cost, remaining: balance?.remaining ?? 0 });
});

export default router;
