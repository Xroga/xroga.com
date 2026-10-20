import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getUsage, assertHasQuota, recordUsage, syncPlanBudget } from './quota.js';
import { createTenantContext } from '../security/tenantContext.js';

test('quota admission requires current owner-bound durable evidence and never invents paid credit', async t => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']; const previous = keys.map(key => process.env[key]);
  t.after(() => keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; }));
  const owner = '11111111-1111-4111-8111-111111111111';
  const start = `${new Date().toISOString().slice(0, 7)}-01`;
  const valid = { user_id: owner, plan_tier: 'spark', plan_budget_usd: 20, quota_period_start: start,
    input_tokens: 10, output_tokens: 5, spent_usd: 3, rollover_usd: 0, model_usage: {} };
  let row: unknown = valid, mode = 'ok', reads = 0, writes = 0;
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input)); assert.equal(url.origin, 'http://127.0.0.1:49194');
    if (url.pathname.startsWith('/rest/v1/rpc/')) { writes++; return Response.json(null); }
    reads++; assert.equal(url.pathname, '/rest/v1/user_token_usage');
    assert.equal(url.searchParams.get('user_id'), `eq.${owner}`);
    if (mode === 'transport') throw new Error('PRIVATE_CANARY');
    if (mode === 'outage') return Response.json({ message: 'PRIVATE_CANARY' }, { status: 503 });
    return Response.json(row);
  });
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await assert.rejects(assertHasQuota(owner), { code: 'QUOTA_UNAVAILABLE', statusCode: 503 }); assert.equal(reads, 0);
  process.env.SUPABASE_URL = 'http://127.0.0.1:49194'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  for (mode of ['outage', 'transport']) {
    await assert.rejects(assertHasQuota(owner), { code: 'QUOTA_UNAVAILABLE', message: 'AI usage could not be verified. Retry shortly.' });
    await assert.rejects(recordUsage(owner, 'kimi_k3', 1, 1), { code: 'QUOTA_UNAVAILABLE' });
    assert.equal(writes, 0);
  }
  mode = 'ok';
  for (row of [null, [], { ...valid, user_id: 'foreign' }, { ...valid, plan_tier: 'invented' },
    { ...valid, quota_period_start: 'bad' }, { ...valid, quota_period_start: '2999-01-01' }]) {
    await assert.rejects(assertHasQuota(owner), { code: 'QUOTA_UNAVAILABLE' });
  }
  for (const field of ['input_tokens', 'output_tokens', 'spent_usd', 'rollover_usd', 'plan_budget_usd']) {
    for (const invalid of [null, -1, 'NaN', 'Infinity', '', true, {}, '1e309']) {
      row = { ...valid, [field]: invalid };
      await assert.rejects(assertHasQuota(owner), { code: 'QUOTA_UNAVAILABLE' });
    }
  }
  for (const model_usage of [[], { pool: null }, { pool: { input: null } }, { pool: { input: -1 } }, { pool: { cost_usd: 'NaN' } }]) {
    row = { ...valid, model_usage }; await assert.rejects(assertHasQuota(owner), { code: 'QUOTA_UNAVAILABLE' });
  }
  row = { ...valid, plan_budget_usd: 0 };
  assert.equal((await getUsage(owner)).planBudgetUsd, 0);
  await assert.rejects(assertHasQuota(owner), { code: 'OUT_OF_TOKENS' });
  row = valid; reads = 0;
  assert.equal((await assertHasQuota(owner)).creditRemainingUsd, 17); assert.equal(reads, 1);
  await recordUsage(owner, 'kimi_k3', 10, 5);
  await syncPlanBudget(createTenantContext({userId: owner, via: 'local_jwt'}), 'spark');
  row = { ...valid, plan_tier: 'free', plan_budget_usd: '1.65', spent_usd: '0', input_tokens: '0', output_tokens: '0' };
  const downgraded = await getUsage(owner);
  assert.equal(downgraded.planTier, 'free'); assert.equal(downgraded.planBudgetUsd, 1.65);
  assert.ok(downgraded.spentUsd > 0); assert.ok(downgraded.creditRemainingUsd < 1.65);
  const before = writes;
  await assert.rejects(recordUsage(owner, 'kimi_k3', -1, 0), { code: 'QUOTA_UNAVAILABLE' }); assert.equal(writes, before);
});
