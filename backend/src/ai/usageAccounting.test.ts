import assert from 'node:assert/strict';
import { test } from 'node:test';
import { persistUsageAccounting } from './usageAccounting.js';
import { createTenantContext, type TenantContext } from '../security/tenantContext.js';

test('prepared accounting helper requires issued owner and exact durable receipt without provider retries', async t => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']; const prior = keys.map(key => process.env[key]);
  process.env.SUPABASE_URL = 'http://127.0.0.1:49197'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  t.after(() => keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; }));
  const owner = '11111111-1111-4111-8111-111111111111', context = createTenantContext({ userId: owner, via: 'remote_getuser' });
  const input = { receiptId: '22222222-2222-4222-8222-222222222222', modelId: 'kimi_k3', poolRole: 'kimi_k3', inputTokens: 3, outputTokens: 2, costUsd: 0.1234564 };
  const valid = { ...input, costUsd: 0.123456, ledgerId: '9007199254740993', userId: owner, period: '2026-10-01', replayed: false, usage: { user_id: owner } };
  let response: unknown = valid, mode = 'ok', calls = 0;
  t.mock.method(globalThis, 'fetch', async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.equal(String(url), 'http://127.0.0.1:49197/rest/v1/rpc/record_ai_usage_atomic'); assert.equal(init?.method, 'POST'); calls++;
    assert.deepEqual(JSON.parse(String(init?.body)), { p_user_id: owner, p_receipt_id: input.receiptId, p_model_id: input.modelId, p_pool_role: input.poolRole, p_input: 3, p_output: 2, p_cost_usd: 0.123456 });
    if (mode === 'transport') throw new Error('PRIVATE_CANARY');
    if (mode === 'error') return Response.json({ message: 'PRIVATE_CANARY' }, { status: 503 });
    return Response.json(response);
  });
  await assert.rejects(persistUsageAccounting({ userId: owner } as TenantContext, input), { code: 'TENANT_AUTH_REQUIRED' }); assert.equal(calls, 0);
  for (const patch of [{ inputTokens: -1 }, { costUsd: NaN }, { receiptId: 'bad' }]) {
    await assert.rejects(persistUsageAccounting(context, { ...input, ...patch }), { code: 'USAGE_ACCOUNTING_UNCERTAIN' });
  }
  assert.equal(calls, 0);
  assert.deepEqual(await persistUsageAccounting(context, input), valid);
  response = { ...valid, replayed: true }; assert.equal((await persistUsageAccounting(context, input)).replayed, true);
  for (response of [null, [], { ...valid, userId: 'foreign' }, { ...valid, receiptId: 'foreign' }, { ...valid, inputTokens: 4 },
    { ...valid, costUsd: 0 }, { ...valid, ledgerId: null }, { ...valid, usage: { user_id: 'foreign' } }]) {
    await assert.rejects(persistUsageAccounting(context, input), { code: 'USAGE_ACCOUNTING_UNCERTAIN' });
  }
  for (mode of ['transport', 'error']) {
    const before: number = calls;
    await assert.rejects(persistUsageAccounting(context, input), { message: 'Usage accounting receipt could not be verified.' });
    assert.equal(calls, before + 1, 'no automatic retry of uncertain accounting');
  }
});
