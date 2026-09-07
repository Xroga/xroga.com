import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CODING_MODEL_TRANSPORT,
  ProviderPolicyError,
  RESEARCH_MODEL_TRANSPORT,
  TAVILY_PROVIDER_ID,
  assertCodingModel,
  codingModelsOnly,
  isCodingModel,
  isResearchModel,
  requiredCodingTransport,
} from './providerPolicy.js';

import {
  MODELS,
} from './models.js';

import {
  capabilityCandidates,
} from '../synthesis/universalEntrypoint.js';

/**
 * Provider isolation.
 *
 * Engineering authority:
 *
 * Kimi     → Moonshot
 * GLM      → Zhipu / Z.ai official
 * DeepSeek → OpenRouter
 *
 * Research models never gain project-writing authority.
 */

test(
  'only Moonshot, Zhipu and OpenRouter models may perform coding',
  () => {
    assert.deepEqual(
      Object.keys(
        CODING_MODEL_TRANSPORT,
      ).sort(),
      [
        'deepseek_v4_flash',
        'glm_5_3',
        'glm_5_3_flash',
        'kimi_k3',
      ],
    );
  },
);

test(
  'every coding model is bound to an approved coding transport',
  () => {
    for (
      const transport of
      Object.values(
        CODING_MODEL_TRANSPORT,
      )
    ) {
      assert.ok(
        [
          'moonshot',
          'zhipu',
          'openrouter',
        ].includes(
          transport,
        ),
        `${transport} is not an approved coding transport`,
      );
    }
  },
);

test(
  'each coding family uses its mandated transport',
  () => {
    assert.equal(
      requiredCodingTransport(
        'kimi_k3',
      ),
      'moonshot',
    );

    assert.equal(
      requiredCodingTransport(
        'glm_5_3',
      ),
      'zhipu',
    );

    assert.equal(
      requiredCodingTransport(
        'glm_5_3_flash',
      ),
      'zhipu',
    );

    assert.equal(
      requiredCodingTransport(
        'deepseek_v4_flash',
      ),
      'openrouter',
    );
  },
);

test(
  'Kimi and currently registered GLM models are never routed through OpenRouter',
  () => {
    assert.ok(
      !MODELS.kimi_k3.baseUrl.includes(
        'openrouter',
      ),
      MODELS.kimi_k3.baseUrl,
    );

    assert.ok(
      !MODELS.glm_5_3.baseUrl.includes(
        'openrouter',
      ),
      MODELS.glm_5_3.baseUrl,
    );

    assert.ok(
      !MODELS.glm_5_3_flash.baseUrl.includes('openrouter'),
      MODELS.glm_5_3_flash.baseUrl,
    );

    assert.ok(
      MODELS.deepseek_v4_flash
        .baseUrl
        .includes(
          'openrouter',
        ),
    );
  },
);

test(
  'Grok and Tavily are not coding models',
  () => {
    assert.equal(
      isCodingModel(
        'grok_4_5',
      ),
      false,
    );

    assert.equal(
      isCodingModel(
        'grok_4_3',
      ),
      false,
    );

    assert.equal(
      isCodingModel(
        TAVILY_PROVIDER_ID,
      ),
      false,
    );

    assert.equal(
      isResearchModel(
        'grok_4_5',
      ),
      false,
    );

    assert.equal(
      isResearchModel(
        'grok_4_3',
      ),
      false,
    );

    assert.equal(
      isResearchModel(
        TAVILY_PROVIDER_ID,
      ),
      true,
    );
  },
);

test(
  'Grok is physically absent from the generic model and transport registries',
  () => {
    assert.deepEqual(RESEARCH_MODEL_TRANSPORT, {});
    assert.equal((MODELS as Record<string, unknown>).grok_4_5, undefined);
    assert.equal((MODELS as Record<string, unknown>).grok_4_3, undefined);
  },
);

test(
  'an unknown model is refused rather than assumed capable',
  () => {
    assert.equal(
      isCodingModel(
        'some_future_model',
      ),
      false,
    );

    assert.equal(
      isCodingModel(
        undefined,
      ),
      false,
    );

    assert.equal(
      isCodingModel(
        null,
      ),
      false,
    );
  },
);

