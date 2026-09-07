import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  capabilityIsUsable,
  getCapability,
  getCapabilityRegistry,
} from './capabilityRegistry.js';

describe('capability registry', () => {
  it('reports missing web provider credentials instead of fake availability', () => {
    const capability = getCapability(
      'web_research',
      {},
    );

    assert.equal(
      capabilityIsUsable(capability),
      false,
    );

    assert.ok(
      capability.providers.every(
        (provider) =>
          provider.availability ===
          'requires_configuration',
      ),
    );
  });

  it('marks Parallel web research available when PARALLEL_API_KEY is configured', () => {
    const capability = getCapability(
      'web_research',
      {
        PARALLEL_API_KEY: 'configured',
      },
    );

    assert.equal(
      capability.providers.length,
      1,
    );

    const parallel =
      capability.providers[0];

    assert.equal(
      parallel?.id,
      'parallel',
    );

    assert.equal(
      parallel?.availability,
      'available',
    );

    assert.deepEqual(
      parallel?.fallbackProviderIds,
      [],
    );
  });

  it('does not expose Tavily or SearXNG as active web research providers', () => {
    const capability = getCapability(
      'web_research',
      {
        PARALLEL_API_KEY: 'configured',
        TAVILY_API_KEY: 'configured',
        SEARXNG_URL:
          'https://legacy.example.com',
      },
    );

    const providerIds =
      capability.providers.map(
        (provider) => provider.id,
      );

    assert.deepEqual(
      providerIds,
      ['parallel'],
    );
  });

  it('marks xAI X research available with canonical XAI_API_KEY', () => {
    const capability = getCapability(
      'x_research',
      {
        XAI_API_KEY: 'configured',
      },
    );

    const xai =
      capability.providers.find(
        (provider) =>
          provider.id === 'xai',
      );

    assert.equal(
      xai?.availability,
      'available',
    );

    assert.deepEqual(
      xai?.fallbackProviderIds,
      [],
    );
  });

  it('does not accept the retired GROK_API_KEY alias for xAI availability', () => {
    const capability = getCapability(
      'x_research',
      {
        GROK_API_KEY: 'configured',
      },
    );

    const xai =
      capability.providers.find(
        (provider) =>
          provider.id === 'xai',
      );

    assert.equal(
      xai?.availability,
      'requires_configuration',
    );
  });

  it('keeps user-authorized operations distinct from globally available providers', () => {
    const github = getCapability(
      'github_operations',
      {},
    );

    assert.equal(
      github.providers[0]?.availability,
      'requires_user_authorization',
    );

    assert.equal(
      capabilityIsUsable(github),
      true,
    );
  });

  it('provides execution and validation metadata for every provider', () => {
    const registry =
      getCapabilityRegistry({});

    assert.ok(
      registry.length >= 15,
    );

    for (const capability of registry) {
      assert.ok(
        capability.providers.length > 0,
        capability.id,
      );

      for (
        const provider of
        capability.providers
      ) {
        assert.ok(
          provider.operations.length > 0,
          provider.id,
        );

        assert.ok(
          provider.outputFormats.length > 0,
          provider.id,
        );

        assert.ok(
          provider.validation.length > 0,
          provider.id,
        );

        assert.ok(
          provider.securityRestrictions
            .length > 0,
          provider.id,
        );
      }
    }
  });
});
