import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  BLACK_HOLE_MODELS,
  blackHoleAvailability,
  blackHoleModel,
  mayPerform,
  providerModelIdentifier,
  requiredTransport,
} from './registry.js';
import { MODELS } from '../models.js';
import { CODING_MODEL_TIERS } from '../providerCostTiers.js';

// ---------------------------------------------------------------------------
// Transport isolation — a registry edit must not redirect customer prompts
// ---------------------------------------------------------------------------

test('every coding model reaches the transport its security policy names', () => {
  assert.equal(requiredTransport('kimi_k3'), 'moonshot');
  assert.equal(requiredTransport('kimi_k2_7'), 'moonshot');
  assert.equal(requiredTransport('glm_5_2'), 'zhipu');
  assert.equal(requiredTransport('deepseek_v4_pro'), 'openrouter');
  assert.equal(requiredTransport('deepseek_v4_flash'), 'openrouter');
});

test('Kimi and GLM are never carried by OpenRouter', () => {
  for (const id of ['kimi_k3', 'kimi_k2_7', 'glm_5_2']) {
    assert.notEqual(requiredTransport(id), 'openrouter', `${id} must not use OpenRouter`);
  }
});

test('DeepSeek is never carried by a direct provider transport', () => {
  for (const id of ['deepseek_v4_pro', 'deepseek_v4_flash']) {
    assert.equal(requiredTransport(id), 'openrouter');
  }
});

test('Grok is carried by xAI only', () => {
  assert.equal(requiredTransport('grok_4_5'), 'xai');
  assert.equal(requiredTransport('grok_4_3'), 'xai');
});

test('the registry agrees with the runtime registry on provider for every shared model', () => {
  // The two are separate files today. This asserts they cannot drift apart silently, which
  // is the property that made the earlier transport binding fragile.
  const providerByRegistry: Record<string, string> = {
    moonshot: 'moonshot',
    glm_official: 'zhipu',
    openrouter: 'openrouter',
    xai: 'xai',
  };
  for (const model of BLACK_HOLE_MODELS) {
    const runtime = MODELS[model.id as keyof typeof MODELS];
    if (!runtime) continue; // kimi_k2_7 is not yet in the runtime registry — see its own test
    assert.equal(
      runtime.provider,
      providerByRegistry[model.provider],
      `${model.id} provider disagrees between registries`,
    );
  }
});

// ---------------------------------------------------------------------------
// Capability is not authority
// ---------------------------------------------------------------------------

test('research models can produce text but may never write or deploy', () => {
  for (const id of ['grok_4_5', 'grok_4_3']) {
    const model = blackHoleModel(id)!;
    // Capability: it can emit text and reason.
    assert.equal(model.capabilities.text, true);
    assert.equal(model.capabilities.reasoning, true);
    // Authority: it may not act on any of that.
    assert.equal(mayPerform(id, 'writeProjectFiles'), false);
    assert.equal(mayPerform(id, 'mutateRepository'), false);
    assert.equal(mayPerform(id, 'deploy'), false);
    // What it is for.
    assert.equal(mayPerform(id, 'research'), true);
    assert.equal(mayPerform(id, 'inspectMedia'), true);
  }
});

test('research models declare implementation roles prohibited rather than merely absent', () => {
  for (const id of ['grok_4_5', 'grok_4_3']) {
    const model = blackHoleModel(id)!;
    assert.ok(model.prohibitedRoles.includes('implementation'));
    assert.ok(model.prohibitedRoles.includes('repository_mutation'));
  }
});

test('no research model claims repository coding capability', () => {
  for (const model of BLACK_HOLE_MODELS) {
    if (!model.capabilities.research) continue;
    assert.equal(model.capabilities.repositoryCoding, false, `${model.id}`);
  }
});

test('engineering models hold write authority and research models do not', () => {
  const writers = BLACK_HOLE_MODELS.filter((m) => m.authority.writeProjectFiles).map((m) => m.id);
  assert.deepEqual(
    writers.sort(),
    ['deepseek_v4_flash', 'deepseek_v4_pro', 'glm_5_2', 'kimi_k2_7', 'kimi_k3'],
  );
});

