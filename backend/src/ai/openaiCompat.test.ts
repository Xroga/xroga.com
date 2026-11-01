import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { providerReasoningControls, providerPriceControls, assertProviderControls, requireNonEmptyModelText } from './openaiCompat.js';

describe('provider completion boundary', () => {
  it('accepts a real non-empty completion', () => {
    assert.equal(requireNonEmptyModelText('  generated files  ', 'kimi_k3'), 'generated files');
  });

  it('classifies an empty completion as a provider failure so fallback can continue', () => {
    assert.throws(
      () => requireNonEmptyModelText('   \n ', 'deepseek_v4_flash'),
      (error: unknown) =>
        error instanceof Error &&
        (error as Error & { code?: string }).code === 'EMPTY_PROVIDER_RESPONSE',
    );
  });
});

describe('direct-output reasoning controls', () => {
  it('bounds DeepSeek endpoint prices to the same catalogue ceilings used for reservation', () => {
    assert.deepEqual(providerPriceControls('deepseek_v4_flash','openrouter'),{provider:{max_price:{prompt:0.60,completion:1.32,request:0},require_parameters:true}});
    assert.deepEqual(providerPriceControls('kimi_k3','moonshot'),{});
    assert.deepEqual(providerPriceControls('glm_5_3_flash','zhipu'),{});
  });
  it('disables GLM thinking with the Zhipu-supported request shape', () => {
    assert.deepEqual(providerReasoningControls('zhipu', 'none'), {
      thinking: { type: 'disabled' },
    });
  });

  it('disables and excludes reasoning through the OpenRouter-supported request shape', () => {
    assert.deepEqual(providerReasoningControls('openrouter', 'none'), {
      reasoning: { effort: 'none', exclude: true },
    });
  });

  it('does not invent an unsupported Moonshot request parameter', () => {
    assert.deepEqual(providerReasoningControls('moonshot', 'none'), {});
  });

  it('leaves ordinary model calls unchanged', () => {
    assert.deepEqual(providerReasoningControls('zhipu'), {});
  });
});

 it('serialized price or reasoning controls cannot be removed or changed before dispatch', () => {
   const expected={...providerPriceControls('deepseek_v4_flash','openrouter'),...providerReasoningControls('openrouter','none')};
   assert.doesNotThrow(()=>assertProviderControls(JSON.stringify(expected),'deepseek_v4_flash','openrouter','none'));
   for(const changed of [{},{...expected,provider:undefined},{...expected,reasoning:{exclude:true}},{...expected,provider:{max_price:{prompt:99}}}]) {
     assert.throws(()=>assertProviderControls(JSON.stringify(changed),'deepseek_v4_flash','openrouter','none'),{code:'MODEL_DISPATCH_BINDING_DENIED'});
   }
 });
