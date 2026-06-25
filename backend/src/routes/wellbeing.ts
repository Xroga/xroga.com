import { Router } from 'express';
import { z } from 'zod';
import { SwarmService, handleInsufficientActions } from '../services/SwarmService.js';
import { InsufficientActionsError } from '../errors/InsufficientActionsError.js';
import type { AuthRequest } from '../middleware/auth.js';

const router = Router();

const protectSchema = z.object({
  deviceName: z.string().max(100).optional(),
});

/**
 * Adult Content Blocker (#71)
 * POST /api/wellbeing/protect
 */
router.post('/protect', async (req: AuthRequest, res) => {
  const parsed = protectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await SwarmService.run(
      req.userId!,
      'Enable adult content blocker and Cloudflare family DNS protection',
      undefined,
      undefined,
      { extras: { deviceName: parsed.data.deviceName } }
    );

    const output = result.result.output as { status?: string; deviceId?: string; dns?: unknown; onnx?: unknown };

    res.json({
      status: output.status ?? 'Protection active on this device.',
      deviceId: output.deviceId,
      dns: output.dns,
      onnx: output.onnx,
      actions: result.actions,
    });
  } catch (err) {
    if (err instanceof InsufficientActionsError) {
      handleInsufficientActions(res, err);
      return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
