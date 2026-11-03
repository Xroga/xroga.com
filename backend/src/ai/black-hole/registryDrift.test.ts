import assert from 'node:assert/strict';
import test from 'node:test';

import { getRuntimeModelRegistry } from '../modelCapabilityRegistry.js';
import {
  MODELS, ACTIVE_MODEL_IDS,
  MONTHLY_TOTAL_BUDGET_USD,
  callableModelIds,
  modelConfigurationIssues,
  resolveModelSpec,
  type ModelId,
} from '../models.js';
import { CODING_MODEL_TIERS } from '../providerCostTiers.js';
import { CODING_MODEL_TRANSPORT } from '../providerPolicy.js';
import { BLACK_HOLE_MODELS, blackHoleModel } from './registry.js';

const ACTIVE: readonly ModelId[] = ACTIVE_MODEL_IDS;
const REMOVED = ['kimi_k2_7', 'glm_5_2', 'deepseek_v4_pro', 'grok_4_5', 'grok_4_3'];

test('all active registries contain the same exact model set', () => {
  const expected = [...ACTIVE].sort();
  assert.deepEqual(callableModelIds({}).sort(),expected);
  for(const id of ['kimi_k3','glm_5_3','glm_5_3_flash','deepseek_v4_flash'] as const){assert.ok(MODELS[id]);assert.equal(blackHoleModel(id),null);}
  assert.deepEqual(Object.keys(CODING_MODEL_TRANSPORT).sort(), expected);
  assert.deepEqual(CODING_MODEL_TIERS.map((entry) => entry.modelId).sort(), expected);
  assert.deepEqual(BLACK_HOLE_MODELS.map((entry) => entry.id).sort(), expected);
});

test('removed models are not executable aliases', () => {
  for (const id of REMOVED) {
    assert.equal((MODELS as Record<string, unknown>)[id], undefined);
    assert.equal(blackHoleModel(id), null);
  }
});

test('the active catalog preserves the $16.50 budget invariant', () => {
  const allocated = ACTIVE.reduce((sum,id)=>sum+MODELS[id].budgetUsd,0);
  assert.equal(MONTHLY_TOTAL_BUDGET_USD, 16.5);
  assert.equal(allocated, MONTHLY_TOTAL_BUDGET_USD);
  assert.equal(MODELS.claude_sonnet_5_5.budgetUsd,0,'No automatic premium entitlement');
});

test('every active model has a complete callable specification', () => {
  for (const id of ACTIVE) {
    assert.deepEqual(modelConfigurationIssues(id, {} as NodeJS.ProcessEnv), []);
    assert.ok(resolveModelSpec(id, {} as NodeJS.ProcessEnv));
  }
  assert.deepEqual(callableModelIds({} as NodeJS.ProcessEnv).sort(), [...ACTIVE].sort());
});

test('runtime facts are derived from the canonical catalogue', () => {
  for (const runtime of getRuntimeModelRegistry()) {
    const spec = resolveModelSpec(runtime.id);
    assert.ok(spec);
    assert.equal(runtime.apiModel, spec.apiModel);
    assert.equal(runtime.contextWindow, spec.contextWindow);
    assert.equal(runtime.inputUsdPer1M, spec.inputUsdPer1M);
    assert.equal(blackHoleModel(runtime.id)?.contextWindow, spec.contextWindow);
  }
});
