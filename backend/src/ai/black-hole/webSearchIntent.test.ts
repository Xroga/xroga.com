import assert from 'node:assert/strict';
import test from 'node:test';

import { decideWebAction, normalizeAutomaticWebAction } from './webIntelligence.js';

const userId = '11111111-1111-4111-8111-111111111111';

test('bare URL lists do not trigger paid search, fetch, or model classification', async () => {
  const prompt = Array.from({ length: 10 }, (_, index) =>
    `https://docs.example.org/article-${index + 1}`
  ).join('\n');
  const decision = await decideWebAction({ userId, prompt });
  assert.equal(decision.action, 'none');
  assert.deepEqual(decision.queries, []);
  assert.deepEqual(decision.urls, []);
  assert.match(decision.reason, /did not request an action/);
});

test('a URL with a specific instruction requests direct read, not discovery', async () => {
  const decision = await decideWebAction({
    userId,
    prompt: 'Summarize https://docs.example.org/guide',
  });
  assert.equal(decision.action, 'read');
  assert.deepEqual(decision.queries, []);
  assert.deepEqual(decision.urls, ['https://docs.example.org/guide']);
});

test('a bare X URL is not interpreted as permission to launch X research', async () => {
  const decision = await decideWebAction({
    userId,
    prompt: 'https://x.com/example/status/12345',
  });
  assert.equal(decision.action, 'none');
});

test('model-inferred Deep Research is bounded to automatic research', () => {
  assert.equal(normalizeAutomaticWebAction('deep_research'), 'research');
  assert.equal(normalizeAutomaticWebAction('search'), 'search');
  assert.equal(normalizeAutomaticWebAction('read'), 'read');
  assert.equal(normalizeAutomaticWebAction('none'), 'none');
});
