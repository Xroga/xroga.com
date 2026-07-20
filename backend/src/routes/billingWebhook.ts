import { Router } from 'express';
import express from 'express';
import { BillingService } from '../services/BillingService.js';

const router = Router();

/** Lemon Squeezy webhooks — primary path */
router.post(
  '/lemon-squeezy',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body);
    const signature = (req.headers['x-signature'] as string | undefined) ?? undefined;

    if (process.env.LEMONSQUEEZY_WEBHOOK_SECRET) {
      const valid = BillingService.verifyWebhookSignature(rawBody, signature);
      if (!valid) {
        console.warn('[billing/webhook] invalid Lemon Squeezy signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    try {
      const event = JSON.parse(rawBody) as {
        meta?: { event_name?: string; custom_data?: Record<string, unknown> };
        data?: { type?: string; id?: string; attributes?: Record<string, unknown> };
      };
      await BillingService.handleWebhookEvent(event);
      res.json({ received: true });
    } catch (err) {
      console.error('[billing/webhook]', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  },
);

/** @deprecated Paddle removed — return gone so old dashboard hooks fail loudly */
router.post('/paddle', express.raw({ type: 'application/json' }), (_req, res) => {
  res.status(410).json({
    error: 'Paddle billing removed. Use Lemon Squeezy webhook: POST /api/billing/webhook/lemon-squeezy',
  });
});

export default router;
