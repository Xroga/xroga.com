import assert from 'node:assert/strict';
import test from 'node:test';
import { connectedAppModelRoute } from './connectedAppModel.js';
import { MODELS, modelConfigurationIssues } from '../../ai/models.js';
import { providerReasoningControls } from '../../ai/openaiCompat.js';

test('connected-app route admits only the exact Zurelay DeepSeek model', () => {
  const env = { ZURELAY_API_KEY: 'synthetic-test-key' } as NodeJS.ProcessEnv;
  assert.deepEqual(connectedAppModelRoute(env, () => true), ['deepseek_v4_1_flash_1017']);
  assert.equal(MODELS.deepseek_v4_1_flash_1017.apiModel, 'deepseek-v4.1-flash-1017');
  assert.equal(MODELS.deepseek_v4_1_flash_1017.baseUrl, 'https://api.zurelay.com/v1');
  assert.deepEqual(providerReasoningControls('zurelay', 'none'), { reasoning_effort: 'none' });
});

test('connected-app route fails closed without credential or with a changed model', () => {
  assert.throws(() => connectedAppModelRoute({}, () => true), { code: 'CONNECTED_APP_MODEL_UNAVAILABLE' });
  const env = { ZURELAY_API_KEY: 'synthetic-test-key', ZURELAY_DEEPSEEK_MODEL_ID: 'another-model' } as NodeJS.ProcessEnv;
  assert.deepEqual(modelConfigurationIssues('deepseek_v4_1_flash_1017', env), ['missing_provider_identifier']);
  assert.throws(() => connectedAppModelRoute(env, () => true), { code: 'CONNECTED_APP_MODEL_UNAVAILABLE' });
});

test('connected-app route has no provider or model fallback', () => {
  const env = { ZURELAY_API_KEY: 'synthetic-test-key', XROGA_DISABLED_PROVIDERS: 'zurelay' } as NodeJS.ProcessEnv;
  assert.throws(() => connectedAppModelRoute(env, () => true), { code: 'CONNECTED_APP_MODEL_UNAVAILABLE' });
  assert.throws(() => connectedAppModelRoute({ ZURELAY_API_KEY: 'synthetic-test-key' }, () => false), { code: 'CONNECTED_APP_MODEL_UNAVAILABLE' });
});
