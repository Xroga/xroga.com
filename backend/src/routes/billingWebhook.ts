import { Router } from 'express';
import express from 'express';
import { BillingService } from '../services/BillingService.js';

const router = Router();

router.post(
  '/paddle',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body);
    const signature = req.headers['paddle-signature'] as string | undefined;

    if (process.env.PADDLE_WEBHOOK_SECRET) {
      const valid = BillingService.verifyWebhookSignature(rawBody, signature);
      if (!valid) {
        console.warn('[billing/webhook] invalid Paddle signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    try {
      const event = JSON.parse(rawBody) as { event_type?: string; data?: Record<string, unknown> };
      await BillingService.handleWebhookEvent(event);
      res.json({ received: true });
    } catch (err) {
      console.error('[billing/webhook]', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

export default router;
