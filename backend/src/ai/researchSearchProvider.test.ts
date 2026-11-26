import test from 'node:test';
import assert from 'node:assert/strict';
import {deepseekSearchCredential,researchSearchMicroUsd,deepseekSearchBody,fitDeepseekSearchQuery,matchingPageParagraphs,normaliseDeepseekSearch,scopeOfficialSearchQuery,DEEPSEEK_SEARCH_MICRO_USD} from './researchSearchProvider.js';

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

test('official-only queries send the approved domains and fit the provider limit', () => {
  assert.equal(scopeOfficialSearchQuery('pathlib read_text OR site:forum.example (read_bytes)', [
    'WWW.DOCS.PYTHON.ORG.', 'docs.python.org', 'https://unrelated.example', 'python.org/path', 'developer.mozilla.org',
  ]), 'pathlib read_text (read_bytes) site:docs.python.org OR site:developer.mozilla.org');
  const terms = '文件'.repeat(120) + '🌍';
  const query = scopeOfficialSearchQuery(terms, ['docs.python.org'])!;
  const body = deepseekSearchBody({ objective: '🌍'.repeat(150), search_queries: [query] });
  assert.equal([...body.query].length, 128);
  assert.equal([...body.ori_question!].length, 128);
  assert.equal(body.query, query);
  assert.ok(body.query.endsWith(' site:docs.python.org'));
  assert.equal(scopeOfficialSearchQuery('reserve no search', ['http://docs.python.org', 'local']), undefined);
});

test('official scoping preserves public phrases, alternatives, and exclusions while replacing unrelated sites', () => {
  const terms = 'WCAG "focus not obscured" OR "target size" -"working draft" -deprecated lang:en';
  const query = scopeOfficialSearchQuery(terms + ' (site:forums.example OR site:articles.example)', ['w3.org']);
  assert.equal(query, terms + ' site:w3.org');
  assert.equal(scopeOfficialSearchQuery('"weather or climate" -site:drafts.noaa.gov', ['noaa.gov']),
    '"weather or climate" -site:drafts.noaa.gov site:noaa.gov');
  assert.equal(scopeOfficialSearchQuery('"site: prefix" -"draft OR working copy"', ['example.org']),
    '"site: prefix" -"draft OR working copy" site:example.org');
});

test('official scoping keeps constrained terms when adding the publisher pushes a query over the wire length', () => {
  const unscoped = 'WCAG updates impact teams migrating interfaces "focus not obscured" OR "target size" -"working draft" -deprecated lang:en';
  assert.ok([...unscoped].length <= 128 && [...unscoped, ...' site:w3.org'].length > 128);
  const scoped = scopeOfficialSearchQuery(unscoped, ['w3.org']);
  assert.ok(scoped && [...scoped].length <= 128);
  assert.match(scoped, /^WCAG\b/);
  assert.match(scoped, /"focus not obscured" OR "target size" -"working draft" -deprecated lang:en site:w3\.org$/);
  assert.equal(deepseekSearchBody({ objective: 'WCAG scoped check', search_queries: [scoped] }).query, scoped);
});

