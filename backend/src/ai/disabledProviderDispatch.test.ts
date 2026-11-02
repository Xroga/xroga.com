import assert from 'node:assert/strict';
import test from 'node:test';
import { assertModelProviderDestination } from './providerPolicy.js';
import { resolveEndpoint, createModelProviderClient } from './openaiCompat.js';
import { reserveProviderBudget, reserveOperationsProviderBudget } from './providerBudget.js';
import { isTerminalModelFailure } from './providerRuntime.js';

test('disabled GLM is denied before credentials, reservations or any HTTP request', async () => {
  const previous = process.env.XROGA_DISABLED_PROVIDERS;
  const originalFetch = globalThis.fetch;
  let wires = 0;
  globalThis.fetch = async () => { wires++; throw Error('No network is permitted in this test'); };
  try {
    process.env.XROGA_DISABLED_PROVIDERS = ' zhipu ';
    for (const modelId of ['glm_5_3', 'glm_5_3_flash'] as const) {
      assert.throws(() => resolveEndpoint(modelId, 'synthetic-bypass-key'), { code: 'MODEL_DESTINATION_DENIED' });
      await assert.rejects(reserveProviderBudget({ userId: 'unused', modelId,
        estimatedInputTokens: 10, maximumOutputTokens: 10 }), { code: 'MODEL_DESTINATION_DENIED' });
      await assert.rejects(reserveOperationsProviderBudget({ ownerId: 'unused', actorId: 'unused',
        admittedAction: {}, idempotencyKey: 'unused', modelId, estimatedInputTokens: 10,
        maximumOutputTokens: 10 }), { code: 'MODEL_DESTINATION_DENIED' });
    }
    assert.throws(() => assertModelProviderDestination('zhipu', 'https://open.bigmodel.cn/api/paas/v4'),
      error => isTerminalModelFailure(error));
    assert.doesNotThrow(() => assertModelProviderDestination('openrouter', 'https://openrouter.ai/api/v1'));
    assert.equal(wires, 0);
  } finally {
    if (previous === undefined) delete process.env.XROGA_DISABLED_PROVIDERS;
    else process.env.XROGA_DISABLED_PROVIDERS = previous;
    globalThis.fetch = originalFetch;
  }
});

test('a cached SDK client cannot dispatch after its provider is disabled', async () => {
  const previous = process.env.XROGA_DISABLED_PROVIDERS;
  const originalFetch = globalThis.fetch;
  let wires = 0;
  globalThis.fetch = async () => { wires++; throw Error('No network is permitted in this test'); };
  try {
    delete process.env.XROGA_DISABLED_PROVIDERS;
    const client = createModelProviderClient({ provider: 'zhipu', apiModel: 'glm-5.3-flash',
      apiKey: 'synthetic-disabled-provider-test', baseUrl: 'https://open.bigmodel.cn/api/paas/v4' });
    process.env.XROGA_DISABLED_PROVIDERS = 'zhipu';
    await assert.rejects(client.chat.completions.create({ model: 'glm-5.3-flash', max_tokens: 10,
      messages: [{ role: 'user', content: 'synthetic' }] }), { code: 'MODEL_DESTINATION_DENIED', status: 400 });
    assert.equal(wires, 0);
  } finally {
    if (previous === undefined) delete process.env.XROGA_DISABLED_PROVIDERS;
    else process.env.XROGA_DISABLED_PROVIDERS = previous;
    globalThis.fetch = originalFetch;
  }
});