test(
  'assertCodingModel refuses a research provider by name',
  () => {
    assert.throws(
      () =>
        assertCodingModel(
          'grok_4_5',
          'universal implementation',
        ),

      (
        error: unknown,
      ) => {
        assert.ok(
          error instanceof
            ProviderPolicyError,
        );

        assert.match(
          error.message,
          /grok_4_5/,
        );

        assert.match(
          error.message,
          /not a coding provider/i,
        );

        return true;
      },
    );

    assert.doesNotThrow(
      () =>
        assertCodingModel(
          'kimi_k3',
          'universal implementation',
        ),
    );

    assert.doesNotThrow(
      () =>
        assertCodingModel(
          'glm_5_3',
          'universal implementation',
        ),
    );

    assert.doesNotThrow(
      () =>
        assertCodingModel(
          'glm_5_3_flash',
          'universal implementation',
        ),
    );
  },
);

test(
  'codingModelsOnly strips research providers from a candidate list',
  () => {
    const filtered =
      codingModelsOnly([
        {
          modelId:
            'kimi_k3',
        },

        {
          modelId:
            'grok_4_3',
        },

        {
          modelId:
            'glm_5_3',
        },

        {
          modelId:
            'glm_5_3_flash',
        },

        {
          modelId:
            TAVILY_PROVIDER_ID,
        },
      ]);

    assert.deepEqual(
      filtered.map(
        (candidate) =>
          candidate.modelId,
      ),
      [
        'kimi_k3',
        'glm_5_3',
        'glm_5_3_flash',
      ],
    );
  },
);

test(
  'no coding model falls back to a research provider',
  async () => {
    const {
      getRuntimeModelRegistry,
    } = await import(
      './modelCapabilityRegistry.js'
    );

    const registry =
      getRuntimeModelRegistry();

    const coding =
      registry.filter(
        (model) =>
          isCodingModel(
            model.id,
          ),
      );

    assert.ok(
      coding.length >= 4,
      'expected callable coding models in the registry',
    );

    let chainsChecked = 0;

    for (
      const model of coding
    ) {
      assert.ok(
        model.preferredFallbacks
          .length > 0,
        `${model.id} has no fallback chain to check`,
      );

      for (
        const fallback of
        model.preferredFallbacks
      ) {
        chainsChecked += 1;

        assert.equal(
          isResearchModel(
            fallback,
          ),
          false,
          `coding model ${model.id} falls back to research provider ${fallback}`,
        );
      }
    }

    assert.ok(
      chainsChecked >= 8,
      `expected to check real chains, checked ${chainsChecked}`,
    );
  },
);

test(
  'an admin-configured fallback order cannot reintroduce a research provider',
  async () => {
    const {
      getRuntimeModelRegistry,
    } = await import(
      './modelCapabilityRegistry.js'
    );

    const {
      getRouterAdminConfig,
    } = await import(
      './routerConfig.js'
    );

    const admin =
      getRouterAdminConfig();

    assert.ok(
      Array.isArray(
        admin.fallbackOrder,
      ),
      'admin config exposes a fallback order',
    );

    for (
      const model of
      getRuntimeModelRegistry()
    ) {
      if (
        !isCodingModel(
          model.id,
        )
      ) {
        continue;
      }

      assert.equal(
        model.preferredFallbacks
          .some(
            (fallback) =>
              isResearchModel(
                fallback,
              ),
          ),
        false,
        `${model.id} chain admits a research provider`,
      );
    }
  },
);

test(
  'the universal coding candidate list contains no research provider',
  () => {
    const candidates =
      capabilityCandidates();

    assert.ok(
      candidates.length > 0,
      'candidate list must not be empty',
    );

    for (
      const candidate of
      candidates
    ) {
      assert.equal(
        isCodingModel(
          candidate.profile
            .modelId,
        ),
        true,
        `${candidate.profile.modelId} was offered as a coding candidate`,
      );
    }
  },
);

test(
  'the generic runtime registry contains no research model',
  async () => {
    const {
      getRuntimeModelRegistry,
    } = await import(
      './modelCapabilityRegistry.js'
    );

    assert.equal(getRuntimeModelRegistry().some((model) => isResearchModel(model.id)), false);
  },
);

test(
  'a coding model still carries a usable coding prior',
  async () => {
    const {
      getRuntimeModelRegistry,
    } = await import(
      './modelCapabilityRegistry.js'
    );

    const coding =
      getRuntimeModelRegistry()
        .filter(
          (model) =>
            isCodingModel(
              model.id,
            ),
        );

    assert.ok(
      coding.length > 0,
    );

    for (
      const model of coding
    ) {
      assert.ok(
        model.strengths.coding >
          0,
        `${model.id} lost its coding prior`,
      );
    }
  },
);

test(
  'every generic model registry entry is policy-authorized for coding',
  () => {
    for (
      const id of
      Object.keys(
        MODELS,
      ) as (
        keyof typeof MODELS
      )[]
    ) {
      assert.equal(isCodingModel(id), true, `${id} is executable but lacks coding authority`);
    }
  },
);
