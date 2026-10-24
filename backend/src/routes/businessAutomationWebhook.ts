import { createHmac, timingSafeEqual } from 'node:crypto';
import express, { Router, type Request, type Response } from 'express';
import { handleBusinessAutomationTrigger } from '../services/integrations/businessAutomations.js';

const router = Router();

export function verifyComposioWebhookSignature(input: {
  secret: string;
  id: string;
  timestamp: string;
  signature: string;
  body: Buffer;
  now?: number;
}): boolean {
  const seconds = Number(input.timestamp);
  if (!input.id || !Number.isFinite(seconds) || Math.abs((input.now ?? Date.now()) / 1000 - seconds) > 300) return false;
  const expected = createHmac('sha256', input.secret).update(`${input.id}.${input.timestamp}.`).update(input.body).digest();
  return input.signature.split(' ').some((entry) => {
    const value = entry.includes(',') ? entry.split(',', 2)[1] : entry;
    if (!value) return false;
    const actual = Buffer.from(value, 'base64');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}

router.post('/', express.raw({ type: 'application/json', limit: '64kb' }), async (req: Request, res: Response) => {
  const secret = process.env.COMPOSIO_WEBHOOK_SECRET?.trim();
  if (!secret) return res.status(503).json({ error: 'Webhook signing is not configured.' });
  const id = req.get('webhook-id') ?? '';
  const timestamp = req.get('webhook-timestamp') ?? '';
  const signature = req.get('webhook-signature') ?? '';
  if (!Buffer.isBuffer(req.body) || !id || !timestamp) {
    return res.status(400).json({ error: 'Invalid webhook envelope.' });
  }
  const verified = verifyComposioWebhookSignature({ secret, id, timestamp, signature, body: req.body });
  if (!verified) return res.status(401).json({ error: 'Invalid webhook signature.' });
  let event: unknown;
  try { event = JSON.parse(req.body.toString('utf8')); } catch { return res.status(400).json({ error: 'Invalid JSON.' }); }
  if (!event || typeof event !== 'object') return res.status(400).json({ error: 'Invalid event.' });
  const payload = event as Record<string, unknown>;
  if (payload.type !== 'composio.trigger.message') return res.status(200).json({ received: true, ignored: true });
  const metadata = payload.metadata as Record<string, unknown> | undefined;
  if (typeof payload.id !== 'string' || typeof metadata?.trigger_id !== 'string'
    || typeof metadata.user_id !== 'string' || typeof metadata.trigger_slug !== 'string') {
    return res.status(400).json({ error: 'Invalid trigger metadata.' });
  }
  const owner = metadata.user_id.match(/^xroga:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i)?.[1];
  if (!owner) return res.status(200).json({ received: true, ignored: true });
  try {
    await handleBusinessAutomationTrigger({
      triggerId: metadata.trigger_id,
      userId: owner,
      triggerSlug: metadata.trigger_slug,
      eventKey: payload.id,
      payload: payload.data,
    });
    return res.status(200).json({ received: true });
  } catch (error) {
    console.warn('[businessAutomations] Signed trigger could not be stored:', error instanceof Error ? error.message : 'unknown');
    return res.status(503).json({ error: 'Trigger was not accepted.' });
  }
});

export default router;
