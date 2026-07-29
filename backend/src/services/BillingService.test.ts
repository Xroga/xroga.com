import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertLemonWebhookEnvironment,
  BillingService,
  derivePaidCycleEvidence,
  getLemonEnvironment,
  parseCustomerPortalUrl,
  selectLemonVariant,
} from './BillingService.js';

test('the same paid subscription period has one stable evidence reference', () => {
  const subscription = derivePaidCycleEvidence({
    data: {
      id: 'sub_123',
      attributes: { status: 'active', renews_at: '2026-08-27T12:00:00.000Z' },
    },
  });
  const payment = derivePaidCycleEvidence({
    data: {
      id: 'invoice_456',
      attributes: {
        status: 'paid',
        subscription_id: 'sub_123',
        renews_at: '2026-08-27T12:00:00.000Z',
      },
    },
  });
  assert.equal(payment.providerReference, subscription.providerReference);
  assert.match(payment.providerReference, /^lemon:live:/);
  assert.equal(payment.startsAt.toISOString(), '2026-07-28T12:00:00.000Z');
  assert.equal(payment.endsAt.toISOString(), '2026-08-27T12:00:00.000Z');
});

test('a Test Mode trial creates exactly one 30-day evidence window', () => {
  const trial = derivePaidCycleEvidence({
    data: {
      id: 'sub_test_123',
      attributes: {
        status: 'on_trial',
        test_mode: true,
        created_at: '2026-07-29T00:00:00.000Z',
        trial_ends_at: '2026-08-28T00:00:00.000Z',
      },
    },
  });
  assert.match(trial.providerReference, /^lemon:test:/);
  assert.equal(trial.startsAt.toISOString(), '2026-07-29T00:00:00.000Z');
  assert.equal(trial.endsAt.toISOString(), '2026-08-28T00:00:00.000Z');
});

test('billing mode is explicit and live webhooks cannot enter a Test Mode runtime', () => {
  assert.equal(getLemonEnvironment({ LEMONSQUEEZY_STORE_ID: '217480', LEMONSQUEEZY_MODE: 'test' }), 'test');
  assert.equal(getLemonEnvironment({ LEMONSQUEEZY_STORE_ID: '217480' }), 'unconfigured');
  assert.doesNotThrow(() => assertLemonWebhookEnvironment({ data: { attributes: { test_mode: true } } }, 'test'));
  assert.throws(
    () => assertLemonWebhookEnvironment({ data: { attributes: { test_mode: false } } }, 'test'),
    /does not match/,
  );
  assert.throws(() => assertLemonWebhookEnvironment({ data: { attributes: {} } }, 'test'), /missing environment evidence/);
});

test('selectLemonVariant accepts only the published $19 monthly 30-day Test Mode trial', () => {
  const valid = {
    id: '456',
    attributes: {
      product_id: 1231656,
      status: 'published',
      test_mode: true,
      is_subscription: true,
      price: 1900,
      interval: 'month',
      interval_count: 1,
      has_free_trial: true,
      trial_interval: 'day',
      trial_interval_count: 30,
    },
  };
  assert.equal(selectLemonVariant({ data: [valid] }, '1231656', 'test'), '456');
  assert.throws(
    () => selectLemonVariant({ data: [{ ...valid, attributes: { ...valid.attributes, test_mode: false } }] }, '1231656', 'test'),
    /exactly one/,
  );
  assert.throws(
    () => selectLemonVariant({ data: [{ ...valid, attributes: { ...valid.attributes, trial_interval_count: 14 } }] }, '1231656', 'test'),
    /exactly one/,
  );
});

