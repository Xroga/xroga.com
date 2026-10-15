import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { PROVIDER_PRICE_VERSION, withProviderReservation } from './providerBudget.js';

test('malformed durable reservation evidence never reaches provider execution', async () => {
  let evidence: unknown;
  const server = createServer((req, res) => {
    assert.equal(req.url, '/rest/v1/rpc/reserve_xroga_provider_budget');
    req.resume();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(evidence));
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
  } finally {
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
