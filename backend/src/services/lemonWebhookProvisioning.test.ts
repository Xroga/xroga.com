import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEMON_BILLING_WEBHOOK_EVENTS,
  LemonWebhookReconciliationError,
  reconcileLemonTestWebhook,
} from './lemonWebhookProvisioning.js';

const env = {
  LEMONSQUEEZY_API_KEY: 'test-api-key',
  LEMONSQUEEZY_STORE_ID: '217480',
  LEMONSQUEEZY_WEBHOOK_SECRET: 'test-signing-secret',
  LEMONSQUEEZY_MODE: 'test',
};

function response(data: unknown): Response {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test('creates and independently verifies the missing Test Mode webhook', async () => {
  const methods: string[] = [];
  const fetchImplementation = (async (_input: string | URL | Request, init?: RequestInit) => {
    methods.push(init?.method ?? 'GET');
    if (!init?.method) return response({ data: [] });
    const body = JSON.parse(String(init.body));
    assert.equal(body.data.attributes.secret, env.LEMONSQUEEZY_WEBHOOK_SECRET);
    assert.equal(body.data.attributes.test_mode, true);
    return response({
      data: {
        id: '101',
        attributes: {
          store_id: 217480,
          url: 'https://xroga-api.fly.dev/api/billing/webhook/lemon-squeezy',
          events: [...LEMON_BILLING_WEBHOOK_EVENTS],
          test_mode: true,
          last_sent_at: null,
        },
      },
    });
  }) as typeof fetch;

  const result = await reconcileLemonTestWebhook(env, fetchImplementation);
  assert.deepEqual(methods, ['GET', 'POST']);
  assert.equal(result.action, 'created');
  assert.equal(result.eventCount, 6);
  assert.equal(JSON.stringify(result).includes(env.LEMONSQUEEZY_WEBHOOK_SECRET), false);
});

test('updates the exact existing Test Mode webhook and rotates its signing secret', async () => {
  const methods: string[] = [];
  const fetchImplementation = (async (_input: string | URL | Request, init?: RequestInit) => {
    methods.push(init?.method ?? 'GET');
    if (!init?.method) return response({
      data: [{
        id: '202',
        attributes: {
          store_id: 217480,
          url: 'https://xroga-api.fly.dev/api/billing/webhook/lemon-squeezy',
          events: ['order_created'],
          test_mode: true,
        },
      }],
    });
    const body = JSON.parse(String(init.body));
    assert.equal(body.data.id, '202');
    assert.equal(body.data.attributes.secret, env.LEMONSQUEEZY_WEBHOOK_SECRET);
    return response({
      data: {
        id: '202',
        attributes: {
          store_id: 217480,
          url: 'https://xroga-api.fly.dev/api/billing/webhook/lemon-squeezy',
          events: [...LEMON_BILLING_WEBHOOK_EVENTS],
          test_mode: true,
          last_sent_at: '2026-07-29T00:00:00.000Z',
        },
      },
    });
  }) as typeof fetch;

  const result = await reconcileLemonTestWebhook(env, fetchImplementation);
  assert.deepEqual(methods, ['GET', 'PATCH']);
  assert.equal(result.action, 'updated');
  assert.equal(result.lastSentAt, '2026-07-29T00:00:00.000Z');
});

test('fails closed when duplicate Test Mode endpoints would deliver the same event twice', async () => {
  const target = {
    id: '303',
    attributes: {
      store_id: 217480,
      url: 'https://xroga-api.fly.dev/api/billing/webhook/lemon-squeezy',
      events: [...LEMON_BILLING_WEBHOOK_EVENTS],
      test_mode: true,
    },
  };
  const fetchImplementation = (async () => response({ data: [target, { ...target, id: '304' }] })) as typeof fetch;
  await assert.rejects(
    () => reconcileLemonTestWebhook(env, fetchImplementation),
    (error: unknown) => error instanceof LemonWebhookReconciliationError
      && error.category === 'duplicate_test_webhooks',
  );
});
