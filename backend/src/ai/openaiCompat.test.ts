import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { providerReasoningControls, requireNonEmptyModelText } from './openaiCompat.js';

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
