import { Router } from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { createSupabaseClient, getSupabaseAdmin } from '../config/supabase.js';
import {
  createCheckoutSession,
  createCustomerPortal,
  cancelSubscription,
  handlePaddleWebhook,
  verifyPaddleWebhook,
} from '../services/billing/paddle.js';
import {
  createCryptoCharge,
  handleCryptoWebhook,
  verifyCoinbaseWebhook,
} from '../services/billing/crypto.js';
import { CRYPTO_ACTION_PACKS } from '../config/plans.js';
import type { PlanTier } from '../types/index.js';
import type { BillingRegion } from '../config/plans.js';

const router = Router();

router.post('/create-checkout', async (req: AuthRequest, res) => {
  try {
    const { planId, region = 'global' } = req.body as { planId: PlanTier; region?: BillingRegion };
    if (!planId) return res.status(400).json({ error: 'planId is required' });

    const supabase = createSupabaseClient(req.accessToken!);
    const { data: { user } } = await supabase.auth.getUser();
    const email = user?.email ?? '';

    const { checkoutUrl } = await createCheckoutSession(req.userId!, email, planId, region);
    res.json({ checkoutUrl });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.post('/portal', async (req: AuthRequest, res) => {
  try {
    const { portalUrl } = await createCustomerPortal(req.userId!);
    res.json({ portalUrl });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get('/subscription', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();

  const { data: actions } = await supabase
    .from('user_actions')
    .select('*')
    .eq('user_id', req.userId!)
    .single();

  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', req.userId!)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: customer } = await supabase
    .from('billing_customers')
    .select('paddle_customer_id, email')
    .eq('user_id', req.userId!)
    .maybeSingle();

  res.json({
    planTier: actions?.plan_tier ?? 'spark',
    subscriptionStatus: actions?.subscription_status ?? 'trial',
    isTrial: actions?.is_trial ?? true,
    trialExpiresAt: actions?.trial_expires_at,
    renewalDate: actions?.renewal_date ?? actions?.reset_date,
    subscription,
    paymentMethod: customer ? { last4: '••••', brand: 'card' } : null,
  });
});

router.get('/invoices', async (req: AuthRequest, res) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .eq('user_id', req.userId!)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return res.status(500).json({ error: error.message });
  res.json(data ?? []);
});

router.post('/cancel', async (req: AuthRequest, res) => {
  try {
    await cancelSubscription(req.userId!);
    res.json({ canceled: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

router.get('/crypto-packs', (_req, res) => {
  res.json(CRYPTO_ACTION_PACKS);
});

router.post('/crypto/create-charge', async (req: AuthRequest, res) => {
  try {
    const { packId } = req.body as { packId: string };
    const result = await createCryptoCharge(req.userId!, packId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export const paddleWebhookHandler = async (req: AuthRequest, res: import('express').Response) => {
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const signature = req.headers['paddle-signature'] as string | undefined;

  if (!verifyPaddleWebhook(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const eventType = payload.event_type ?? payload.alert_name ?? '';
    const data = payload.data ?? payload;
    await handlePaddleWebhook(eventType, data);
    res.json({ received: true });
  } catch (err) {
    console.error('Paddle webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

export const cryptoWebhookHandler = async (req: AuthRequest, res: import('express').Response) => {
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  const signature = req.headers['x-cc-webhook-signature'] as string | undefined;

  if (!verifyCoinbaseWebhook(rawBody, signature)) {
    return res.status(401).json({ error: 'Invalid webhook signature' });
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    await handleCryptoWebhook(payload.event ?? payload);
    res.json({ received: true });
  } catch (err) {
    console.error('Crypto webhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

export default router;
