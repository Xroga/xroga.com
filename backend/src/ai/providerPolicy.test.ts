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
import { MODELS } from './models.js';
import { capabilityCandidates } from '../synthesis/universalEntrypoint.js';

/**
 * Command 3 §29 provider isolation.
 *
 * These are not style assertions. At `59cdcf6` the policy was documented and unenforced,
 * and two paths could actually route engineering work to a research provider: `STRENGTHS`
 * gave both Grok models a `coding` score of 7 that `capabilityCandidates()` fed straight
 * into the `coding` ranking, and `grok_4_3` sat in the fallback chain of all three coding
 * models. #478 made the universal implement step walk that chain for real, so two coding
 * failures would have handed a user's repository to a research model.
 *
 * The registry assertions below are the ones that would have caught it.
 */

test('only Moonshot, Zhipu and OpenRouter models may perform coding', () => {
  // `kimi_k2_7` is policy-known before it is callable: `providerCostTiers` gates it on a
  // verified provider identifier that has not been supplied, so it has no `MODELS` entry.
  // Policy still binds its transport, because where a model's traffic may go is answerable
  // long before the model can be called — and leaving the next model to be enabled as the
  // only one without a transport binding is the failure mode this module prevents.
  assert.deepEqual(Object.keys(CODING_MODEL_TRANSPORT).sort(), [
    'deepseek_v4_flash',
    'deepseek_v4_pro',
    'glm_5_2',
    'kimi_k2_7',
    'kimi_k3',
  ]);
});

test('every coding model, callable or gated, is bound to a Moonshot/Zhipu/OpenRouter transport', () => {
  for (const transport of Object.values(CODING_MODEL_TRANSPORT)) {
    assert.ok(
      ['moonshot', 'zhipu', 'openrouter'].includes(transport),
      `${transport} is not an approved coding transport`,
    );
  }
});

test('each coding family uses its mandated transport', () => {
  assert.equal(requiredCodingTransport('kimi_k3'), 'moonshot');
  assert.equal(requiredCodingTransport('glm_5_2'), 'zhipu');
  assert.equal(requiredCodingTransport('deepseek_v4_pro'), 'openrouter');
  assert.equal(requiredCodingTransport('deepseek_v4_flash'), 'openrouter');
});

test('Kimi and GLM are never routed through OpenRouter', () => {
  // The policy names the transport; `models.ts` holds the real base URL. Both must agree,
  // or the policy is a comment rather than a control.
  assert.ok(!MODELS.kimi_k3.baseUrl.includes('openrouter'), MODELS.kimi_k3.baseUrl);
  assert.ok(!MODELS.glm_5_2.baseUrl.includes('openrouter'), MODELS.glm_5_2.baseUrl);
  assert.ok(MODELS.deepseek_v4_pro.baseUrl.includes('openrouter'));
  assert.ok(MODELS.deepseek_v4_flash.baseUrl.includes('openrouter'));
});

test('Grok and Tavily are not coding models', () => {
  assert.equal(isCodingModel('grok_4_5'), false);
  assert.equal(isCodingModel('grok_4_3'), false);
  assert.equal(isCodingModel(TAVILY_PROVIDER_ID), false);
  assert.equal(isResearchModel('grok_4_5'), true);
  assert.equal(isResearchModel('grok_4_3'), true);
  assert.equal(isResearchModel(TAVILY_PROVIDER_ID), true);
});

test('Grok uses xAI transport and only xAI transport', () => {
  assert.equal(RESEARCH_MODEL_TRANSPORT.grok_4_5, 'xai');
  assert.equal(RESEARCH_MODEL_TRANSPORT.grok_4_3, 'xai');
  assert.equal(MODELS.grok_4_5.provider, 'xai');
  assert.equal(MODELS.grok_4_3.provider, 'xai');
});

test('an unknown model is refused rather than assumed capable', () => {
  // Allowlist direction matters: a model added to the registry without being added to the
  // policy must not inherit coding authority by default.
  assert.equal(isCodingModel('some_future_model'), false);
  assert.equal(isCodingModel(undefined), false);
  assert.equal(isCodingModel(null), false);
});

test('assertCodingModel refuses a research provider by name', () => {
  assert.throws(
    () => assertCodingModel('grok_4_5', 'universal implementation'),
    (error: unknown) => {
      assert.ok(error instanceof ProviderPolicyError);
      assert.match(error.message, /grok_4_5/);
      assert.match(error.message, /not a coding provider/i);
      return true;
    },
  );
  assert.doesNotThrow(() => assertCodingModel('kimi_k3', 'universal implementation'));
});

