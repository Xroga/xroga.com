import test from 'node:test';
import assert from 'node:assert/strict';
import {deepseekSearchCredential,researchSearchMicroUsd,deepseekSearchBody,normaliseDeepseekSearch,DEEPSEEK_SEARCH_MICRO_USD} from './researchSearchProvider.js';

test('search uses only the dedicated DeepSeek credential; without it search is unavailable, never rerouted', () => {
  const saved = process.env.DEEPSEEK_WEBSEARCH_FETCH_API;
  try {
    delete process.env.DEEPSEEK_WEBSEARCH_FETCH_API;
    assert.equal(deepseekSearchCredential(), undefined);
    process.env.DEEPSEEK_WEBSEARCH_FETCH_API = 'synthetic-deepseek-search-key';
    assert.equal(deepseekSearchCredential(), 'synthetic-deepseek-search-key');
  } finally {
    if (saved === undefined) delete process.env.DEEPSEEK_WEBSEARCH_FETCH_API; else process.env.DEEPSEEK_WEBSEARCH_FETCH_API = saved;
  }
  assert.equal(researchSearchMicroUsd(), DEEPSEEK_SEARCH_MICRO_USD);
});

test('one bounded DeepSeek request respects the documented 128-character limits', () => {
  const long = 'x'.repeat(400);
  const body = deepseekSearchBody({ objective: long, search_queries: [long, 'second query is not sent'] });
  assert.equal(body.query.length, 128);
  assert.equal(body.ori_question?.length, 128);
  assert.equal(body.count, 10);
  assert.deepEqual(Object.keys(deepseekSearchBody({ objective: '  ', search_queries: ['Next.js 15 release'] })).sort(), ['count', 'query']);
});

test('DeepSeek results become the existing result shape with real URLs, dates and the trace receipt', () => {
  const out = normaliseDeepseekSearch({ results: [
    { title: 'Next.js 15', url: 'https://nextjs.org/blog/next-15', summary: 'Long model summary', snippet: 'short', date: '2024-10-20T16:00:00+00:00', site_name: 'Next.js' },
    { url: 'https://example.org/a', snippet: 'Only a snippet', date: 'not a date' },
  ] }, 'ef4ad084bbd155ace992b62bcef1f796');
  assert.equal(out.search_id, 'ef4ad084bbd155ace992b62bcef1f796');
  assert.equal(out.provider, 'deepseek');
  assert.deepEqual(out.results[0], { url: 'https://nextjs.org/blog/next-15', title: 'Next.js 15', publish_date: '2024-10-20T16:00:00+00:00', excerpts: ['Long model summary'] });
  assert.deepEqual(out.results[1], { url: 'https://example.org/a', publish_date: null, excerpts: ['Only a snippet'] });
});

test('malformed results or a missing receipt are refused rather than guessed', () => {
  assert.throws(() => normaliseDeepseekSearch({ items: [] }, 'ef4ad084bbd155ace992b62bcef1f796'), /Malformed/);
  assert.throws(() => normaliseDeepseekSearch({ results: [{ title: 'no url' }] }, 'ef4ad084bbd155ace992b62bcef1f796'), /Malformed/);
  assert.throws(() => normaliseDeepseekSearch({ results: [] }, null), /request identity/);
  assert.throws(() => normaliseDeepseekSearch({ results: [] }, 'bad id with spaces'), /request identity/);
});
