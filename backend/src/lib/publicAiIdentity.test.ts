import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicAiPayload, publicAiText } from './publicAiIdentity.js';

test('public AI text replaces upstream provider and model identities', () => {
  for (const name of ['Kimi K3', 'DeepSeek V3', 'Gemini 2.5', 'Claude 4', 'GPT-5', 'OpenRouter']) {
    const result = publicAiText(`Waiting on ${name}`);
    assert.doesNotMatch(result, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    assert.match(result, /Black Hole ∞/);
  }
});

test('public execution payload strips routing keys recursively', () => {
  const result = publicAiPayload({
    message: 'Gemini is working',
    provider: 'google',
    output: { modelId: 'gemini-2.5', providersUsed: ['google'], status: 'running' },
  });
  assert.deepEqual(result, {
    message: 'Black Hole ∞ is working',
    output: { status: 'running' },
  });
});
