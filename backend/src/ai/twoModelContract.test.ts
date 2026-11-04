import assert from 'node:assert/strict';
import test from 'node:test';
import { ACTIVE_MODEL_IDS, DEFAULT_MODEL_ID, MODELS, assertActiveModelId, type ModelId } from './models.js';
import { CODING_MODEL_TRANSPORT, assertModelEnabled } from './providerPolicy.js';

const RETIRED: readonly string[] = ['kimi_k3', 'glm_5_3', 'glm_5_3_flash', 'deepseek_v4_flash'];

test('exactly two executable models exist, both through Zurelay, with DeepSeek V4.1 Flash 1017 as the default', () => {
  assert.deepEqual([...ACTIVE_MODEL_IDS].sort(), ['claude_sonnet_5_5', 'deepseek_v4_1_flash_1017']);
  assert.equal(DEFAULT_MODEL_ID, 'deepseek_v4_1_flash_1017');
  assert.deepEqual(Object.keys(CODING_MODEL_TRANSPORT).sort(), [...ACTIVE_MODEL_IDS].sort());
  for (const id of ACTIVE_MODEL_IDS) assert.equal(MODELS[id].provider, 'zurelay');
});

test('retired Kimi, GLM and direct DeepSeek routes fail closed before any policy, credential or wire', () => {
  for (const id of RETIRED) {
    assert.throws(() => assertActiveModelId(id), Error, `${id} must not be an active model`);
    assert.throws(() => assertModelEnabled(id as ModelId), Error, `${id} must be denied by execution policy`);
  }
  assert.throws(() => assertActiveModelId('some_unknown_route'));
});

test('retired ids are still readable as historical accounting records and never become executable', () => {
  for (const id of RETIRED) {
    assert.ok(id in MODELS, `${id} stays readable for ledger and receipt identity`);
    assert.ok(!(ACTIVE_MODEL_IDS as readonly string[]).includes(id));
    assert.ok(!(id in CODING_MODEL_TRANSPORT));
  }
});
