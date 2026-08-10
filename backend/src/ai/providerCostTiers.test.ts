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

/**
 * Command 3 §7, §12, §29 — fixed transports, cost tiers, and model-specific evidence.
 *
 * The invariant with the sharpest edge is OpenRouter. It lists many models, so a future
 * Kimi or GLM entry could acquire coding authority simply by appearing in its catalog.
 * These assert the relationship in both directions.
 */

test('each coding family has exactly one permitted transport', () => {
  assert.deepEqual(FAMILY_TRANSPORT, { kimi: 'moonshot', glm: 'zhipu', deepseek: 'openrouter' });
});

test('OpenRouter carries DeepSeek and nothing else', () => {
  assert.equal(OPENROUTER_CODING_FAMILY, 'deepseek');

  // Forward: every model whose transport is openrouter must be deepseek.
  for (const tier of CODING_MODEL_TIERS) {
    if (FAMILY_TRANSPORT[tier.family] === 'openrouter') {
      assert.equal(tier.family, 'deepseek', `${tier.modelId} uses openrouter but is ${tier.family}`);
    }
  }
  // Reverse: no deepseek model may use anything else.
  for (const tier of CODING_MODEL_TIERS) {
    if (tier.family === 'deepseek') assert.equal(FAMILY_TRANSPORT[tier.family], 'openrouter');
  }
});

test('Kimi and GLM are refused on OpenRouter', () => {
  for (const modelId of ['kimi_k3', 'kimi_k2_7', 'glm_5_2', 'glm_cost_efficient']) {
    assert.throws(
      () => assertTransportPolicy(modelId, 'openrouter'),
      (error: unknown) => {
        assert.ok(error instanceof TransportPolicyError);
        assert.match(error.message, new RegExp(modelId));
        return true;
      },
      `${modelId} was allowed through OpenRouter`,
    );
  }
});

test('each model is accepted on its mandated transport and refused on others', () => {
  assert.doesNotThrow(() => assertTransportPolicy('kimi_k3', 'moonshot'));
  assert.doesNotThrow(() => assertTransportPolicy('glm_5_2', 'zhipu'));
  assert.doesNotThrow(() => assertTransportPolicy('deepseek_v4_flash', 'openrouter'));

  assert.throws(() => assertTransportPolicy('kimi_k3', 'zhipu'), TransportPolicyError);
  assert.throws(() => assertTransportPolicy('glm_5_2', 'moonshot'), TransportPolicyError);
  assert.throws(() => assertTransportPolicy('deepseek_v4_pro', 'moonshot'), TransportPolicyError);
});

test('a model outside the catalog has no permitted transport at all', () => {
  // The direction that matters: unknown means refused, not "assume openrouter".
  assert.throws(() => assertTransportPolicy('some_new_model', 'openrouter'), TransportPolicyError);
  assert.equal(familyFor('some_new_model'), null);
});

test('every family carries a premium and a cost-efficient tier', () => {
  for (const family of ['kimi', 'glm', 'deepseek'] as const) {
    const tiers = CODING_MODEL_TIERS.filter((entry) => entry.family === family).map((entry) => entry.tier);
    assert.ok(tiers.includes('premium'), `${family} has no premium tier`);
    assert.ok(tiers.includes('cost_efficient'), `${family} has no cost-efficient tier`);
  }
});

test('models needing a verified identifier report not_configured until supplied', () => {
  // The command forbids inventing a provider slug from a human-readable name. Absent
  // configuration is a truthful state, not a failure.
  assert.equal(modelAvailability('kimi_k2_7', {}), 'not_configured');
  assert.equal(modelAvailability('glm_cost_efficient', {}), 'not_configured');
  assert.equal(modelAvailability('kimi_k2_7', { KIMI_COST_EFFICIENT_MODEL_ID: 'moonshot-v1-x' }), 'available');
  assert.equal(modelAvailability('unknown', {}), 'unknown_model');
});

test('models with known identifiers are available without extra configuration', () => {
  for (const modelId of ['kimi_k3', 'glm_5_2', 'deepseek_v4_pro', 'deepseek_v4_flash']) {
    assert.equal(modelAvailability(modelId, {}), 'available', modelId);
  }
});

const evidence = (over: Partial<ModelEvidence> & { modelId: string }): ModelEvidence => ({
  role: 'implementation',
  validationSuccessRate: 0.9,
  samples: 20,
  costUsdPerTask: 0.05,
  maturity: 'verified',
  ...over,
});