test('official scoping fits unsegmented Unicode while preserving a language filter', () => {
  const unscoped = 'アクセシビリティ'.repeat(20) + ' lang:ja';
  const scoped = scopeOfficialSearchQuery(unscoped, ['w3.org']);
  assert.ok(scoped && [...scoped].length === 128);
  assert.match(scoped, /^アクセシビリティ.* lang:ja site:w3\.org$/u);
  assert.match(fitDeepseekSearchQuery(unscoped) ?? '', /^アクセシビリティ.* lang:ja$/u);
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
    summary, content: 'Connector Specification. ' + 'Publisher website navigation and press announcements. '.repeat(110)
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

test('a long provider query retains complete terms and all publisher and date filters', () => {
  const long = '"Climate Data Guide" station calibration adjustments for measured precipitation published monthly in ' +
    'public weather archives including technical annexes and instrument maintenance guidance after:2025-01-01 ' +
    'site:example.org OR site:example.net lang:en';
  const fitted = fitDeepseekSearchQuery(long);
  assert.ok(fitted && [...fitted].length <= 128);
  assert.match(fitted, /^"Climate Data Guide" station calibration adjustments\b/);
  assert.match(fitted, /after:2025-01-01 lang:en site:example\.org OR site:example\.net$/);
});

test('a standard excerpt favors exact clause coverage over a repeated last query word', () => {
  const navigation = 'Latest information. Browse this site for news. '.repeat(150);
  const noisy = 'Coverage metrics overview ' + 'overview '.repeat(150);
  const primary = '4.1.8 Switch layout\n\nA fixed dock must allow the active switch to stay visible.' +
    '\n\n4.1.9 Target spacing\n\nThe individual target or an equivalent control must have enough space.';
  const result = matchingPageParagraphs(navigation + primary + '\n\n' + navigation + noisy,
    'connector standard 4.1.8 and 4.1.9 switch layout overview');
  assert.match(result, /4\.1\.8.*4\.1\.9.*equivalent control/);
});

test('official references use each requested section body instead of the shared contents list', () => {
  const longBetween = 'Unrelated supporting examples. '.repeat(210);
  const text = '## Contents\n4.1.7 Readable state\n4.1.9 Input limits\n6.3.8 Confirmation choices\n\n'
    + '### 4.1.7 Readable state\n\nDisplay the current state alongside the active control.\n\n'
    + '### 4.1.8 Unrelated topic\n\n' + longBetween + '\n\n'
    + '### 4.1.9 Input limits\n\nShow the permitted range beside the field.\n\n'
    + '### 4.2.1 Unrelated topic\n\n' + longBetween + '\n\n'
    + '### 6.3.8 Confirmation choices\n\n' + longBetween + '\n\nNormative requirements:\n'
    + 'Provide an alternative that does not rely on recalling a code.';
  const result = matchingPageParagraphs(text, 'Requirements handbook 2.2 references 4.1.7, 4.1.9, and 6.3.8');
  assert.match(result, /4\.1\.7 Readable state Display the current state/);
  assert.match(result, /4\.1\.9 Input limits Show the permitted range/);
  assert.match(result, /6\.3\.8 Confirmation choices Provide an alternative/);
  assert.doesNotMatch(result, /Contents|Unrelated/);
  assert.ok(result.length <= 3200);
});

test('a dedicated reference page preserves the rule and its late scope note for a multi-rule lookup', () => {
  const summary = 'General information about indicator testing.';
  const repeatedNavigation = 'Release history and links to the test lab. '.repeat(95);
  const note = 'This criterion evaluates the latch rather than the lamp next to it.';
  const result = normaliseDeepseekSearch({ results: [{
    title: 'Understanding SC 8.4.2 Cabinet latches',
    url: 'https://example.org/handbook/latches',
    summary,
    content: '## Site contents\n' + repeatedNavigation
      + '\n# Understanding SC 8.4.2 Cabinet latches\n'
      + '\n## In brief\nCheck that cabinet controls can be identified.\n'
      + '\n## Success Criterion (SC)\nThe active latch must remain visible when the cabinet is closed.\n'
      + '\n## Informative examples\n' + 'Examples of cabinets and their inspection history. '.repeat(110)
      + '\n\nNote\n' + note
      + '\n\n# Clause 8.4.4 Emergency controls\nThis criterion applies only to a separate cabinet.',
  }] }, 'e5a4d084bbd155ace992b62bcef1f796', 'Inspect standards 8.4.2, 9.5.1 and 9.5.4 in a simulated lab.');
  const [excerpt] = result.results[0].excerpts;
  assert.match(excerpt, /^Understanding SC 8\.4\.2 Cabinet latches The active latch must remain visible/u);
  assert.ok(excerpt.includes(note));
  assert.doesNotMatch(excerpt, /Site contents|In brief|separate cabinet/u);
  assert.ok(excerpt.length <= 3200);
});
