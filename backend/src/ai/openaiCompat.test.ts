import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requireNonEmptyModelText } from './openaiCompat.js';

describe('provider completion boundary', () => {
  it('accepts a real non-empty completion', () => {
    assert.equal(requireNonEmptyModelText('  generated files  ', 'kimi_k3'), 'generated files');
  });

  it('classifies an empty completion as a provider failure so fallback can continue', () => {
    assert.throws(
      () => requireNonEmptyModelText('   \n ', 'deepseek_v4_pro'),
      (error: unknown) =>
        error instanceof Error &&
        (error as Error & { code?: string }).code === 'EMPTY_PROVIDER_RESPONSE',
    );
  });
});
