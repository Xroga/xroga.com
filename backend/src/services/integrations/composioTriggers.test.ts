import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { afterEach, describe, it } from 'node:test';

import { verifyComposioWebhookSignature } from '../../routes/businessAutomationWebhook.js';
import { upsertComposioTriggerForUser } from './composioClient.js';

const USER = '11111111-1111-4111-8111-111111111111';
const SECRET = 'whsec-test-secret-value';

/** The algorithm exactly as Composio documents it: HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{rawBody}`, base64. */
const sign = (id: string, timestamp: string, body: string, secret = SECRET) => createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64');

describe('webhook signature: matches the documented Composio scheme', () => {
  const body = Buffer.from(JSON.stringify({ id: 'msg_1', type: 'composio.trigger.message', metadata: { trigger_id: 'ti_1', user_id: `xroga:${USER}`, trigger_slug: 'GMAIL_NEW_GMAIL_MESSAGE' }, data: {} }));
  const now = Date.now();
  const stamp = String(Math.floor(now / 1000));

  it('accepts a correct signature, with or without a version prefix', () => {
    const signature = sign('msg_1', stamp, body.toString());
    assert.equal(verifyComposioWebhookSignature({ secret: SECRET, id: 'msg_1', timestamp: stamp, signature, body, now }), true);
    assert.equal(verifyComposioWebhookSignature({ secret: SECRET, id: 'msg_1', timestamp: stamp, signature: `v1,${signature}`, body, now }), true);
    assert.equal(verifyComposioWebhookSignature({ secret: SECRET, id: 'msg_1', timestamp: stamp, signature: `v1,wrong ${`v1,${signature}`}`, body, now }), true, 'any one of several signatures may match during secret rotation');
  });

  it('rejects a wrong secret, a changed body, a changed id and a changed timestamp', () => {
    const signature = sign('msg_1', stamp, body.toString());
    assert.equal(verifyComposioWebhookSignature({ secret: 'other', id: 'msg_1', timestamp: stamp, signature, body, now }), false);
    assert.equal(verifyComposioWebhookSignature({ secret: SECRET, id: 'msg_1', timestamp: stamp, signature, body: Buffer.from(`${body.toString()} `), now }), false);
    assert.equal(verifyComposioWebhookSignature({ secret: SECRET, id: 'msg_2', timestamp: stamp, signature, body, now }), false);
    assert.equal(verifyComposioWebhookSignature({ secret: SECRET, id: 'msg_1', timestamp: String(Number(stamp) + 1), signature, body, now }), false);
  });

  it('rejects a replay outside the 300 second window and malformed input', () => {
    const old = String(Math.floor(now / 1000) - 301);
    assert.equal(verifyComposioWebhookSignature({ secret: SECRET, id: 'msg_1', timestamp: old, signature: sign('msg_1', old, body.toString()), body, now }), false);
    const future = String(Math.floor(now / 1000) + 301);
    assert.equal(verifyComposioWebhookSignature({ secret: SECRET, id: 'msg_1', timestamp: future, signature: sign('msg_1', future, body.toString()), body, now }), false);
    for (const signature of ['', 'v1,', 'not-base64!!', ' ']) {
      assert.equal(verifyComposioWebhookSignature({ secret: SECRET, id: 'msg_1', timestamp: stamp, signature, body, now }), false, JSON.stringify(signature));
    }
    assert.equal(verifyComposioWebhookSignature({ secret: SECRET, id: '', timestamp: stamp, signature: sign('', stamp, body.toString()), body, now }), false);
    assert.equal(verifyComposioWebhookSignature({ secret: SECRET, id: 'msg_1', timestamp: 'NaN', signature: 'x', body, now }), false);
  });
});

describe('trigger instances watch the account the user chose', () => {
  const real = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = real;
    delete process.env.COMPOSIO_API_KEY;
    delete process.env.XROGA_COMPOSIO_MULTI_ACCOUNT;
  });

  function stub(accounts: unknown[]) {
    process.env.COMPOSIO_API_KEY = 'test-key';
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(String(input));
      const call = { method: init?.method ?? 'GET', path: url.pathname, body: init?.body ? JSON.parse(String(init.body)) : undefined };
      calls.push(call);
      if (url.pathname.startsWith('/api/v3.1/triggers_types/')) return Response.json({ slug: 'GMAIL_NEW_GMAIL_MESSAGE', toolkit: { slug: 'gmail' } });
      if (url.pathname.endsWith('/toolkits')) return Response.json({ items: [{ slug: 'gmail', name: 'Gmail', connected_account: { id: 'ca_a', status: 'ACTIVE' } }] });
      if (url.pathname === '/api/v3.1/connected_accounts') return Response.json({ items: accounts });
      if (url.pathname.includes('/trigger_instances/')) return Response.json({ trigger_id: 'ti_123' });
      return Response.json({ session_id: 'trs_t', config: { user_id: `xroga:${USER}`, instant: false, tags: ['readOnlyHint'], workbench: { enable: false, enable_proxy_execution: false }, execute: { enable_multi_execute: false } } });
    }) as typeof fetch;
    return calls;
  }
  const acct = (id: string) => ({ id, toolkit: { slug: 'gmail' }, status: 'ACTIVE', alias: null });
  const input = { toolkit: 'gmail', triggerSlug: 'GMAIL_NEW_GMAIL_MESSAGE', triggerConfig: { labelIds: 'INBOX' } };

  it('without multi-account the request is unchanged: Composio picks the connection', async () => {
    const calls = stub([]);
    assert.equal(await upsertComposioTriggerForUser(USER, input), 'ti_123');
    const upsert = calls.find((call) => call.path.includes('/trigger_instances/'));
    assert.deepEqual(upsert?.body, { user_id: `xroga:${USER}`, trigger_config: { labelIds: 'INBOX' } });
  });

  it('with several accounts it refuses to guess, and pins the chosen one when it is theirs', async () => {
    process.env.XROGA_COMPOSIO_MULTI_ACCOUNT = 'enabled';
    const calls = stub([acct('ca_a'), acct('ca_b')]);
    await assert.rejects(upsertComposioTriggerForUser(USER, input), { code: 'COMPOSIO_ACCOUNT_SELECTION_REQUIRED' });
    await assert.rejects(upsertComposioTriggerForUser(USER, { ...input, connectedAccountId: 'ca_not_mine' }), { code: 'COMPOSIO_ACCOUNT_NOT_OWNED' });
    assert.ok(!calls.some((call) => call.path.includes('/trigger_instances/')), 'nothing was created for a refused request');
    assert.equal(await upsertComposioTriggerForUser(USER, { ...input, connectedAccountId: 'ca_b' }), 'ti_123');
    const upsert = calls.find((call) => call.path.includes('/trigger_instances/'));
    assert.deepEqual(upsert?.body, { user_id: `xroga:${USER}`, connected_account_id: 'ca_b', trigger_config: { labelIds: 'INBOX' } });
  });
});
