import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test, { type TestContext } from 'node:test';
import {
  assertWhopPlanContract,
  BillingService,
  checkoutIdempotencyKey,
  resetBillingMemoryForTests,
  verifyWhopWebhookSignature,
  WHOP_API_VERSION_DATE,
} from './BillingService.js';

const APPROVED_PLAN = {
  id: 'plan_hlV1A10I5QfSP', account_id: 'biz_qhYONL4RebGX96', plan_type: 'renewal',
  renewal_price: 25, billing_period: 30, trial_period_days: null, currency: 'usd',
  purchase_url: 'https://whop.com/checkout/plan_hlV1A10I5QfSP/',
};

function withWhopEnv(t: TestContext) {
  const names = ['WHOP_API_KEY', 'WHOP_COMPANY_ID', 'WHOP_PLAN_ID', 'WHOP_REDIRECT_URL', 'WHOP_WEBHOOK_SECRET'] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  Object.assign(process.env, {
    WHOP_API_KEY: 'test_key', WHOP_COMPANY_ID: 'biz_qhYONL4RebGX96',
    WHOP_PLAN_ID: 'plan_hlV1A10I5QfSP', WHOP_REDIRECT_URL: 'https://xroga.com/workspace?billing=success',
    WHOP_WEBHOOK_SECRET: 'ws_test_signing_secret',
  });
  t.after(() => {
    for (const name of names) previous[name] === undefined ? delete process.env[name] : process.env[name] = previous[name];
    resetBillingMemoryForTests();
  });
}

test('canonical public plans are Free and Xroga Pro with real allowances', () => {
  assert.deepEqual(BillingService.listPlans().map(({ tier, name, priceLabel, actions }) => ({ tier, name, priceLabel, actions })), [
    { tier: 'free', name: 'Free', priceLabel: '$0', actions: 50 },
    { tier: 'spark', name: 'Xroga Pro', priceLabel: '$25/month', actions: 1500 },
  ]);
});

test('Whop plan contract requires approved account, renewal $25, 30 days, USD, and no trial', () => {
  assert.doesNotThrow(() => assertWhopPlanContract(APPROVED_PLAN, 'biz_qhYONL4RebGX96', 'plan_hlV1A10I5QfSP'));
  assert.doesNotThrow(() => assertWhopPlanContract({
    ...APPROVED_PLAN,
    account_id: undefined,
    company: { id: 'biz_qhYONL4RebGX96', title: 'Xroga' },
  }, 'biz_qhYONL4RebGX96', 'plan_hlV1A10I5QfSP'));
  for (const patch of [{ renewal_price: 19 }, { trial_period_days: 30 }, { account_id: 'biz_wrong' }, { plan_type: 'one_time' }]) {
    assert.throws(() => assertWhopPlanContract({ ...APPROVED_PLAN, ...patch }, 'biz_qhYONL4RebGX96', 'plan_hlV1A10I5QfSP'), /mismatch/);
  }
  for (const company of [{ id: 'biz_wrong' }, {}, undefined]) {
    assert.throws(() => assertWhopPlanContract({
      ...APPROVED_PLAN,
      account_id: undefined,
      company,
    }, 'biz_qhYONL4RebGX96', 'plan_hlV1A10I5QfSP'), /account_id/);
  }
});

test('checkout uses the v1 API, pinned version, approved server values, metadata and idempotency', async (t) => {
  withWhopEnv(t);
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: String(input), init });
    if (String(input).endsWith('/plans/plan_hlV1A10I5QfSP')) return Response.json(APPROVED_PLAN);
    return Response.json({ id: 'ch_123', purchase_url: 'https://whop.com/checkout/plan_hlV1A10I5QfSP/?session=unique' });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await BillingService.createCheckout('00000000-0000-4000-8000-000000000123');
  assert.match(result.purchaseUrl, /^https:\/\/whop\.com\/checkout\//);
  assert.equal(requests.length, 2);
  const checkout = requests[1];
  assert.equal(checkout.url, 'https://api.whop.com/api/v1/checkout_configurations');
  const headers = checkout.init?.headers as Record<string, string>;
  assert.equal(headers['Api-Version-Date'], WHOP_API_VERSION_DATE);
  assert.match(headers['Idempotency-Key'], /^xroga-checkout-/);
  const body = JSON.parse(String(checkout.init?.body));
  assert.equal(body.account_id, 'biz_qhYONL4RebGX96');
  assert.equal(body.plan_id, 'plan_hlV1A10I5QfSP');
  assert.equal(body.mode, 'payment');
  assert.equal(body.redirect_url, 'https://xroga.com/workspace?billing=success');
  assert.deepEqual({ ...body.metadata, xroga_checkout_id: 'ignored' }, {
    xroga_user_id: '00000000-0000-4000-8000-000000000123', plan_tier: 'spark', source: 'xroga', xroga_checkout_id: 'ignored',
  });
});

