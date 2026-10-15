import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { recordCompletedProviderUsage } from './postCompletionAccounting.js';

test('completed provider accounting requires atomic receipt and never falls back to split writes or fabricated usage', async () => {
  const owner = randomUUID(), oldFetch = globalThis.fetch;
  const prior = [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY];
  process.env.SUPABASE_URL = 'http://127.0.0.1:49229'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only';
  let mode = 'success'; const paths: string[] = [], receipts: string[] = [];
  const usage = { user_id: owner, input_tokens: 3, output_tokens: 2, model_usage: {},
    quota_period_start: `${new Date().toISOString().slice(0, 7)}-01`, spent_usd: 0.1, rollover_usd: 0, plan_budget_usd: 1.65, plan_tier: 'free' };
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname; paths.push(path);
    if (path === '/rest/v1/user_token_usage') return Response.json(usage);
    assert.equal(path, '/rest/v1/rpc/record_ai_usage_atomic');
    const body = JSON.parse(String(init?.body)); receipts.push(body.p_receipt_id);
    if (mode === 'outage') return Response.json({ message: 'PRIVATE_ACCOUNTING_CANARY' }, { status: 400 });
    return Response.json({ ledgerId: '1', receiptId: body.p_receipt_id, userId: mode === 'foreign' ? randomUUID() : owner,
      modelId: body.p_model_id, poolRole: body.p_pool_role, inputTokens: body.p_input, outputTokens: body.p_output,
      costUsd: body.p_cost_usd, period: usage.quota_period_start, replayed: false, usage });
  };
  try {
    assert.equal((await recordCompletedProviderUsage(owner, 'kimi_k3', 3, 2)).inputTokensUsed, 3);
    assert.equal((await recordCompletedProviderUsage(owner, 'kimi_k3', 3, 2)).inputTokensUsed, 3);
    assert.notEqual(receipts[0], receipts[1], 'distinct provider completions have distinct receipts');
    for (mode of ['outage', 'foreign']) {
      const before = paths.length;
      await assert.rejects(recordCompletedProviderUsage(owner, 'kimi_k3', 3, 2), {
        code: 'POST_COMPLETION_ACCOUNTING_UNCERTAIN', providerCompleted: true, accountingUncertain: true, retryable: false,
      });
      assert.equal(paths.length, before + 1, 'no fallback write or invented usage after failed receipt');
    }
    const before = paths.length;
    await assert.rejects(recordCompletedProviderUsage(owner, 'kimi_k3', -1, 2), { code: 'POST_COMPLETION_ACCOUNTING_UNCERTAIN' });
    assert.equal(paths.length, before);
  } finally {
    globalThis.fetch = oldFetch;
    ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].forEach((key, i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; });
  }
});
