import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CODING_MODEL_TRANSPORT,
  ProviderPolicyError,
  RESEARCH_MODEL_TRANSPORT,
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
 * Every active engineering model uses the OpenRouter transport.
 *
 * Research models never gain project-writing authority.
 */

test(
  'only the four approved OpenRouter models may perform coding',
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
      'openrouter',
    );

    assert.equal(
      requiredCodingTransport(
        'glm_5_3',
      ),
      'openrouter',
    );

    assert.equal(
      requiredCodingTransport(
        'glm_5_3_flash',
      ),
      'openrouter',
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
  'every active model resolves only through OpenRouter',
  () => {
    for (const model of Object.values(MODELS)) {
      assert.equal(model.provider, 'openrouter');
      assert.equal(model.baseUrl, 'https://openrouter.ai/api/v1');
      assert.equal(model.secretKey, 'OPENROUTER_API_KEY');
    }
  },
);

test(
  'Grok and retired web providers are outside generic model routing',
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
        'tavily',
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
        'tavily',
      ),
      false,
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
            'tavily',
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
      chainsChecked >= 7,
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
