import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTenantContext } from '../../security/tenantContext.js';
import { planSemanticRequest } from './semanticRequestPlanner.js';

test('actual semantic planner carries issued actor, platform reservation and exact payload through the SDK', async t => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const foreign = '22222222-2222-4222-8222-222222222222';
  const context = createTenantContext({ userId: owner, via: 'remote_getuser' });
  const env = { NODE_ENV: 'test', SUPABASE_URL: 'http://127.0.0.1:55439', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-loopback-only',
    OPENROUTER_API_KEY: 'synthetic-platform-credential', DEEPSEEK_V4_FLASH_MODEL_ID: 'deepseek/deepseek-v4-flash' };
  const prior = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => { for (const key of Object.keys(env)) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; } });
  let effects = 0, reservations = 0, settlements = 0, receipts = 0;
  let mode = 'ok';
  const held = new Map<string, Record<string, unknown>>();
  const usage = { user_id: owner, plan_tier: 'spark', plan_budget_usd: 20,
    quota_period_start: new Date().toISOString().slice(0, 7) + '-01', input_tokens: 0, output_tokens: 0, spent_usd: 0, rollover_usd: 0, model_usage: {} };
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (url.origin === 'https://openrouter.ai') {
      effects++;
      assert.equal(reservations, settlements + 1);
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer ' + env.OPENROUTER_API_KEY);
      assert.equal(init?.redirect, 'error');
      assert.ok(body.messages.some((message: { content: string }) => message.content.includes('Explain a safe local parser')));
      assert.doesNotMatch(JSON.stringify(body), /synthetic-platform-credential/);
      return Response.json({ id: 'synthetic-planner-result', choices: [{ message: { content: JSON.stringify({
        semanticIntent: 'ANSWER', requiredCapabilities: ['conversation.respond'], freshnessRequirement: 'NONE', confidence: 0.9,
      }) }, finish_reason: 'stop' }], usage: { prompt_tokens: 2, completion_tokens: 2 } });
    }
    assert.equal(url.origin, env.SUPABASE_URL, 'No unlisted transport is allowed');
    if (url.pathname === '/rest/v1/user_token_usage') {
      assert.equal(url.searchParams.get('user_id'), 'eq.' + owner);
      return Response.json(usage);
    }
    if (url.pathname === '/rest/v1/model_provider_health') return Response.json(null);
    if (url.pathname.endsWith('/reserve_xroga_provider_budget')) {
      assert.equal(body.p_user_id, owner); reservations++;
      const row = { id: randomUUID(), user_id: mode === 'foreign-reservation' ? foreign : owner, status: 'reserved',
        idempotency_key: body.p_idempotency_key, internal_route: body.p_internal_route, purpose: body.p_purpose,
        price_version: body.p_price_version, estimated_input_tokens: body.p_estimated_input_tokens,
        maximum_output_tokens: body.p_maximum_output_tokens, reserved_micro_usd: body.p_reservation_micro_usd };
      held.set(row.id, row); return Response.json(row);
    }
    if (url.pathname.endsWith('/settle_xroga_provider_budget')) {
      settlements++; const row = held.get(body.p_reservation_id); assert.ok(row);
      return Response.json({ ...row, status: 'settled', settled_micro_usd: body.p_actual_micro_usd,
        provider_request_id: body.p_provider_request_id, actual_input_tokens: body.p_actual_input_tokens,
        cached_input_tokens: body.p_cached_input_tokens, output_tokens: body.p_output_tokens,
        reasoning_tokens: body.p_reasoning_tokens, tool_calls: body.p_tool_calls, search_calls: body.p_search_calls });
    }
    if (url.pathname.endsWith('/record_ai_usage_atomic')) {
      receipts++; assert.equal(body.p_user_id, owner);
      return Response.json({ userId: owner, receiptId: body.p_receipt_id, modelId: body.p_model_id,
        poolRole: body.p_pool_role, inputTokens: body.p_input, outputTokens: body.p_output,
        costUsd: body.p_cost_usd, ledgerId: '1', period: usage.quota_period_start, replayed: false, usage });
    }
    throw Error('Unexpected database operation: ' + url.pathname);
  });
  const request = { userId: owner, tenantContext: context, message: 'Explain a safe local parser' };
  const plan = await planSemanticRequest(request);
  assert.equal(plan.dispatch, 'chat');
  assert.deepEqual([effects, reservations, settlements, receipts], [1, 1, 1, 1]);
  await assert.rejects(planSemanticRequest({ ...request, tenantContext: { ...context } }), { code: 'TENANT_AUTH_REQUIRED' });
  await assert.rejects(planSemanticRequest({ ...request, userId: foreign }), { code: 'RESOURCE_NOT_FOUND' });
  assert.equal(effects, 1);
  mode = 'foreign-reservation';
  await assert.rejects(planSemanticRequest(request), { code: 'PROVIDER_RESERVATION_DENIED' });
  assert.deepEqual([effects, reservations, settlements, receipts], [1, 2, 1, 1], 'Invalid reservation cannot start another provider/account or fabricate usage');
});
