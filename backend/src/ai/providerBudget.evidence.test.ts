import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { PROVIDER_PRICE_VERSION, reserveProviderBudget, withProviderReservation } from './providerBudget.js';

test('malformed durable reservation evidence never reaches provider execution', async () => {
  let evidence: unknown;
  const server = createServer(async (req, res) => {
    assert.equal(req.url, '/rest/v1/rpc/reserve_xroga_provider_budget');
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(typeof evidence === 'function' ? evidence(body) : evidence));
  });
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    for (evidence of [null, {}, [], { id: 'fixture', reserved_micro_usd: 0, price_version: PROVIDER_PRICE_VERSION },
      { id: 'fixture', reserved_micro_usd: 'invalid', price_version: PROVIDER_PRICE_VERSION },
      { id: 'fixture', reserved_micro_usd: 100000, price_version: 'unexpected-version' }]) {
      let executed = false;
      await assert.rejects(withProviderReservation({ userId: '11111111-1111-4111-8111-111111111111', modelId: 'kimi_k3', estimatedInputTokens: 10, maximumOutputTokens: 10,
        execute: async () => { executed = true; return { inputTokens: 1, outputTokens: 1 }; } }), /reservation evidence is invalid/);
      assert.equal(executed, false);
    }
    const receipt = (body: Record<string, unknown>) => ({ id: '22222222-2222-4222-8222-222222222222', user_id: body.p_user_id,
      idempotency_key: body.p_idempotency_key, internal_route: body.p_internal_route, purpose: body.p_purpose,
      price_version: body.p_price_version, reserved_micro_usd: body.p_reservation_micro_usd,
      estimated_input_tokens: body.p_estimated_input_tokens, maximum_output_tokens: body.p_maximum_output_tokens, status: 'reserved' });
    for (const mismatch of [{ id: 'malformed' }, { user_id: 'other' }, { idempotency_key: 'other' }, { internal_route: 'other' },
      { purpose: 'completion' }, { price_version: 'other' }, { reserved_micro_usd: 999999 },
      { estimated_input_tokens: 11 }, { maximum_output_tokens: 11 }, { maximum_output_tokens: null },
      { status: 'settled' }, { status: 'released' }, { status: 'pending_reconciliation' }]) {
      evidence = (body: Record<string, unknown>) => ({ ...receipt(body), ...mismatch });
      let executed = false;
      await assert.rejects(withProviderReservation({ userId: '11111111-1111-4111-8111-111111111111', modelId: 'kimi_k3', estimatedInputTokens: 10, maximumOutputTokens: 10,
        execute: async () => { executed = true; return { inputTokens: 1, outputTokens: 1 }; } }), /reservation evidence is invalid/);
      assert.equal(executed, false);
    }
    evidence = (body: Record<string, unknown>) => ({ ...receipt(body), estimated_input_tokens: String(body.p_estimated_input_tokens) });
    const input = { userId: '11111111-1111-4111-8111-111111111111', modelId: 'kimi_k3' as const, estimatedInputTokens: 10, maximumOutputTokens: 10, idempotencyKey: '33333333-3333-4333-8333-333333333333' };
    assert.deepEqual(await reserveProviderBudget(input), await reserveProviderBudget(input));
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
