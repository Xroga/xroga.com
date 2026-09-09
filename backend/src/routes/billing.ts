import { Router, type Response } from 'express';
import { z } from 'zod';
import { BillingService, BillingServiceError } from '../services/BillingService.js';
import type { AuthRequest } from '../middleware/auth.js';
import {
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

router.get('/status', async (req: AuthRequest, res) => {
  try {
    res.json(await BillingService.getUserBillingStatus(req.userId!));
  } catch {
    res.status(503).json({ error: 'Billing status is temporarily unavailable', code: 'BILLING_UNAVAILABLE' });
  }
});

router.get('/entitlement', async (req: AuthRequest, res) => {
  try {
    res.json((await BillingService.getUserBillingStatus(req.userId!)).entitlement);
  } catch {
    res.status(503).json({ error: 'Billing entitlement is temporarily unavailable', code: 'BILLING_UNAVAILABLE' });
  }
});

router.post('/promotion/activate', (_req, res) => {
  res.status(410).json({ error: 'Launch promotion activation has ended', code: 'PROMOTION_ENDED' });
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

async function createCheckout(req: AuthRequest, res: Response) {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  try {
    const result = await BillingService.createCheckout(req.userId!);
    res.json(result);
  } catch (err) {
    if (err instanceof BillingServiceError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Checkout could not be created', code: 'billing_failure' });
  }
}

router.post('/checkout', createCheckout);
router.post('/create-checkout', createCheckout);

async function manageSubscription(req: AuthRequest, res: Response) {
  try {
    res.json(await BillingService.createCustomerPortal(req.userId!));
  } catch (err) {
    if (err instanceof BillingServiceError) {
      res.status(err.statusCode).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Subscription management could not be opened', code: 'billing_failure' });
  }
}

router.post('/manage', manageSubscription);
router.post('/portal', manageSubscription);

export default router;
