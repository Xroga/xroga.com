import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  capabilityIsUsable,
  getCapability,
  getCapabilityRegistry,
} from './capabilityRegistry.js';

describe('capability registry', () => {
  it('reports missing provider credentials instead of fake availability', () => {
    const capability = getCapability('web_research', {});
    assert.equal(capabilityIsUsable(capability), false);
    assert.ok(
      capability.providers.every(
        (provider) => provider.availability === 'requires_configuration',
      ),
    );
  });

  it('marks a provider available only when a supported credential is configured', () => {
    const capability = getCapability('web_research', { TAVILY_API_KEY: 'configured' });
    const tavily = capability.providers.find((provider) => provider.id === 'tavily');
    assert.equal(tavily?.availability, 'available');
  });

  it('keeps user-authorized operations distinct from globally available providers', () => {
    const github = getCapability('github_operations', {});
    assert.equal(github.providers[0]?.availability, 'requires_user_authorization');
    assert.equal(capabilityIsUsable(github), true);
  });

  it('provides execution and validation metadata for every provider', () => {
    const registry = getCapabilityRegistry({});
    assert.ok(registry.length >= 15);
    for (const capability of registry) {
      assert.ok(capability.providers.length > 0, capability.id);
      for (const provider of capability.providers) {
        assert.ok(provider.operations.length > 0, provider.id);
        assert.ok(provider.outputFormats.length > 0, provider.id);
        assert.ok(provider.validation.length > 0, provider.id);
        assert.ok(provider.securityRestrictions.length > 0, provider.id);
      }
    }
  });
});

