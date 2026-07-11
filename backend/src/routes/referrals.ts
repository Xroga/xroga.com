import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import {
  applyReferralCode,
  getReferralSummary,
  processRetentionBonuses,
} from '../services/referralService.js';

const router = Router();

router.get('/summary', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  await processRetentionBonuses(userId);
  const summary = await getReferralSummary(userId);
  res.json(summary);
});

router.post('/apply', async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const code = typeof req.body?.code === 'string' ? req.body.code : '';
  if (!code.trim()) {
    res.status(400).json({ success: false, message: 'Referral code is required.' });
    return;
  }
  const result = await applyReferralCode(userId, code);
  res.status(result.success ? 200 : 400).json(result);
});

export default router;