test('checkout discovers and verifies the configured product variant when no variant ID is stored', async (t) => {
  const previous = {
    apiKey: process.env.LEMONSQUEEZY_API_KEY,
    storeId: process.env.LEMONSQUEEZY_STORE_ID,
    variant: process.env.LEMONSQUEEZY_VARIANT_SPARK,
    product: process.env.LEMONSQUEEZY_PRODUCT_SPARK,
    mode: process.env.LEMONSQUEEZY_MODE,
  };
  const originalFetch = globalThis.fetch;
  const requested: string[] = [];
  process.env.LEMONSQUEEZY_API_KEY = 'test_api_key';
  process.env.LEMONSQUEEZY_STORE_ID = '217480';
  delete process.env.LEMONSQUEEZY_VARIANT_SPARK;
  process.env.LEMONSQUEEZY_PRODUCT_SPARK = '987654';
  process.env.LEMONSQUEEZY_MODE = 'test';
  globalThis.fetch = (async (input, init) => {
    requested.push(String(input));
    if (String(input).includes('/v1/variants?')) {
      return new Response(JSON.stringify({ data: [{
        id: '456',
        attributes: {
          product_id: 987654,
          status: 'published',
          test_mode: true,
          is_subscription: true,
          price: 1900,
          interval: 'month',
          interval_count: 1,
          has_free_trial: true,
          trial_interval: 'day',
          trial_interval_count: 30,
        },
      }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    const body = JSON.parse(String(init?.body)) as { data?: { relationships?: { variant?: { data?: { id?: string } } } } };
    assert.equal(body.data?.relationships?.variant?.data?.id, '456');
    return new Response(JSON.stringify({ data: { attributes: { url: 'https://xroga.lemonsqueezy.com/checkout/test' } } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({
      LEMONSQUEEZY_API_KEY: previous.apiKey,
      LEMONSQUEEZY_STORE_ID: previous.storeId,
      LEMONSQUEEZY_VARIANT_SPARK: previous.variant,
      LEMONSQUEEZY_PRODUCT_SPARK: previous.product,
      LEMONSQUEEZY_MODE: previous.mode,
    })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });

  const checkout = await BillingService.createCheckout('00000000-0000-0000-0000-000000000002', 'spark');
  assert.equal(checkout.priceId, '456');
  assert.equal(requested.length, 2);
  assert.match(requested[0], /filter%5Bproduct_id%5D=987654/);
});

test('Test Mode checkout is explicit, keeps the trial, and never requests a live charge', async (t) => {
  const previous = {
    apiKey: process.env.LEMONSQUEEZY_API_KEY,
    storeId: process.env.LEMONSQUEEZY_STORE_ID,
    variant: process.env.LEMONSQUEEZY_VARIANT_SPARK,
    product: process.env.LEMONSQUEEZY_PRODUCT_SPARK,
    mode: process.env.LEMONSQUEEZY_MODE,
  };
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> | undefined;
  process.env.LEMONSQUEEZY_API_KEY = 'test_api_key';
  process.env.LEMONSQUEEZY_STORE_ID = '217480';
  process.env.LEMONSQUEEZY_VARIANT_SPARK = '123';
  delete process.env.LEMONSQUEEZY_PRODUCT_SPARK;
  process.env.LEMONSQUEEZY_MODE = 'test';
  globalThis.fetch = (async (_input, init) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ data: { attributes: { url: 'https://xroga.lemonsqueezy.com/checkout/test' } } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries({
      LEMONSQUEEZY_API_KEY: previous.apiKey,
      LEMONSQUEEZY_STORE_ID: previous.storeId,
      LEMONSQUEEZY_VARIANT_SPARK: previous.variant,
      LEMONSQUEEZY_PRODUCT_SPARK: previous.product,
      LEMONSQUEEZY_MODE: previous.mode,
    })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  });

  await BillingService.createCheckout('00000000-0000-0000-0000-000000000001', 'spark', 'test@example.invalid');
  const attributes = ((requestBody?.data as { attributes?: Record<string, unknown> } | undefined)?.attributes) ?? {};
  assert.equal(attributes.test_mode, true);
  assert.deepEqual(attributes.checkout_options, { skip_trial: false });
});

test('cancelled or unidentified billing events cannot activate capacity', () => {
  assert.throws(
    () => derivePaidCycleEvidence({ data: { id: 'sub_1', attributes: { status: 'cancelled' } } }),
    /does not prove an active paid period/,
  );
  assert.throws(() => derivePaidCycleEvidence({ data: { attributes: { status: 'active' } } }), /durable subscription reference/);
});

test('customer portal accepts only an authenticated HTTPS destination from the provider object', () => {
  assert.equal(
    parseCustomerPortalUrl({ data: { attributes: { urls: { customer_portal: 'https://store.lemonsqueezy.com/billing?signature=signed' } } } }),
    'https://store.lemonsqueezy.com/billing?signature=signed',
  );
  assert.throws(() => parseCustomerPortalUrl({ data: { attributes: { urls: { customer_portal: null } } } }), /No paid subscription/);
  assert.throws(() => parseCustomerPortalUrl({ data: { attributes: { urls: { customer_portal: 'javascript:alert(1)' } } } }), /unsafe destination/);
  assert.throws(() => parseCustomerPortalUrl({ data: { attributes: { urls: { customer_portal: 'https://user:pass@example.com' } } } }), /unsafe destination/);
});