test('codingModelsOnly strips research providers from a candidate list', () => {
  const filtered = codingModelsOnly([
    { modelId: 'kimi_k3' },
    { modelId: 'grok_4_3' },
    { modelId: 'glm_5_2' },
    { modelId: TAVILY_PROVIDER_ID },
  ]);
  assert.deepEqual(filtered.map((c) => c.modelId), ['kimi_k3', 'glm_5_2']);
});

test('no coding model falls back to a research provider', async () => {
  const { getRuntimeModelRegistry } = await import('./modelCapabilityRegistry.js');
  const registry = getRuntimeModelRegistry();
  const coding = registry.filter((model) => isCodingModel(model.id));
  assert.ok(coding.length >= 4, 'expected the four coding models in the registry');

  let chainsChecked = 0;
  for (const model of coding) {
    // Guard against the assertion silently becoming vacuous: an empty or renamed field
    // would otherwise let this test pass while checking nothing. That happened while
    // writing it — the field is `preferredFallbacks`, not `fallbacks`.
    assert.ok(
      model.preferredFallbacks.length > 0,
      `${model.id} has no fallback chain to check`,
    );
    for (const fallback of model.preferredFallbacks) {
      chainsChecked += 1;
      assert.equal(
        isResearchModel(fallback),
        false,
        `coding model ${model.id} falls back to research provider ${fallback}`,
      );
    }
  }
  assert.ok(chainsChecked >= 8, `expected to check real chains, checked ${chainsChecked}`);
});

test('an admin-configured fallback order cannot reintroduce a research provider', async () => {
  // `preferredFallbacks` merges operator-configurable `admin.fallbackOrder` with the static
  // table, so the static table alone cannot enforce the policy. This asserts the filter
  // that closes that path.
  const { getRuntimeModelRegistry } = await import('./modelCapabilityRegistry.js');
  const { getRouterAdminConfig } = await import('./routerConfig.js');
  const admin = getRouterAdminConfig();
  assert.ok(Array.isArray(admin.fallbackOrder), 'admin config exposes a fallback order');

  for (const model of getRuntimeModelRegistry()) {
    if (!isCodingModel(model.id)) continue;
    assert.equal(
      model.preferredFallbacks.some((fallback) => isResearchModel(fallback)),
      false,
      `${model.id} chain admits a research provider`,
    );
  }
});

test('the universal coding candidate list contains no research provider', () => {
  const candidates = capabilityCandidates();
  assert.ok(candidates.length > 0, 'candidate list must not be empty');
  for (const candidate of candidates) {
    assert.equal(
      isCodingModel(candidate.profile.modelId),
      true,
      `${candidate.profile.modelId} was offered as a coding candidate`,
    );
  }
});

test('a research model carries no coding capability prior', async () => {
  // §7 forbids a research provider holding coding capability scores at all. Both Grok
  // entries previously scored 7 for coding — high enough to win a coding route had the
  // policy filter not sat upstream. Two independent controls over the same risk is the
  // intent; a prior that would be dangerous if the filter were removed is not one worth
  // keeping.
  const { getRuntimeModelRegistry } = await import('./modelCapabilityRegistry.js');
  for (const model of getRuntimeModelRegistry()) {
    if (!isResearchModel(model.id)) continue;
    assert.equal(model.strengths.coding, 0, `${model.id} advertises a coding score`);
  }
});

test('a coding model still carries a usable coding prior', async () => {
  // The direction check: zeroing research priors must not have zeroed the coding models,
  // which would leave every coding route ranking on nothing until evidence accumulated.
  const { getRuntimeModelRegistry } = await import('./modelCapabilityRegistry.js');
  const coding = getRuntimeModelRegistry().filter((model) => isCodingModel(model.id));
  assert.ok(coding.length > 0);
  for (const model of coding) {
    assert.ok(model.strengths.coding > 0, `${model.id} lost its coding prior`);
  }
});

test('no model registry entry advertises a capability the policy refuses', () => {
  // The `role` string is customer- and operator-facing documentation. When it described
  // Grok as serving "coding agents" it contradicted the enforced policy, and a registry
  // that advertises what the router forbids is how the forbidden thing gets re-enabled.
  for (const id of Object.keys(MODELS) as (keyof typeof MODELS)[]) {
    if (!isResearchModel(id)) continue;
    assert.equal(
      /\bcoding\b|\bcode\b/i.test(MODELS[id].role.replace(/never writes code/i, '')),
      false,
      `${id} role string advertises coding: ${MODELS[id].role}`,
    );
  }
});
