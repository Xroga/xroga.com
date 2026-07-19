import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  ENV_VAR_BY_PROVIDER,
  envVarForProvider,
  providerCatalog,
} from './userProviderKeys.js';

describe('userProviderKeys mapping', () => {
  it('maps common providers to env vars', () => {
    assert.equal(envVarForProvider('openai'), 'OPENAI_API_KEY');
    assert.equal(envVarForProvider('stripe'), 'STRIPE_SECRET_KEY');
    assert.equal(envVarForProvider('xai'), 'XAI_API_KEY');
    assert.equal(envVarForProvider('grok'), 'XAI_API_KEY');
  });

  it('allows custom env override', () => {
    assert.equal(envVarForProvider('custom', 'MY_SERVICE_KEY'), 'MY_SERVICE_KEY');
  });

  it('rejects bad env names', () => {
    assert.throws(() => envVarForProvider('custom', 'bad-name!'));
  });

  it('catalog covers AI + backend + payments', () => {
    const ids = providerCatalog().map((p) => p.id);
    assert.ok(ids.includes('openai'));
    assert.ok(ids.includes('stripe'));
    assert.ok(ids.includes('supabase'));
    assert.ok(ids.includes('custom'));
  });

  it('every catalog entry has env mapping except custom default', () => {
    for (const p of providerCatalog()) {
      if (p.id === 'custom') continue;
      assert.equal(ENV_VAR_BY_PROVIDER[p.id], p.envVar);
    }
  });
});
