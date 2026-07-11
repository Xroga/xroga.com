import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import {
  confirmDistribution,
  getDistributionPreview,
} from '../services/tokenDistributionService.js';

const router = Router();

router.get('/preview', async (req: AuthRequest, res) => {
  const preview = await getDistributionPreview(req.userId!);
  res.json(preview);
});

router.post('/confirm', async (req: AuthRequest, res) => {
  const rollover = Boolean(req.body?.rollover);
  const shareTarget = req.body?.shareTarget as 'community' | 'friends' | 'team' | undefined;
  const result = await confirmDistribution(req.userId!, { rollover, shareTarget });
  res.status(result.success ? 200 : 400).json(result);
});

export default router;
