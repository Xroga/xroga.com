import { Router } from 'express';
import { z } from 'zod';
import { BillingService } from '../services/BillingService.js';
import type { AuthRequest } from '../middleware/auth.js';
import type { PlanTier } from '../types/index.js';
import {
  activateLaunchPromotion,
  getProviderEntitlementStatus,
  setUsagePacing,
} from '../ai/providerBudget.js';

const router = Router();

const checkoutSchema = z.object({
  planTier: z.literal('spark'),
});

const pacingSchema = z.object({
  pacing: z.enum(['balanced_month', 'full_access']),
  confirmed: z.boolean().default(false),
});

router.get('/plans', (_req, res) => {
  res.json({ plans: BillingService.listPlans() });
});

router.get('/status', (_req, res) => {
  res.json(BillingService.billingStatus());
});

router.get('/entitlement', async (req: AuthRequest, res) => {
  try {
    res.json(await getProviderEntitlementStatus(req.userId!));
  } catch {
    res.status(503).json({ error: 'Billing entitlement is temporarily unavailable', code: 'BILLING_UNAVAILABLE' });
  }
});

router.post('/promotion/activate', async (req: AuthRequest, res) => {
  try {
    await activateLaunchPromotion(req.userId!);
    res.status(201).json(await getProviderEntitlementStatus(req.userId!));
  } catch (error) {
    const message = (error as Error).message;
    const closed = /window_closed/i.test(message);
    res.status(closed ? 409 : 503).json({
      error: closed ? 'The launch promotion activation window has closed' : 'Promotion activation is temporarily unavailable',
      code: closed ? 'PROMOTION_WINDOW_CLOSED' : 'BILLING_UNAVAILABLE',
    });
  }
});

router.post('/pacing', async (req: AuthRequest, res) => {
  const parsed = pacingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  if (parsed.data.pacing === 'full_access' && !parsed.data.confirmed) {
    res.status(409).json({ error: 'Full Access requires explicit confirmation', code: 'CONFIRMATION_REQUIRED' });
    return;
  }
  try {
    res.json(await setUsagePacing(req.userId!, parsed.data.pacing, parsed.data.confirmed));
  } catch {
    res.status(409).json({ error: 'Usage pacing could not be updated', code: 'PACING_UPDATE_REJECTED' });
  }
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
