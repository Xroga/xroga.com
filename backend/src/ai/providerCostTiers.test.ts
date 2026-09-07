import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CODING_MODEL_TIERS,
  FAMILY_TRANSPORT,
  MIN_EVIDENCE_SAMPLES,
  OPENROUTER_CODING_FAMILY,
  SUFFICIENT_VALIDATION_RATE,
  TransportPolicyError,
  assertTransportPolicy,
  chooseCostAware,
  codingTierFor,
  familyFor,
  modelAvailability,
  type ModelEvidence,
} from './providerCostTiers.js';

test(
  'each coding family has exactly one permitted transport',
  () => {
    assert.deepEqual(
      FAMILY_TRANSPORT,
      {
        kimi: 'moonshot',
        glm: 'zhipu',
        deepseek:
          'openrouter',
      },
    );
  },
);

test(
  'OpenRouter carries DeepSeek and nothing else',
  () => {
    assert.equal(
      OPENROUTER_CODING_FAMILY,
      'deepseek',
    );

    for (
      const tier of
      CODING_MODEL_TIERS
    ) {
      if (
        FAMILY_TRANSPORT[
          tier.family
        ] === 'openrouter'
      ) {
        assert.equal(
          tier.family,
          'deepseek',
        );
      }
    }
  },
);

test(
  'Kimi and GLM are refused on OpenRouter',
  () => {
    for (
      const modelId of [
        'kimi_k3',
        'glm_5_3',
        'glm_5_3_flash',
      ]
    ) {
      assert.throws(
        () =>
          assertTransportPolicy(
            modelId,
            'openrouter',
          ),
        TransportPolicyError,
      );
    }
  },
);

test(
  'models are accepted on their mandated transport',
  () => {
    assert.doesNotThrow(
      () =>
        assertTransportPolicy(
          'kimi_k3',
          'moonshot',
        ),
    );

    assert.doesNotThrow(
      () =>
        assertTransportPolicy(
          'glm_5_3',
          'zhipu',
        ),
    );

    assert.doesNotThrow(
      () =>
        assertTransportPolicy(
          'glm_5_3_flash',
          'zhipu',
        ),
    );

    assert.doesNotThrow(
      () =>
        assertTransportPolicy(
          'deepseek_v4_flash',
          'openrouter',
        ),
    );
  },
);

test(
  'unknown models have no transport',
  () => {
    assert.throws(
      () =>
        assertTransportPolicy(
          'some_new_model',
          'openrouter',
        ),
      TransportPolicyError,
    );

    assert.equal(
      familyFor(
        'some_new_model',
      ),
      null,
    );
  },
);

test(
  'the tier catalog contains exactly the four active models',
  () => {
    assert.deepEqual(
      CODING_MODEL_TIERS.map(({ modelId, family, tier }) => ({
        modelId,
        family,
        tier,
      })),
      [
        { modelId: 'kimi_k3', family: 'kimi', tier: 'premium' },
        { modelId: 'glm_5_3', family: 'glm', tier: 'premium' },
        { modelId: 'glm_5_3_flash', family: 'glm', tier: 'cost_efficient' },
        { modelId: 'deepseek_v4_flash', family: 'deepseek', tier: 'cost_efficient' },
      ],
    );
  },
);

test(
  'GLM-5.3 is a premium Zhipu route',
  () => {
    const tier =
      codingTierFor(
        'glm_5_3',
      );

    assert.equal(
      tier?.family,
      'glm',
    );

    assert.equal(
      tier?.tier,
      'premium',
    );

    assert.equal(
      tier?.modelIdEnv,
      'GLM_5_3_MODEL_ID',
    );
  },
);

test(
  'GLM-5.3 Flash is the cost-efficient GLM route',
  () => {
    const tier =
      codingTierFor(
        'glm_5_3_flash',
      );

    assert.equal(
      tier?.family,
      'glm',
    );

    assert.equal(
      tier?.tier,
      'cost_efficient',
    );

    assert.equal(
      tier?.modelIdEnv,
      'GLM_5_3_FLASH_MODEL_ID',
    );
  },
);

test(
  'retired models remain unavailable even when legacy env values exist',
  () => {
    for (const modelId of ['kimi_k2_7', 'glm_5_2', 'deepseek_v4_pro', 'grok_4_5']) {
      assert.equal(
        modelAvailability(modelId, {
          KIMI_COST_EFFICIENT_MODEL_ID: 'legacy-id',
          GLM_MODEL_ID: 'legacy-id',
          DEEPSEEK_PRO_MODEL_ID: 'legacy-id',
          XAI_API_KEY: 'legacy-key',
        }),
        'unknown_model',
      );
    }
  },
);

test(
  'known GLM identifiers require no extra tier configuration',
  () => {
    for (
      const modelId of [
        'glm_5_3',
        'glm_5_3_flash',
      ]
    ) {
      assert.equal(
        modelAvailability(
          modelId,
          {},
        ),
        'available',
      );
    }
  },
);

test(
  'old GLM synthetic placeholder is retired',
  () => {
    assert.equal(
      modelAvailability(
        'glm_cost_efficient',
        {},
      ),
      'unknown_model',
    );
  },
);

