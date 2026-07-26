import { Router } from 'express';
import express from 'express';
import { BillingService } from '../services/BillingService.js';
import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '../config/supabase.js';

const router = Router();

/** Lemon Squeezy webhooks — primary path */
router.post(
  '/lemon-squeezy',
  express.raw({ type: 'application/json' }),
  async (req, res) => {
    const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : String(req.body);
    const signature = (req.headers['x-signature'] as string | undefined) ?? undefined;

    if (!process.env.LEMONSQUEEZY_WEBHOOK_SECRET) {
      res.status(503).json({ error: 'Webhook verification is not configured' });
      return;
    }
    {
      const valid = BillingService.verifyWebhookSignature(rawBody, signature);
      if (!valid) {
        console.warn('[billing/webhook] invalid Lemon Squeezy signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    let claimedDeliveryId: string | undefined;
    try {
      const event = JSON.parse(rawBody) as {
        meta?: { event_name?: string; custom_data?: Record<string, unknown> };
        data?: { type?: string; id?: string; attributes?: Record<string, unknown> };
      };
      const deliveryId = String(
        req.headers['x-event-id'] ?? event.data?.id ?? createHash('sha256').update(rawBody).digest('hex'),
      ).slice(0, 200);
      claimedDeliveryId = deliveryId;
      const payloadDigest = createHash('sha256').update(rawBody).digest('hex');
      const { error: insertError } = await getSupabaseAdmin().from('webhook_deliveries').insert({
        provider: 'lemon_squeezy', delivery_id: deliveryId, payload_digest: payloadDigest,
        status: 'processing',
      });
      if (insertError) {
        if (insertError.code === '23505') {
          res.status(200).json({ received: true, duplicate: true });
          return;
        }
        res.status(503).json({ error: 'Webhook delivery store unavailable' });
        return;
      }
      await BillingService.handleWebhookEvent(event);
      await getSupabaseAdmin().from('webhook_deliveries').update({
        status: 'completed', completed_at: new Date().toISOString(),
      }).eq('provider', 'lemon_squeezy').eq('delivery_id', deliveryId);
      res.json({ received: true });
    } catch (err) {
      if (claimedDeliveryId) {
        await getSupabaseAdmin().from('webhook_deliveries').update({
          status: 'failed', safe_error: 'processing_failed', completed_at: new Date().toISOString(),
        }).eq('provider', 'lemon_squeezy').eq('delivery_id', claimedDeliveryId);
      }
      console.error(JSON.stringify({
        level: 'error', event: 'billing_webhook_failed', deliveryId: claimedDeliveryId ?? null,
        errorClass: err instanceof SyntaxError ? 'invalid_json' : 'processing_failure',
      }));
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
