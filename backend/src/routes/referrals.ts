import { Router } from 'express';
import { z } from 'zod';
import type { AuthRequest } from '../middleware/auth.js';
import { applyReferralCode, getReferralSummary } from '../services/referralService.js';

const router = Router();
router.get('/summary', async (req: AuthRequest, res) => {
  try { res.json(await getReferralSummary(req.userId!)); }
  catch { res.status(503).json({ error: 'Referral evidence is unavailable', code: 'referral_unavailable' }); }
});
router.post('/apply', async (req: AuthRequest, res) => {
  const value = z.object({ code: z.string().min(1).max(32) }).safeParse(req.body);
  if (!value.success) { res.status(400).json({ success: false, message: 'Referral code is required.' }); return; }
  try { const result = await applyReferralCode(req.userId!, value.data.code); res.status(result.success ? 200 : 400).json(result); }
  catch { res.status(503).json({ success: false, message: 'Referral service is unavailable.' }); }
});
export default router;