const evidence = (
  over: Partial<ModelEvidence> & {
    modelId: string;
  },
): ModelEvidence => ({
  role: 'implementation',
  validationSuccessRate: 0.9,
  samples: 20,
  costUsdPerTask: 0.05,
  maturity: 'verified',
  ...over,
});

test(
  'cheapest sufficiently measured model wins',
  () => {
    const choice =
      chooseCostAware({
        role: 'implementation',

        candidates: [
          'kimi_k3',
          'glm_5_3',
          'glm_5_3_flash',
        ],

        evidence: [
          evidence({
            modelId:
              'kimi_k3',
            costUsdPerTask:
              0.5,
          }),

          evidence({
            modelId:
              'glm_5_3',
            costUsdPerTask:
              0.12,
          }),

          evidence({
            modelId:
              'glm_5_3_flash',
            costUsdPerTask:
              0.02,
          }),
        ],
      })!;

    assert.equal(
      choice.modelId,
      'glm_5_3_flash',
    );

    assert.equal(
      choice.measured,
      true,
    );
  },
);

test(
  'cheap unmeasured model does not win only because it is cheap',
  () => {
    const choice =
      chooseCostAware({
        role: 'implementation',

        candidates: [
          'kimi_k3',
          'deepseek_v4_flash',
        ],

        evidence: [
          evidence({
            modelId:
              'kimi_k3',
            costUsdPerTask:
              0.5,
          }),
        ],
      })!;

    assert.equal(
      choice.modelId,
      'kimi_k3',
    );
  },
);

test(
  'too few samples cannot qualify a cheap route',
  () => {
    const choice =
      chooseCostAware({
        role: 'implementation',

        candidates: [
          'kimi_k3',
          'deepseek_v4_flash',
        ],

        evidence: [
          evidence({
            modelId:
              'kimi_k3',
            costUsdPerTask:
              0.5,
          }),

          evidence({
            modelId:
              'deepseek_v4_flash',
            costUsdPerTask:
              0.01,
            samples:
              MIN_EVIDENCE_SAMPLES -
              1,
          }),
        ],
      })!;

    assert.equal(
      choice.modelId,
      'kimi_k3',
    );
  },
);

test(
  'validation below the floor cannot qualify a cheap route',
  () => {
    const choice =
      chooseCostAware({
        role: 'implementation',

        candidates: [
          'kimi_k3',
          'deepseek_v4_flash',
        ],

        evidence: [
          evidence({
            modelId:
              'kimi_k3',
            costUsdPerTask:
              0.5,
          }),

          evidence({
            modelId:
              'deepseek_v4_flash',
            costUsdPerTask:
              0.01,
            validationSuccessRate:
              SUFFICIENT_VALIDATION_RATE -
              0.01,
          }),
        ],
      })!;

    assert.equal(
      choice.modelId,
      'kimi_k3',
    );
  },
);

test(
  'experimental evidence never wins on price',
  () => {
    const choice =
      chooseCostAware({
        role: 'implementation',

        candidates: [
          'kimi_k3',
          'deepseek_v4_flash',
        ],

        evidence: [
          evidence({
            modelId:
              'kimi_k3',
            costUsdPerTask:
              0.5,
          }),

          evidence({
            modelId:
              'deepseek_v4_flash',
            costUsdPerTask:
              0.01,
            maturity:
              'experimental',
          }),
        ],
      })!;

    assert.equal(
      choice.modelId,
      'kimi_k3',
    );
  },
);

test(
  'evidence is isolated per model',
  () => {
    const choice =
      chooseCostAware({
        role: 'implementation',

        candidates: [
          'kimi_k3',
          'glm_5_3_flash',
        ],

        evidence: [
          evidence({
            modelId:
              'kimi_k3',
            costUsdPerTask:
              0.5,
          }),
        ],
      })!;

    assert.equal(
      choice.modelId,
      'kimi_k3',
    );
  },
);

test(
  'evidence from another role does not qualify a model',
  () => {
    const choice =
      chooseCostAware({
        role: 'implementation',

        candidates: [
          'kimi_k3',
          'deepseek_v4_flash',
        ],

        evidence: [
          evidence({
            modelId:
              'kimi_k3',
            costUsdPerTask:
              0.5,
          }),

          evidence({
            modelId:
              'deepseek_v4_flash',
            role: 'code_review',
            costUsdPerTask:
              0.01,
          }),
        ],
      })!;

    assert.equal(
      choice.modelId,
      'kimi_k3',
    );
  },
);

test(
  'retired candidate is skipped',
  () => {
    const choice =
      chooseCostAware({
        role: 'implementation',

        candidates: [
          'kimi_k2_7',
        ],

        evidence: [
          evidence({
            modelId:
              'kimi_k2_7',
            costUsdPerTask:
              0.001,
          }),
        ],

      });

    assert.equal(
      choice,
      null,
    );
  },
);

test(
  'catalog and tier lookup agree',
  () => {
    for (
      const tier of
      CODING_MODEL_TIERS
    ) {
      assert.deepEqual(
        codingTierFor(
          tier.modelId,
        ),
        tier,
      );

      assert.equal(
        familyFor(
          tier.modelId,
        ),
        tier.family,
      );
    }
  },
);
