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
        const eventName = String(req.headers['x-event-name'] ?? '').slice(0, 100);
        if (
          /^[a-f0-9]{64}$/i.test(signature ?? '')
          && /^(order_created|subscription_(created|updated|cancelled|expired|payment_success))$/.test(eventName)
        ) {
          const payloadDigest = createHash('sha256').update(rawBody).digest('hex');
          await getSupabaseAdmin().from('webhook_deliveries').insert({
            provider: 'lemon_squeezy', delivery_id: `invalid:${payloadDigest}`,
            payload_digest: payloadDigest, status: 'failed', safe_error: 'invalid_signature',
            event_type: eventName, signature_verified: false, response_status: 401,
            completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          });
        }
        console.warn('[billing/webhook] invalid Lemon Squeezy signature');
        res.status(401).json({ error: 'Invalid signature' });
        return;
      }
    }

    let claimedDeliveryId: string | undefined;
    try {
      const event = JSON.parse(rawBody) as {
        meta?: { event_name?: string; event_id?: string; custom_data?: Record<string, unknown> };
        data?: { type?: string; id?: string; attributes?: Record<string, unknown> };
      };
      const deliveryId = String(
        req.headers['x-event-id'] ?? event.meta?.event_id ?? createHash('sha256').update(rawBody).digest('hex'),
      ).slice(0, 200);
      claimedDeliveryId = deliveryId;
      const payloadDigest = createHash('sha256').update(rawBody).digest('hex');
      const { error: insertError } = await getSupabaseAdmin().from('webhook_deliveries').insert({
        provider: 'lemon_squeezy', delivery_id: deliveryId, payload_digest: payloadDigest,
        status: 'processing', event_type: event.meta?.event_name ?? null,
        signature_verified: true, response_status: null,
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
        status: 'completed', response_status: 200,
        completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq('provider', 'lemon_squeezy').eq('delivery_id', deliveryId);
      res.json({ received: true });
    } catch (err) {
      if (claimedDeliveryId) {
        await getSupabaseAdmin().from('webhook_deliveries').update({
          status: 'failed', safe_error: 'processing_failed', response_status: 500,
          completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
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
