import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MODELS } from './models.js';
import { APPROVED_OPENROUTER_ENDPOINTS, modelPriceCaps, pinnedProviderRequest,
  retryOtherApprovedEndpoint, validatedOpenRouterEndpoints } from './openRouterRouting.js';

const rows = [
  { tag: 'baidu/fp8', provider_name: 'Baidu', model_id: 'deepseek/deepseek-v4.1-flash',
    context_length: 1_048_576, pricing: { prompt: '0.0000000537', completion: '0.0000002148', input_cache_read: '0.000000001074' },
    supported_parameters: ['tools', 'response_format', 'structured_outputs'] },
  { tag: 'sail-research/fp4', provider_name: 'Sail Research', model_id: 'deepseek/deepseek-v4.1-flash',
    context_length: 1_048_576, pricing: { prompt: '0.00000009', completion: '0.00000025', input_cache_read: '0.000000006' },
    supported_parameters: ['tools', 'response_format', 'structured_outputs'] },
  { tag: 'relace', provider_name: 'Relace', model_id: 'z-ai/glm-5.3-flash',
    context_length: 1_048_576, pricing: { prompt: '0.0000000513', completion: '0.0000000701', input_cache_read: '0.00000003' },
    supported_parameters: ['tools'] },
  { tag: 'open-inference/fp4', provider_name: 'OpenInference', model_id: 'z-ai/glm-5.3-flash',
    context_length: 1_048_576, pricing: { prompt: '0.000000066466', completion: '0.000000069786', input_cache_read: '0.000000017825' },
    supported_parameters: ['tools', 'response_format'] },
  { tag: 'wafer/us', provider_name: 'Wafer', model_id: 'z-ai/glm-5.3',
    context_length: 1_048_576, pricing: { prompt: '0.000000079', completion: '0.0000014', input_cache_read: '0.000000078' },
    supported_parameters: ['tools', 'response_format'] },
  { tag: 'sail-research/us', provider_name: 'Sail Research', model_id: 'z-ai/glm-5.3',
    context_length: 1_048_576, pricing: { prompt: '0.0000005', completion: '0.000002', input_cache_read: '0.00000008' },
    supported_parameters: ['tools', 'response_format'] },
  { tag: 'wafer/fp4', provider_name: 'Wafer', model_id: 'z-ai/glm-5.3',
    context_length: 1_048_576, pricing: { prompt: '0.000000179', completion: '0.0000014', input_cache_read: '0.000000178' },
    supported_parameters: ['tools', 'response_format'] },
  { tag: 'unapproved', provider_name: 'Someone Else', model_id: 'z-ai/glm-5.3',
    context_length: 1_048_576, pricing: { prompt: '0', completion: '0', input_cache_read: '0' },
    supported_parameters: ['tools', 'response_format'] },
];
const catalog = async () => Response.json({ data: { endpoints: rows } });

test('the only four configured models use OpenRouter with exact audited IDs', () => {
  assert.deepEqual(Object.values(MODELS).map(model => model.apiModel).sort(), [
    'deepseek/deepseek-v4.1-flash', 'moonshotai/kimi-k3', 'z-ai/glm-5.3', 'z-ai/glm-5.3-flash',
  ]);
  assert.ok(Object.values(MODELS).every(model => model.provider === 'openrouter'
    && model.secretKey === 'OPENROUTER_API_KEY'));
  assert.equal(Object.keys(APPROVED_OPENROUTER_ENDPOINTS).length, 4);
});

test('live-verified cheaper Baidu DeepSeek endpoint is primary and Sail is the only fallback', async () => {
  const endpoints = await validatedOpenRouterEndpoints('deepseek_v4_flash', { fetcher: catalog });
  assert.deepEqual(endpoints.map(endpoint => endpoint.tag), ['baidu/fp8', 'sail-research/fp4']);
  assert.deepEqual(pinnedProviderRequest(endpoints[0]!, 'deepseek_v4_flash'), {
    order: ['baidu/fp8'], only: ['baidu/fp8'], allow_fallbacks: false,
    require_parameters: true, max_price: { prompt: 0.09, completion: 0.25 },
  });
});

test('Wafer cheap endpoint is first; Sail Research is the only fallback', async () => {
  const endpoints = await validatedOpenRouterEndpoints('glm_5_3', { fetcher: catalog });
  assert.deepEqual(endpoints.map(endpoint => endpoint.tag), ['wafer/us', 'sail-research/us']);
  assert.equal(endpoints[0]?.inputUsdPer1M, 0.079);
  assert.equal(endpoints[1]?.outputUsdPer1M, 2);
  assert.deepEqual(pinnedProviderRequest(endpoints[0]!, 'glm_5_3'), {
    order: ['wafer/us'], only: ['wafer/us'], allow_fallbacks: false,
    require_parameters: true, max_price: { prompt: 0.5, completion: 2 },
  });
});

test('raised or exceeded prices fail closed, including the expensive Wafer variant', async () => {
  assert.throws(() => modelPriceCaps('glm_5_3', { XROGA_GLM_5_3_MAX_INPUT_USD_PER_1M: '4' }),
    /price ceiling/);
  const endpoints = await validatedOpenRouterEndpoints('glm_5_3', {
    fetcher: catalog, env: { XROGA_GLM_5_3_MAX_INPUT_USD_PER_1M: '0.1' },
  });
  assert.deepEqual(endpoints.map(endpoint => endpoint.tag), ['wafer/us']);
  await assert.rejects(validatedOpenRouterEndpoints('glm_5_3', {
    fetcher: async () => Response.json({ data: { endpoints: rows.map(row => ({ ...row,
      pricing: { ...row.pricing, completion: '0.000009' } })) } }),
  }), /No approved compatible endpoint/);
});

test('unsupported image and structured/tool capability requests do not hit incompatible endpoints', async () => {
  await assert.rejects(validatedOpenRouterEndpoints('glm_5_3', { images: true, fetcher: catalog }),
    /Image input has not been verified/);
  assert.deepEqual((await validatedOpenRouterEndpoints('glm_5_3_flash',
    { images: true, fetcher: catalog })).map(endpoint => endpoint.tag), ['open-inference/fp4']);
  const endpoints = await validatedOpenRouterEndpoints('glm_5_3', { json: true, tools: true, fetcher: catalog });
  assert.deepEqual(endpoints.map(endpoint => endpoint.tag), ['wafer/us', 'sail-research/us']);
  const noJson = async () => Response.json({ data: { endpoints: rows.map(row => ({ ...row,
    supported_parameters: ['tools'] })) } });
  await assert.rejects(validatedOpenRouterEndpoints('glm_5_3', { json: true, fetcher: noJson }),
    /No approved compatible endpoint/);
});

test('only transient provider errors permit the second approved endpoint', () => {
  assert.equal(retryOtherApprovedEndpoint(Object.assign(new Error('limited'), { status: 429 })), true);
  assert.equal(retryOtherApprovedEndpoint(Object.assign(new Error('endpoint unavailable'), { status: 404 })), true);
  assert.equal(retryOtherApprovedEndpoint(Object.assign(new Error('bad request'), { status: 400 })), false);
  assert.equal(retryOtherApprovedEndpoint(Object.assign(new Error('paid empty response'),
    { code: 'BILLED_EMPTY_PROVIDER_RESPONSE' })), false);
  assert.equal(retryOtherApprovedEndpoint(new Error('arbitrary')), false);
});
