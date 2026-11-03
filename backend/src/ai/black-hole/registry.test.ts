import assert from 'node:assert/strict';
import test from 'node:test';

import { MODELS, ACTIVE_MODEL_IDS, type ActiveModelId } from '../models.js';
import { CODING_MODEL_TRANSPORT } from '../providerPolicy.js';
import {
  BLACK_HOLE_MODELS,
  blackHoleAvailability,
  blackHoleModel,
  mayPerform,
  providerModelIdentifier,
  requiredTransport,
} from './registry.js';

const ACTIVE: readonly ActiveModelId[] = ACTIVE_MODEL_IDS;

test('the canonical Black Hole pool is exactly the active engineering stack', () => {
  assert.deepEqual(BLACK_HOLE_MODELS.map((model) => model.id).sort(), [...ACTIVE].sort());
  assert.ok(ACTIVE.every(id => MODELS[id].provider === 'zurelay'));
  assert.equal(MODELS.kimi_k3.provider,'moonshot','Historical records remain readable, without authority');
});

test('every active model reaches its mandated transport', () => {
  for (const id of ACTIVE) assert.equal(requiredTransport(id), CODING_MODEL_TRANSPORT[id]);
  assert.equal(requiredTransport('grok_4_3'), null);
  assert.equal(requiredTransport('grok_4_5'), null);
});

test('all catalogued models have engineering authority', () => {
  for (const id of ACTIVE) {
    assert.equal(mayPerform(id, 'writeProjectFiles'), true);
    assert.equal(mayPerform(id, 'mutateRepository'), true);
  }
  assert.equal(mayPerform('grok_4_3', 'writeProjectFiles'), false);
});

test('Grok is private to X retrieval and absent from the generic registry', () => {
  assert.equal(blackHoleModel('grok_4_3'), null);
  assert.equal(providerModelIdentifier('grok_4_3'), null);
  assert.equal(blackHoleAvailability('grok_4_3'), 'unknown_model');
});

test('environment overrides cannot restore a retired model or retarget an active identifier', () => {
  assert.equal(providerModelIdentifier('glm_5_3',{GLM_5_3_MODEL_ID:'operator-glm-5.3'}),null);
  assert.equal(providerModelIdentifier('deepseek_v4_1_flash_1017',{ZURELAY_DEEPSEEK_MODEL_ID:'auto'}),null);
});

test('retired vision routes stay absent and new modalities require exact endpoint verification', () => {
  assert.equal(blackHoleModel('glm_5_3_flash'),null);
  for(const id of ACTIVE) assert.equal(blackHoleModel(id,{})?.capabilities.vision,false);
});
