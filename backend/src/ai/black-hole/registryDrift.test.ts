import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MODELS,
  callableModelIds,
  modelConfigurationIssues,
  operatorConfigKeys,
  requirePricing,
  resolveModelSpec,
  ModelPricingUnavailableError,
  type ModelId,
} from '../models.js';
import { BLACK_HOLE_MODELS, blackHoleAvailability, blackHoleModel } from './registry.js';
import { getRuntimeModelRegistry } from '../modelCapabilityRegistry.js';
import { CODING_MODEL_TRANSPORT, RESEARCH_MODEL_TRANSPORT } from '../providerPolicy.js';

/**
 * Registries must not be able to drift apart.
 *
 * Before this refactor there were two independent hard-coded claims about K3's vision support
 * and two about context windows. They disagreed, and the disagreement surfaced as image
 * requests routing nowhere at all. These tests exist so that cannot recur silently: they
 * assert that the derived registries agree with `models.ts` for every model, rather than
 * asserting specific values that would need updating in three places anyway.
 */

const FULLY_CONFIGURED_K27 = {
  KIMI_COST_EFFICIENT_MODEL_ID: 'kimi-k2.7-operator-supplied',
  KIMI_COST_EFFICIENT_INPUT_USD_PER_1M: '0.6',
  KIMI_COST_EFFICIENT_OUTPUT_USD_PER_1M: '2.5',
  KIMI_COST_EFFICIENT_CONTEXT_WINDOW: '262144',
} as unknown as NodeJS.ProcessEnv;

// ---------------------------------------------------------------------------
// One source of truth
// ---------------------------------------------------------------------------

test('every Black Hole model exists in the canonical catalogue', () => {
  for (const model of BLACK_HOLE_MODELS) {
    assert.ok(MODELS[model.id as ModelId], `${model.id} is not in models.ts`);
  }
});

test('the canonical catalogue and the Black Hole registry agree on transport', () => {
  const providerByRegistry: Record<string, string> = {
    moonshot: 'moonshot',
    glm_official: 'zhipu',
    openrouter: 'openrouter',
    xai: 'xai',
  };
  for (const model of BLACK_HOLE_MODELS) {
    assert.equal(
      MODELS[model.id as ModelId].provider,
      providerByRegistry[model.provider],
      `${model.id} provider disagrees between registries`,
    );
  }
});

test('the runtime registry never invents a context window or price', () => {
  // It derives both from the resolved spec, so any entry it publishes must be resolvable.
  for (const runtime of getRuntimeModelRegistry()) {
    const spec = resolveModelSpec(runtime.id);
    assert.ok(spec, `${runtime.id} is listed at runtime but is not resolvable`);
    assert.equal(runtime.contextWindow, spec!.contextWindow, `${runtime.id} context window`);
    assert.equal(runtime.inputUsdPer1M, spec!.inputUsdPer1M, `${runtime.id} input price`);
    assert.equal(runtime.outputUsdPer1M, spec!.outputUsdPer1M, `${runtime.id} output price`);
    assert.equal(runtime.apiModel, spec!.apiModel, `${runtime.id} api model`);
  }
});

test('image support has exactly one source', () => {
  // The defect this refactor fixed: `id.startsWith('grok')` in one registry versus a
  // hard-coded `vision: true` in another.
  for (const runtime of getRuntimeModelRegistry()) {
    const spec = resolveModelSpec(runtime.id)!;
    assert.equal(runtime.supports.images, spec.supportsImages, `${runtime.id} images`);
    const blackHole = blackHoleModel(runtime.id);
    if (blackHole) {
      assert.equal(
        blackHole.capabilities.vision,
        spec.supportsImages,
        `${runtime.id} vision disagrees between registries`,
      );
    }
  }
});

test('the Black Hole registry derives its context window rather than restating it', () => {
  for (const runtime of getRuntimeModelRegistry()) {
    const blackHole = blackHoleModel(runtime.id);
    if (!blackHole) continue;
    assert.equal(
      blackHole.contextWindow,
      runtime.contextWindow,
      `${runtime.id} context window disagrees between registries`,
    );
  }
});

test('a model in the runtime registry is always callable', () => {
  // The registry is the router's candidate pool. Listing an unconfigured model there is how a
  // chain ends up with a head that fails at the first request.
  const callable = new Set(callableModelIds());
  for (const runtime of getRuntimeModelRegistry()) {
    assert.ok(callable.has(runtime.id), `${runtime.id} is listed but not callable`);
  }
});

test('every catalogued model is covered by a transport policy', () => {
  // A model added without a transport binding would be the only one whose destination is
  // unconstrained, which is precisely the gap providerPolicy exists to close.
  for (const id of Object.keys(MODELS) as ModelId[]) {
    const covered = id in CODING_MODEL_TRANSPORT || id in RESEARCH_MODEL_TRANSPORT;
    assert.ok(covered, `${id} has no transport binding`);
  }
});

