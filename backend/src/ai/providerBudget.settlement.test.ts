import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { PROVIDER_PRICE_VERSION, actualProviderCostMicroUsd, estimateProviderReservationMicroUsd, settleProviderBudget, withProviderReservation, type ProviderUsageResult } from './providerBudget.js';
import { executeWithProviderFallback } from './providerRuntime.js';

test('settlement requires an exact durable receipt and wrapper failures retain uncertain spend', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const reservation = { id: '22222222-2222-4222-8222-222222222222', reservedMicroUsd: estimateProviderReservationMicroUsd({ modelId: 'kimi_k3', estimatedInputTokens: 100, maximumOutputTokens: 100 }), priceVersion: PROVIDER_PRICE_VERSION };
  const result: ProviderUsageResult = { providerRequestId: ' fixture-request ', inputTokens: 10, outputTokens: 20, cachedInputTokens: 2, reasoningTokens: 3, toolCalls: 1, searchCalls: 1 };
  const actual = actualProviderCostMicroUsd({ modelId: 'kimi_k3', ...result });
  const receipt = { id: reservation.id, user_id: userId, status: 'settled', internal_route: 'kimi_k3', price_version: PROVIDER_PRICE_VERSION,
    reserved_micro_usd: reservation.reservedMicroUsd, settled_micro_usd: actual, provider_request_id: 'fixture-request',
    actual_input_tokens: 10, cached_input_tokens: 2, output_tokens: 20, reasoning_tokens: 3, tool_calls: 1, search_calls: 1 };
  let evidence: unknown = receipt;
  let holds = 0;
  let settlementCalls = 0;
  let failSettlement = false;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(body.p_user_id, userId);
    let response: unknown;
    if (req.url === '/rest/v1/rpc/reserve_xroga_provider_budget') {
      response = { id: reservation.id, reserved_micro_usd: reservation.reservedMicroUsd, price_version: PROVIDER_PRICE_VERSION,
        user_id: userId, idempotency_key: body.p_idempotency_key, internal_route: body.p_internal_route, purpose: body.p_purpose,
        estimated_input_tokens: body.p_estimated_input_tokens, maximum_output_tokens: body.p_maximum_output_tokens, status: 'reserved' };
    } else if (req.url === '/rest/v1/rpc/settle_xroga_provider_budget') {
      settlementCalls++;
      assert.equal(body.p_reservation_id, reservation.id);
      response = failSettlement ? { message: 'Synthetic accounting authority unavailable' } : evidence;
    } else {
      assert.equal(req.url, '/rest/v1/rpc/release_xroga_provider_budget');
      assert.equal(body.p_reservation_id, reservation.id);
      assert.equal(body.p_pending_reconciliation, true, 'Completed provider spending must never be released after accounting failure');
      holds++;
      response = { status: 'pending_reconciliation' };
    }
    res.writeHead(failSettlement && req.url?.includes('/settle_') ? 403 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(response));
  });
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    const settle = () => settleProviderBudget({ userId, modelId: 'kimi_k3', reservation, result });
    for (evidence of [null, {}, [], ...[
      { id: 'other' }, { user_id: 'other' }, { status: 'reserved' }, { status: 'released' },
      { internal_route: 'other' }, { price_version: 'other' }, { reserved_micro_usd: reservation.reservedMicroUsd + 1 },
      { settled_micro_usd: actual + 1 }, { provider_request_id: 'other' }, { actual_input_tokens: 11 },
      { cached_input_tokens: null }, { output_tokens: 21 }, { reasoning_tokens: 4 }, { tool_calls: 2 }, { search_calls: 2 },
    ].map(change => ({ ...receipt, ...change }))]) await assert.rejects(settle(), /settlement evidence/);
    evidence = receipt;
    await settle(); await settle(); // Exact already-settled replay remains compatible.
    evidence = { ...receipt, settled_micro_usd: String(actual), reserved_micro_usd: String(reservation.reservedMicroUsd) };
    await settle();
    let executions = 0;
    const run = (executeResult: ProviderUsageResult = result) => withProviderReservation({ userId, modelId: 'kimi_k3', estimatedInputTokens: 100, maximumOutputTokens: 100,
      execute: async () => { executions++; return executeResult; } });
    evidence = null;
    await assert.rejects(run(), { code: 'POST_COMPLETION_ACCOUNTING_UNCERTAIN', retryable: false });
    failSettlement = true;
    await assert.rejects(run(), { code: 'POST_COMPLETION_ACCOUNTING_UNCERTAIN', retryable: false });
    failSettlement = false;
    // Even an accounting adapter error whose text resembles a provider auth
    // failure must retain a hold once execution has returned successfully.
    const brokenReceipt: ProviderUsageResult = { inputTokens: 10, outputTokens: 20,
      get providerRequestId(): string { throw new Error('authentication failure reading receipt'); } };
    await assert.rejects(run(brokenReceipt), { code: 'POST_COMPLETION_ACCOUNTING_UNCERTAIN', retryable: false });
    assert.equal(executions, 3); assert.equal(holds, 3);
    assert.equal(settlementCalls, 23);
    evidence = null;
    await assert.rejects(executeWithProviderFallback({routes:['kimi_k3','deepseek_v4_flash'],recordHealth:false,
      execute:async()=>run(),sleep:async()=>{throw new Error('Completed provider must not be retried');}}),
      {code:'POST_COMPLETION_ACCOUNTING_UNCERTAIN',retryable:false});
    assert.equal(executions,4);assert.equal(holds,4);assert.equal(settlementCalls,24);
  } finally {
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
