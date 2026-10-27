import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import { verifyComposioWebhookSignature } from './businessAutomationWebhook.js';

test('Composio webhook verification accepts a fresh signed body and rejects tampering or replay', () => {
  const now = Date.UTC(2026, 9, 25, 12, 0, 0);
  const timestamp = String(now / 1000);
  const id = 'msg_123';
  const secret = 'test-signing-secret';
  const body = Buffer.from('{"type":"composio.trigger.message"}');
  const signature = createHmac('sha256', secret).update(`${id}.${timestamp}.`).update(body).digest('base64');
  const input = { secret, id, timestamp, signature: `v1,${signature}`, body, now };
  assert.equal(verifyComposioWebhookSignature(input), true);
  assert.equal(verifyComposioWebhookSignature({ ...input, body: Buffer.from('{}') }), false);
  assert.equal(verifyComposioWebhookSignature({ ...input, now: now + 301_000 }), false);
  assert.equal(verifyComposioWebhookSignature({ ...input, signature: 'v1,invalid' }), false);
});
