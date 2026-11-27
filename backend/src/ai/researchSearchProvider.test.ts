import test from 'node:test';
import assert from 'node:assert/strict';
import {deepseekSearchCredential,researchSearchMicroUsd,deepseekSearchBody,normaliseDeepseekSearch,scopeOfficialSearchQuery,DEEPSEEK_SEARCH_MICRO_USD} from './researchSearchProvider.js';

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
  assert.equal(body.count, 25);
  assert.deepEqual(Object.keys(deepseekSearchBody({ objective: '  ', search_queries: ['Next.js 15 release'] })).sort(), ['count', 'query']);
});

test('official-only queries send the approved domains and fit the provider limit', () => {
  assert.equal(scopeOfficialSearchQuery('pathlib read_text OR site:forum.example (read_bytes)', [
    'WWW.DOCS.PYTHON.ORG.', 'docs.python.org', 'https://unrelated.example', 'python.org/path', 'developer.mozilla.org',
  ]), 'pathlib read_text read_bytes site:docs.python.org OR site:developer.mozilla.org');
  const terms = '文件'.repeat(120) + '🌍';
  const query = scopeOfficialSearchQuery(terms, ['docs.python.org'])!;
  const body = deepseekSearchBody({ objective: '🌍'.repeat(150), search_queries: [query] });
  assert.equal([...body.query].length, 128);
  assert.equal([...body.ori_question!].length, 128);
  assert.equal(body.query, query);
  assert.ok(body.query.endsWith(' site:docs.python.org'));
  assert.equal(scopeOfficialSearchQuery('reserve no search', ['http://docs.python.org', 'local']), undefined);
});

test('DeepSeek results become the existing result shape with real URLs, dates and the trace receipt', () => {
  const out = normaliseDeepseekSearch({ results: [
    { title: 'Next.js 15', url: 'https://nextjs.org/blog/next-15', summary: 'Long model summary', snippet: 'short', date: '2024-10-20T16:00:00+00:00', site_name: 'Next.js', site_icon: 'https://cdn.deepseek.com/site-icons/nextjs.org' },
    { url: 'https://example.org/a', snippet: 'Only a snippet', date: 'not a date', site_icon: 'https://cdn.deepseek.com/site-icons/nextjs.org' },
  ] }, 'ef4ad084bbd155ace992b62bcef1f796');
  assert.equal(out.search_id, 'ef4ad084bbd155ace992b62bcef1f796');
  assert.equal(out.provider, 'deepseek');
  assert.deepEqual(out.results[0], { url: 'https://nextjs.org/blog/next-15', title: 'Next.js 15', publish_date: '2024-10-20T16:00:00+00:00', excerpts: ['Long model summary'], site_name: 'Next.js', site_icon_domain: 'nextjs.org' });
  assert.deepEqual(out.results[1], { url: 'https://example.org/a', publish_date: null, excerpts: ['Only a snippet'] });
});

test('malformed results or a missing receipt are refused rather than guessed', () => {
  assert.throws(() => normaliseDeepseekSearch({ items: [] }, 'ef4ad084bbd155ace992b62bcef1f796'), /Malformed/);
  assert.throws(() => normaliseDeepseekSearch({ results: [{ title: 'no url' }] }, 'ef4ad084bbd155ace992b62bcef1f796'), /Malformed/);
  assert.throws(() => normaliseDeepseekSearch({ results: [] }, null), /request identity/);
  assert.throws(() => normaliseDeepseekSearch({ results: [] }, 'bad id with spaces'), /request identity/);
});

test('a scoped primary lookup requests page content in the same Search call', () => {
  const body = { objective: 'Find the original standard for the connector safety steps.', search_queries: ['connector standard site:example.org'] };
  assert.deepEqual(deepseekSearchBody(body, 12, true), {
    query: body.search_queries[0], count: 12, ori_question: body.objective, need_content: true,
  });
  assert.equal(deepseekSearchBody(body).need_content, undefined);
});

test('primary evidence uses relevant text from the retrieved page and preserves its source', () => {
  const summary = 'Find the connector specification on the publisher site.';
  const result = { title: 'Connector Specification', url: 'https://example.org/standards/connector',
    summary, content: 'Connector Specification. ' + 'Publisher website navigation and press announcements. '.repeat(320)
      + 'Connector safety steps. These steps are mandatory. Step 1: disconnect power. Step 2: inspect the enclosure.' };
  const trace = 'ef4ad084bbd155ace992b62bcef1f796';
  const question = 'Find the original standard for connector safety steps.';
  const ordinary = normaliseDeepseekSearch({ results: [result] }, trace);
  const original = normaliseDeepseekSearch({ results: [result] }, trace, question);
  assert.equal(original.search_id, trace);
  assert.equal(original.results[0]?.url, result.url);
  assert.deepEqual(ordinary.results[0]?.excerpts, [summary]);
  assert.match(original.results[0]?.excerpts[0] ?? '', /disconnect power.*inspect the enclosure/);
  assert.ok((original.results[0]?.excerpts[0]?.length ?? 0) < result.content.length);
  const empty = normaliseDeepseekSearch({ results: [{ ...result, content: '' }] }, trace, question);
  assert.deepEqual(empty.results[0]?.excerpts, [summary]);
});
