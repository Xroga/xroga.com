import assert from 'node:assert/strict';
import test from 'node:test';

import { MODELS, type ModelId } from '../models.js';
import { CODING_MODEL_TRANSPORT } from '../providerPolicy.js';
import {
  BLACK_HOLE_MODELS,
  blackHoleAvailability,
  blackHoleModel,
  mayPerform,
  providerModelIdentifier,
  requiredTransport,
} from './registry.js';

const ACTIVE: ModelId[] = ['kimi_k3', 'glm_5_3', 'glm_5_3_flash', 'deepseek_v4_flash'];

test('the canonical Black Hole pool is exactly the active engineering stack', () => {
  assert.deepEqual(BLACK_HOLE_MODELS.map((model) => model.id).sort(), [...ACTIVE].sort());
  assert.deepEqual(Object.keys(MODELS).sort(), [...ACTIVE].sort());
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

test('configured model identifiers honour active environment overrides', () => {
  const env = { GLM_5_3_MODEL_ID: 'operator-glm-5.3' } as NodeJS.ProcessEnv;
  assert.equal(providerModelIdentifier('glm_5_3', env), 'operator-glm-5.3');
});

test('vision belongs only to the confirmed multimodal engineering route', () => {
  assert.equal(blackHoleModel('glm_5_3_flash')?.capabilities.vision, true);
  assert.equal(blackHoleModel('glm_5_3')?.capabilities.vision, false);
  assert.equal(blackHoleModel('deepseek_v4_flash')?.capabilities.vision, false);
});