// ---------------------------------------------------------------------------
// Nothing is invented for an unconfigured model
// ---------------------------------------------------------------------------

test('K2.7 ships with no invented identifier, price or context window', () => {
  const def = MODELS.kimi_k2_7;
  assert.equal(def.apiModel, null, 'a guessed slug would look production-ready and fail');
  assert.equal(def.inputUsdPer1M, null);
  assert.equal(def.outputUsdPer1M, null);
  assert.equal(def.contextWindow, null);
});

test('an unconfigured model reports every missing fact at once', () => {
  // Discovering three required variables one deploy at a time is its own kind of outage.
  const issues = modelConfigurationIssues('kimi_k2_7', {} as NodeJS.ProcessEnv);
  assert.deepEqual(issues.sort(), [
    'missing_context_window',
    'missing_pricing',
    'missing_provider_identifier',
  ]);
});

test('an unpriced model is refused by the cost engine rather than treated as free', () => {
  // A model priced at zero is the cheapest on the platform and would win every cost
  // comparison, then bill nothing until the invoice arrived.
  assert.throws(
    () => requirePricing('kimi_k2_7', {} as NodeJS.ProcessEnv),
    ModelPricingUnavailableError,
  );
});

test('an unconfigured model is absent from the runtime registry entirely', () => {
  assert.equal(
    getRuntimeModelRegistry().some((model) => model.id === 'kimi_k2_7'),
    false,
    'an unconfigured model must not be offered as a routing candidate',
  );
});

test('the operator configuration keys are derived from the model id env', () => {
  const keys = operatorConfigKeys(MODELS.kimi_k2_7);
  assert.deepEqual(keys, {
    modelId: 'KIMI_COST_EFFICIENT_MODEL_ID',
    inputPrice: 'KIMI_COST_EFFICIENT_INPUT_USD_PER_1M',
    outputPrice: 'KIMI_COST_EFFICIENT_OUTPUT_USD_PER_1M',
    contextWindow: 'KIMI_COST_EFFICIENT_CONTEXT_WINDOW',
  });
});

// ---------------------------------------------------------------------------
// K2.7 becomes real once configured
// ---------------------------------------------------------------------------

test('a fully configured K2.7 resolves to a callable spec on the Moonshot transport', () => {
  const spec = resolveModelSpec('kimi_k2_7', FULLY_CONFIGURED_K27);
  assert.ok(spec, 'K2.7 must resolve once every fact is supplied');
  assert.equal(spec!.apiModel, 'kimi-k2.7-operator-supplied');
  assert.equal(spec!.provider, 'moonshot', 'Kimi must never leave Moonshot');
  assert.equal(spec!.inputUsdPer1M, 0.6);
  assert.equal(spec!.contextWindow, 262_144);
  assert.equal(blackHoleAvailability('kimi_k2_7', FULLY_CONFIGURED_K27), 'available');
});

test('a partially configured K2.7 stays unavailable', () => {
  // Each fact individually withheld must still block the model.
  for (const omit of [
    'KIMI_COST_EFFICIENT_MODEL_ID',
    'KIMI_COST_EFFICIENT_INPUT_USD_PER_1M',
    'KIMI_COST_EFFICIENT_CONTEXT_WINDOW',
  ]) {
    const env = { ...FULLY_CONFIGURED_K27 } as Record<string, string>;
    delete env[omit];
    assert.equal(
      blackHoleAvailability('kimi_k2_7', env as unknown as NodeJS.ProcessEnv),
      'not_configured',
      `omitting ${omit} should keep K2.7 unavailable`,
    );
  }
});

test('a non-numeric or negative operator price is rejected, not coerced', () => {
  for (const bad of ['free', '0', '-1', '']) {
    const env = { ...FULLY_CONFIGURED_K27, KIMI_COST_EFFICIENT_INPUT_USD_PER_1M: bad } as unknown as NodeJS.ProcessEnv;
    assert.equal(resolveModelSpec('kimi_k2_7', env), null, `price "${bad}" must be refused`);
  }
});

test('a verified constant is not silently overridable by environment', () => {
  // Pricing env vars apply only where the shipped value is null. Letting a typo change what
  // customers are charged for an already-verified model is not a feature.
  const env = {
    KIMI_INPUT_USD_PER_1M: '999',
    KIMI_OUTPUT_USD_PER_1M: '999',
  } as unknown as NodeJS.ProcessEnv;
  const spec = resolveModelSpec('kimi_k3', env);
  assert.ok(spec);
  assert.equal(spec!.inputUsdPer1M, MODELS.kimi_k3.inputUsdPer1M);
});
