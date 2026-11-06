import assert from 'node:assert/strict';
import test from 'node:test';
import { automaticResearchAction, decideWebAction, isBareUrlList } from './webIntelligence.js';

const userId = '11111111-1111-4111-8111-111111111111';

test('ten pasted links without a task never trigger search, fetch or an LLM classifier', async () => {
  const prompt = Array.from({length:10},(_,i)=>`https://docs.example.org/item-${i}`).join('\n');
  assert.equal(isBareUrlList(prompt), true);
  const result = await decideWebAction({userId,prompt});
  assert.equal(result.action, 'none');
  assert.deepEqual(result.queries, []);
  assert.deepEqual(result.urls, []);
});

test('explicit user request reads all ten URLs directly with no discovery query', async () => {
  const prompt = 'Summarize these documents:\n' +
    Array.from({length:10},(_,i)=>`https://docs.example.org/item-${i}`).join('\n');
  const result = await decideWebAction({userId,prompt});
  assert.equal(result.action, 'read');
  assert.equal(result.urls.length, 10);
  assert.deepEqual(result.queries, []);
});

test('bare X URL is not an implicit X-search authorization', async () => {
  const result = await decideWebAction({userId,prompt:'https://x.com/example/status/12345'});
  assert.equal(result.action, 'none');
});

test('model-inferred deep research cannot consume manually selected runs', () => {
  assert.equal(automaticResearchAction('deep_research'),'research');
  assert.equal(automaticResearchAction('search'),'search');
  assert.equal(automaticResearchAction('read'),'read');
});
