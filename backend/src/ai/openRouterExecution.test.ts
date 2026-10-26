import assert from 'node:assert/strict';
import { test } from 'node:test';

import { chatCompletion } from './openaiCompat.js';
import { executeWithProviderFallback, resetModelRuntimeHealth } from './providerRuntime.js';

const model = 'z-ai/glm-5.3';
const endpoints = [
  { status: 0, tag: 'wafer/us', provider_name: 'Wafer', model_id: model,
    context_length: 1_048_576, pricing: { prompt: '0.000000079', completion: '0.0000014', input_cache_read: '0.000000078' },
    supported_parameters: ['temperature', 'reasoning', 'max_tokens', 'tools', 'response_format'] },
  { status: 0, tag: 'sail-research/us', provider_name: 'Sail Research', model_id: model,
    context_length: 1_048_576, pricing: { prompt: '0.0000005', completion: '0.000002', input_cache_read: '0.00000008' },
    supported_parameters: ['temperature', 'reasoning', 'max_tokens', 'tools', 'response_format'] },
];

function completion(provider: string): Response {
  return Response.json({ id: 'mock-completion', object: 'chat.completion', created: 1,
    model, provider, choices: [{ index: 0, message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10, cost: 0.00001,
      prompt_tokens_details: { cached_tokens: 1 }, completion_tokens_details: { reasoning_tokens: 0 } } });
}

function unavailable(): Response {
  return Response.json({ error: { message: 'Provider temporarily unavailable', code: 429 } }, { status: 429 });
}

function requestUrl(input: Parameters<typeof fetch>[0]): string {
  return input instanceof Request ? input.url : String(input);
}

test('actual OpenAI-compatible request pins the primary, then only the approved fallback', async () => {
  const calls: Array<{ only: string[]; order: string[]; allow_fallbacks: boolean }> = [];
  try {
    const fetcher: typeof fetch = async (input, init) => {
      const url = requestUrl(input);
      if (url.endsWith('/endpoints')) return Response.json({ data: { endpoints } });
      assert.ok(url.endsWith('/chat/completions'));
      const body = JSON.parse(String(init?.body)) as { provider: typeof calls[number] };
      calls.push(body.provider);
      assert.deepEqual(body.provider.only, body.provider.order);
      assert.equal(body.provider.allow_fallbacks, false);
      return calls.length === 1 ? unavailable() : completion('Sail Research');
    };
    const result = await chatCompletion('glm_5_3', [{ role: 'user', content: 'Say OK' }],
      { maxTokens: 64, credentialOverride: 'test-key', fetcher });
    assert.deepEqual(calls.map(call => call.only), [['wafer/us'], ['sail-research/us']]);
    assert.deepEqual(result.providerAttempts, ['wafer/us', 'sail-research/us']);
    assert.equal(result.upstreamProvider, 'Sail Research');
    assert.equal(result.actualCostUsd, 0.00001);
    assert.equal(result.cachedInputTokens, 1);
  } finally { resetModelRuntimeHealth(); }
});

test('GLM Flash compact requests preserve mandatory reasoning and use only approved providers', async () => {
  const flashModel = 'z-ai/glm-5.3-flash';
  const flashEndpoints = [
    { status: 0, tag: 'relace', provider_name: 'Relace', model_id: flashModel,
      context_length: 202_752, pricing: { prompt: '0.0000000413', completion: '0.0000000758', input_cache_read: '0.00000002' },
      supported_parameters: ['temperature', 'reasoning', 'max_tokens', 'tools'] },
    { status: 0, tag: 'open-inference/fp4', provider_name: 'OpenInference', model_id: flashModel,
      context_length: 202_752, pricing: { prompt: '0.000000110038', completion: '0.00000001', input_cache_read: '0.00000002' },
      supported_parameters: ['temperature', 'reasoning', 'max_tokens', 'tools', 'response_format'] },
  ];
  for (const failPrimary of [false, true]) {
    const calls: Array<{ provider: { only: string[]; order: string[]; allow_fallbacks: boolean }; reasoning?: unknown }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      if (requestUrl(input).endsWith('/endpoints')) return Response.json({ data: { endpoints: flashEndpoints } });
      const body = JSON.parse(String(init?.body)) as typeof calls[number];
      calls.push(body);
      assert.equal(body.reasoning, undefined);
      assert.deepEqual(body.provider.only, body.provider.order);
      assert.equal(body.provider.allow_fallbacks, false);
      if (failPrimary && calls.length === 1) return unavailable();
      return Response.json({ id: 'flash-completion', object: 'chat.completion', created: 1,
        model: flashModel, provider: failPrimary ? 'OpenInference' : 'Relace',
        choices: [{ index: 0, message: { role: 'assistant', content: '15' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 25, completion_tokens: 37, cost: 0.0000038 } });
    };
    const result = await chatCompletion('glm_5_3_flash', [{ role: 'user', content: 'What is 7 + 8?' }],
      { maxTokens: 220, reasoningMode: 'none', credentialOverride: 'test-key', fetcher });
    assert.equal(result.text, '15');
    assert.deepEqual(calls.map(call => call.provider.only[0]), failPrimary
      ? ['relace', 'open-inference/fp4'] : ['relace']);
  }
});

test('both endpoint failures remain within the approved pair and model fallback is bounded', async () => {
  const calls: string[] = [];
  try {
    const fetcher: typeof fetch = async (input, init) => {
      if (requestUrl(input).endsWith('/endpoints')) return Response.json({ data: { endpoints } });
      const body = JSON.parse(String(init?.body)) as { provider: { only: string[] } };
      calls.push(body.provider.only[0]!);
      return unavailable();
    };
    const outcome = await executeWithProviderFallback({
      routes: ['glm_5_3', 'glm_5_3_flash'], maximumAttemptsPerRoute: 1,
      recordHealth: false,
      execute: async (route) => {
        if (route === 'glm_5_3') return chatCompletion(route,
          [{ role: 'user', content: 'Say OK' }], { maxTokens: 64, credentialOverride: 'test-key', fetcher });
        return { text: 'fallback', modelId: route };
      },
    });
    assert.equal(outcome.modelId, 'glm_5_3_flash');
    assert.deepEqual(calls, ['wafer/us', 'sail-research/us']);
  } finally { resetModelRuntimeHealth(); }
});

test('an unapproved actual upstream identity is rejected even after a pinned request', async () => {
  try {
    const fetcher: typeof fetch = async (input) => requestUrl(input).endsWith('/endpoints')
      ? Response.json({ data: { endpoints } }) : completion('Unknown Third Provider');
    await assert.rejects(chatCompletion('glm_5_3', [{ role: 'user', content: 'Say OK' }],
      { maxTokens: 64, credentialOverride: 'test-key', fetcher }), /unapproved upstream provider/);
  } finally { resetModelRuntimeHealth(); }
});

test('a paid empty response does not buy a second provider or model call', async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    if (requestUrl(input).endsWith('/endpoints')) return Response.json({ data: { endpoints } });
    const body = JSON.parse(String(init?.body)) as { provider: { only: string[] } };
    calls.push(body.provider.only[0]!);
    return Response.json({ id: 'billed-empty', object: 'chat.completion', created: 1, model,
      provider: 'Wafer', choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 8, completion_tokens: 64, cost: 0.00009 } });
  };
  let modelFallbackCalls = 0;
  await assert.rejects(executeWithProviderFallback({
    routes: ['glm_5_3', 'glm_5_3_flash'], maximumAttemptsPerRoute: 1, recordHealth: false,
    execute: async (route) => {
      if (route === 'glm_5_3') return chatCompletion(route,
        [{ role: 'user', content: 'Say OK' }], { maxTokens: 64, credentialOverride: 'test-key', fetcher });
      modelFallbackCalls += 1;
      return { text: 'fallback', modelId: route };
    },
  }), (error: unknown) => (error as { code?: unknown }).code === 'BILLED_EMPTY_PROVIDER_RESPONSE');
  assert.deepEqual(calls, ['wafer/us']);
  assert.equal(modelFallbackCalls, 0);
  resetModelRuntimeHealth();
});