// ---------------------------------------------------------------------------
// K2.7 — first class, and honestly gated
// ---------------------------------------------------------------------------

test('K2.7 is registered as a first-class model', () => {
  const model = blackHoleModel('kimi_k2_7');
  assert.ok(model, 'kimi_k2_7 must exist in the canonical registry');
  assert.equal(model!.provider, 'moonshot');
  assert.equal(model!.capabilities.repositoryCoding, true);
  assert.equal(model!.authority.writeProjectFiles, true);
});

test('K2.7 uses the identifier variable the cost tiers already gate it on', () => {
  // A second variable would mean two operator actions to enable one model, and two places to
  // get wrong. The tier entry is the existing owner of this gate.
  const tier = CODING_MODEL_TIERS.find((entry) => entry.modelId === 'kimi_k2_7')!;
  assert.equal(tier.requiresVerifiedIdentifier, true);
  assert.equal(blackHoleModel('kimi_k2_7')!.providerModelEnv, tier.modelIdEnv);
});

test('K2.7 reports not_configured rather than guessing a provider slug', () => {
  const env = {} as NodeJS.ProcessEnv;
  assert.equal(providerModelIdentifier('kimi_k2_7', env), null);
  assert.equal(blackHoleAvailability('kimi_k2_7', env), 'not_configured');
});

test('K2.7 becomes available once an operator supplies the verified identifier', () => {
  const env = { KIMI_COST_EFFICIENT_MODEL_ID: 'kimi-k2.7-code-verified' } as NodeJS.ProcessEnv;
  assert.equal(providerModelIdentifier('kimi_k2_7', env), 'kimi-k2.7-code-verified');
  assert.equal(blackHoleAvailability('kimi_k2_7', env), 'available');
});

test('a configured model still honours an environment override', () => {
  const env = { KIMI_MODEL_ID: 'kimi-k3-preview' } as NodeJS.ProcessEnv;
  assert.equal(providerModelIdentifier('kimi_k3', env), 'kimi-k3-preview');
  // And falls back to the shipped identifier when unset.
  assert.equal(providerModelIdentifier('kimi_k3', {} as NodeJS.ProcessEnv), 'kimi-k3');
});

// ---------------------------------------------------------------------------
// Pool completeness and credentials
// ---------------------------------------------------------------------------

test('the required canonical pool is present', () => {
  for (const id of [
    'kimi_k3',
    'kimi_k2_7',
    'glm_5_2',
    'deepseek_v4_flash',
    'deepseek_v4_pro',
    'grok_4_5',
    'grok_4_3',
  ]) {
    assert.ok(blackHoleModel(id), `${id} missing from the canonical pool`);
  }
});

test('each model names the credential its transport actually uses', () => {
  const expected: Record<string, string> = {
    moonshot: 'KIMI_API_KEY',
    glm_official: 'GLM_API_KEY',
    openrouter: 'OPENROUTER_API_KEY',
    xai: 'GROK_API_KEY',
  };
  for (const model of BLACK_HOLE_MODELS) {
    assert.equal(model.credentialEnv, expected[model.provider], `${model.id}`);
  }
});

test('an unknown model is refused rather than defaulted', () => {
  assert.equal(blackHoleModel('some_model_2027'), null);
  assert.equal(providerModelIdentifier('some_model_2027'), null);
  assert.equal(blackHoleAvailability('some_model_2027'), 'unknown_model');
  assert.equal(mayPerform('some_model_2027', 'writeProjectFiles'), false);
});

test('capability claims are booleans, so an absent field cannot read as permission', () => {
  for (const model of BLACK_HOLE_MODELS) {
    for (const [name, value] of Object.entries(model.capabilities)) {
      assert.equal(typeof value, 'boolean', `${model.id}.${name}`);
    }
    for (const [name, value] of Object.entries(model.authority)) {
      assert.equal(typeof value, 'boolean', `${model.id}.${name}`);
    }
  }
});
