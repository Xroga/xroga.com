import { createHash } from 'node:crypto';
import express, { Router } from 'express';
import { BillingService, verifyWhopWebhookSignature, type WhopWebhookEvent } from '../services/BillingService.js';
import { getGlobalSupabaseAdmin } from '../security/serviceRoleGuard.js';

const router = Router();

router.post('/whop', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  const rawBody = req.body instanceof Buffer ? req.body.toString('utf8') : '';
  const webhookId = String(req.headers['webhook-id'] ?? '').slice(0, 200);
  const timestamp = String(req.headers['webhook-timestamp'] ?? '');
  const signature = String(req.headers['webhook-signature'] ?? '');

  if (!process.env.WHOP_WEBHOOK_SECRET?.trim()) {
    res.status(503).json({ error: 'Webhook verification is not configured' });
    return;
  }
  if (!verifyWhopWebhookSignature(rawBody, { id: webhookId, timestamp, signature })) {
    console.warn(JSON.stringify({ level: 'warn', event: 'whop_webhook_rejected', webhookId: webhookId || null, reason: 'invalid_signature' }));
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  let event: WhopWebhookEvent;
  try {
    event = JSON.parse(rawBody) as WhopWebhookEvent;
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error('Invalid event');
  } catch {
    res.status(400).json({ error: 'Invalid webhook payload' });
    return;
  }

  const payloadDigest = createHash('sha256').update(rawBody).digest('hex');
  const eventType = String(event.type ?? '').slice(0, 100);
  const supabase = getGlobalSupabaseAdmin('signed_whop_delivery_receipts');
  const { error: claimError } = await supabase.from('webhook_deliveries').insert({
    provider: 'whop', delivery_id: webhookId, payload_digest: payloadDigest,
    status: 'processing', event_type: eventType, signature_verified: true, response_status: null,
  });
  if (claimError?.code === '23505') {
    const { data: existing, error: readError } = await supabase.from('webhook_deliveries')
      .select('status,payload_digest').eq('provider', 'whop').eq('delivery_id', webhookId).maybeSingle();
    if (readError) {
      res.status(503).json({ error: 'Webhook delivery store unavailable' });
      return;
    }
    if (!existing || existing.payload_digest !== payloadDigest) {
      res.status(409).json({ error: 'Webhook identity conflict' });
      return;
    }
    if (existing.status === 'completed') {
      res.status(200).json({ received: true, duplicate: true });
      return;
    }
    if (existing.status !== 'failed') {
      res.status(503).json({ error: 'Webhook processing is not yet confirmed' });
      return;
    }
    const { data: retryClaim, error: retryError } = await supabase.from('webhook_deliveries').update({
      status: 'processing', safe_error: null, response_status: null, updated_at: new Date().toISOString(),
    }).eq('provider', 'whop').eq('delivery_id', webhookId).eq('payload_digest', payloadDigest).eq('status', 'failed').select('delivery_id');
    if (retryError) {
      res.status(503).json({ error: 'Webhook delivery store unavailable' });
      return;
    }
    if (retryClaim?.length !== 1 || retryClaim[0].delivery_id !== webhookId) {
      res.status(503).json({ error: 'Webhook processing is not yet confirmed' });
      return;
    }
  } else if (claimError) {
    res.status(503).json({ error: 'Webhook delivery store unavailable' });
    return;
  }

  try {
    const result = await BillingService.handleWebhookEvent(event, webhookId);
    const completion = await supabase.from('webhook_deliveries').update({
      status: 'completed', response_status: 200, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      related_object: event.data && typeof event.data.id === 'string' ? event.data.id : null,
    }).eq('provider', 'whop').eq('delivery_id', webhookId).eq('payload_digest', payloadDigest).eq('status', 'processing').select('delivery_id').then(result => result, () => null);
    if (!completion || completion.error || completion.data?.length !== 1 || completion.data[0].delivery_id !== webhookId) {
      // Fulfillment may already be durable. Do not mark it failed or acknowledge
      // completion without a receipt, and never replay an uncertain active claim.
      res.status(503).json({ error: 'Webhook completion could not be confirmed' });
      return;
    }
    console.info(JSON.stringify({ level: 'info', event: 'whop_webhook_processed', webhookId, eventType, fulfilled: result.fulfilled }));
    res.status(200).json({ received: true, fulfilled: result.fulfilled });
  } catch (error) {
    const knownCodes = new Set(['wrong_account', 'membership_owner_mismatch', 'payment_owner_mismatch', 'membership_sync_failed']);
    const safeError = error instanceof Error && knownCodes.has(error.message) ? error.message : 'processing_failed';
    await supabase.from('webhook_deliveries').update({
      status: 'failed', safe_error: safeError, response_status: 500,
      completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('provider', 'whop').eq('delivery_id', webhookId).eq('payload_digest', payloadDigest).eq('status', 'processing');
    console.error(JSON.stringify({ level: 'error', event: 'whop_webhook_failed', webhookId, eventType, reason: safeError }));
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

router.post('/lemon-squeezy', express.raw({ type: 'application/json' }), (_req, res) => {
  res.status(410).json({ error: 'Legacy billing webhook retired' });
});

router.post('/paddle', express.raw({ type: 'application/json' }), (_req, res) => {
  res.status(410).json({ error: 'Legacy billing webhook retired' });
});

export default router;