test('checkout verifies ownership through the company-scoped plan list when retrieve omits company', async (t) => {
  withWhopEnv(t);
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith('/plans/plan_hlV1A10I5QfSP')) {
      return Response.json({ ...APPROVED_PLAN, account_id: undefined });
    }
    if (url.includes('/plans?')) {
      return Response.json({ data: [{ id: 'plan_hlV1A10I5QfSP' }] });
    }
    return Response.json({ id: 'ch_456', purchase_url: 'https://whop.com/checkout/plan_hlV1A10I5QfSP/?session=verified' });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  const result = await BillingService.createCheckout('00000000-0000-4000-8000-000000000456');
  assert.match(result.purchaseUrl, /^https:\/\/whop\.com\/checkout\//);
  assert.equal(requests.length, 3);
  const companyPlansUrl = new URL(requests[1]);
  assert.equal(companyPlansUrl.pathname, '/api/v1/plans');
  assert.equal(companyPlansUrl.searchParams.get('company_id'), 'biz_qhYONL4RebGX96');
  assert.equal(companyPlansUrl.searchParams.get('first'), '100');
});

test('checkout rejects a plan absent from its configured company plan list', async (t) => {
  withWhopEnv(t);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith('/plans/plan_hlV1A10I5QfSP')) return Response.json({ ...APPROVED_PLAN, account_id: undefined });
    return Response.json({ data: [{ id: 'plan_other' }] });
  }) as typeof fetch;
  t.after(() => { globalThis.fetch = originalFetch; });

  await assert.rejects(
    BillingService.createCheckout('00000000-0000-4000-8000-000000000789'),
    /account_id/,
  );
});

test('checkout configuration fails closed when Whop secrets are absent', async (t) => {
  const previous = process.env.WHOP_API_KEY;
  delete process.env.WHOP_API_KEY;
  t.after(() => previous === undefined ? delete process.env.WHOP_API_KEY : process.env.WHOP_API_KEY = previous);
  await assert.rejects(BillingService.createCheckout('00000000-0000-4000-8000-000000000123'), /not configured/);
});

test('checkout idempotency is stable inside a bounded window and changes afterward', () => {
  const user = '00000000-0000-4000-8000-000000000123';
  assert.equal(checkoutIdempotencyKey(user, 600_001), checkoutIdempotencyKey(user, 899_999));
  assert.notEqual(checkoutIdempotencyKey(user, 600_001), checkoutIdempotencyKey(user, 900_001));
});

test('Standard Webhooks signature verifies the exact raw body', () => {
  const raw = '{"type":"payment.succeeded","data":{"id":"pay_1"}}';
  const timestamp = '1788900000';
  const id = 'msg_123';
  const secret = 'ws_test_signing_secret';
  const signature = crypto.createHmac('sha256', secret).update(`${id}.${timestamp}.${raw}`).digest('base64');
  const now = Number(timestamp) * 1000;
  assert.equal(verifyWhopWebhookSignature(raw, { id, timestamp, signature: `v1,${signature}` }, secret, now), true);
  assert.equal(verifyWhopWebhookSignature(`${raw} `, { id, timestamp, signature: `v1,${signature}` }, secret, now), false);
});

test('Standard Webhooks decodes a Whop whsec_ signing key before HMAC verification', () => {
  const raw = '{"type":"payment.succeeded","data":{"id":"pay_whop"}}';
  const timestamp = '1788900000';
  const id = 'msg_whop';
  const key = crypto.randomBytes(32);
  const secret = `whsec_${key.toString('base64')}`;
  const signature = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${raw}`).digest('base64');
  assert.equal(verifyWhopWebhookSignature(raw, { id, timestamp, signature: `v1,${signature}` }, secret, Number(timestamp) * 1000), true);
  assert.equal(verifyWhopWebhookSignature(raw, { id, timestamp, signature: `v1,${signature}` }, `whsec_not-valid!`, Number(timestamp) * 1000), false);
});

test('webhook verification rejects missing, malformed and stale evidence', () => {
  assert.equal(verifyWhopWebhookSignature('{}', {}, 'ws_secret'), false);
  assert.equal(verifyWhopWebhookSignature('{}', { id: 'msg', timestamp: 'bad', signature: 'v1,nope' }, 'ws_secret'), false);
  assert.equal(verifyWhopWebhookSignature('{}', { id: 'msg', timestamp: '1', signature: 'v1,nope' }, 'ws_secret', 1_000_000), false);
});

test('refund and dispute events never fulfill entitlement', async (t) => {
  withWhopEnv(t);
  for (const type of ['refund.created', 'refund.updated', 'dispute.created', 'dispute.updated'] as const) {
    assert.deepEqual(await BillingService.handleWebhookEvent({ type, account_id: 'biz_qhYONL4RebGX96', data: { id: `${type}_1` } }, `msg_${type}`), { fulfilled: false });
  }
});

test('wrong Whop account is rejected before fulfillment', async (t) => {
  withWhopEnv(t);
  await assert.rejects(BillingService.handleWebhookEvent({ type: 'payment.succeeded', account_id: 'biz_wrong', data: {} }, 'msg_1'), /wrong_account/);
});
