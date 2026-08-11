import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAuraInput } from './auraGroq';

test('parseAuraInput accepts and clamps a valid public chat request', () => {
  const input = parseAuraInput({
    messages: [{ role: 'user', content: '  Hello Aura  ' }],
    model: 'llama-3.1-8b-instant',
    persona: 'developer',
    temperature: 99,
    maxTokens: 99,
  });
  assert.deepEqual(input, {
    messages: [{ role: 'user', content: 'Hello Aura' }],
    model: 'llama-3.1-8b-instant',
    persona: 'developer',
    temperature: 1.5,
    maxTokens: 400,
  });
});

test('parseAuraInput rejects requests without a final user message', () => {
  assert.equal(parseAuraInput({ messages: [{ role: 'assistant', content: 'Hello' }] }), null);
  assert.equal(parseAuraInput({ messages: [] }), null);
});

test('parseAuraInput falls back from unsupported model and persona values', () => {
  const input = parseAuraInput({
    messages: [{ role: 'user', content: 'Hello' }],
    model: 'unknown-model',
    persona: 'untrusted',
  });
  assert.equal(input?.model, 'llama-3.3-70b-versatile');
  assert.equal(input?.persona, 'balanced');
});
