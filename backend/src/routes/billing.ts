import { Router } from 'express';
import { z } from 'zod';
import { BillingService } from '../services/BillingService.js';
import type { AuthRequest } from '../middleware/auth.js';
import type { PlanTier } from '../types/index.js';

const router = Router();

const checkoutSchema = z.object({
  planTier: z.enum(['spark', 'pulse', 'nova', 'zenith', 'singularity']),
});

router.get('/plans', (_req, res) => {
  res.json({ plans: BillingService.listPlans() });
});

router.get('/status', (_req, res) => {
  res.json(BillingService.billingStatus());
});

router.post('/create-checkout', async (req: AuthRequest, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await BillingService.createCheckout(
      req.userId!,
      parsed.data.planTier as PlanTier,
      req.userEmail
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