test('the cheapest model with sufficient evidence wins', () => {
  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['kimi_k3', 'deepseek_v4_flash', 'glm_5_2'],
    evidence: [
      evidence({ modelId: 'kimi_k3', costUsdPerTask: 0.5 }),
      evidence({ modelId: 'glm_5_2', costUsdPerTask: 0.2 }),
      evidence({ modelId: 'deepseek_v4_flash', costUsdPerTask: 0.01 }),
    ],
  })!;
  assert.equal(choice.modelId, 'deepseek_v4_flash');
  assert.match(choice.reason, /least-expensive candidate with sufficient evidence/);
  // Escalation walks toward capability, not straight to the priciest.
  assert.deepEqual(choice.escalation, ['glm_5_2', 'kimi_k3']);
});

test('a cheap model without measured evidence does not win on price', () => {
  // §13: preferring an unmeasured model because it is cheap is exactly the unverified
  // routing the evidence system exists to prevent.
  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['kimi_k3', 'deepseek_v4_flash'],
    evidence: [evidence({ modelId: 'kimi_k3', costUsdPerTask: 0.5 })],
  })!;
  // The measured model wins even though it is the more expensive one, because the cheaper
  // candidate has no record to qualify on.
  assert.equal(choice.modelId, 'kimi_k3');
  assert.match(choice.reason, /sufficient evidence/);
});

test('with nothing measured at all, the premium tier leads and says so', () => {
  // The reason must not imply a measured choice when none was made.
  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['kimi_k3', 'deepseek_v4_flash'],
    evidence: [],
  })!;
  assert.equal(codingTierFor(choice.modelId)?.tier, 'premium');
  assert.match(choice.reason, /selected on prior, not on measurement/);
});

test('too few samples does not qualify a cheap model', () => {
  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['kimi_k3', 'deepseek_v4_flash'],
    evidence: [
      evidence({ modelId: 'kimi_k3', costUsdPerTask: 0.5 }),
      evidence({ modelId: 'deepseek_v4_flash', costUsdPerTask: 0.01, samples: MIN_EVIDENCE_SAMPLES - 1 }),
    ],
  })!;
  assert.equal(choice.modelId, 'kimi_k3');
});

test('a cheap model below the validation floor does not qualify', () => {
  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['kimi_k3', 'deepseek_v4_flash'],
    evidence: [
      evidence({ modelId: 'kimi_k3', costUsdPerTask: 0.5 }),
      evidence({
        modelId: 'deepseek_v4_flash',
        costUsdPerTask: 0.01,
        validationSuccessRate: SUFFICIENT_VALIDATION_RATE - 0.01,
      }),
    ],
  })!;
  assert.equal(choice.modelId, 'kimi_k3');
});

test('an experimental capability never wins on price', () => {
  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['kimi_k3', 'deepseek_v4_flash'],
    evidence: [
      evidence({ modelId: 'kimi_k3', costUsdPerTask: 0.5 }),
      evidence({ modelId: 'deepseek_v4_flash', costUsdPerTask: 0.01, maturity: 'experimental' }),
    ],
  })!;
  assert.equal(choice.modelId, 'kimi_k3');
});

test('evidence is matched per model and per role, never shared across a family', () => {
  // Kimi K3 and Kimi K2.7 are different products; one's record must not justify the other.
  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['kimi_k3', 'kimi_k2_7'],
    evidence: [evidence({ modelId: 'kimi_k3', costUsdPerTask: 0.5 })],
    env: { KIMI_COST_EFFICIENT_MODEL_ID: 'moonshot-v1-x' },
  })!;
  assert.equal(choice.modelId, 'kimi_k3', 'K3 evidence must not qualify K2.7');
});

test('evidence for another role does not qualify a model', () => {
  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['kimi_k3', 'deepseek_v4_flash'],
    evidence: [
      evidence({ modelId: 'kimi_k3', costUsdPerTask: 0.5 }),
      evidence({ modelId: 'deepseek_v4_flash', costUsdPerTask: 0.01, role: 'code_review' }),
    ],
  })!;
  assert.equal(choice.modelId, 'kimi_k3');
});

test('an unconfigured cost-efficient model is skipped rather than attempted', () => {
  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['glm_5_2', 'glm_cost_efficient'],
    evidence: [
      evidence({ modelId: 'glm_5_2', costUsdPerTask: 0.2 }),
      evidence({ modelId: 'glm_cost_efficient', costUsdPerTask: 0.01 }),
    ],
    env: {},
  })!;
  assert.equal(choice.modelId, 'glm_5_2');
  assert.equal(choice.escalation.includes('glm_cost_efficient'), false);
});

test('no available candidate yields no choice rather than a guess', () => {
  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['glm_cost_efficient'],
    evidence: [],
    env: {},
  });
  assert.equal(choice, null);
});

test('the catalog and tier lookup agree', () => {
  for (const tier of CODING_MODEL_TIERS) {
    assert.deepEqual(codingTierFor(tier.modelId), tier);
    assert.equal(familyFor(tier.modelId), tier.family);
  }
});
