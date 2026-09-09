import assert from 'node:assert/strict';
import test from 'node:test';
import { ALTERNATIVES, BLOG_ARTICLES, BUILD_GUIDES, COMPARISONS, FUTURE_SEO_FACTORIES, INTEGRATION_GUIDES } from './seoGrowthContent';

test('SEO seed records have unique routes, titles, descriptions, and meaningful sections', () => {
  const records = [...BUILD_GUIDES, ...INTEGRATION_GUIDES, ...BLOG_ARTICLES];
  assert.equal(new Set(records.map((item) => item.slug)).size, records.length);
  assert.equal(new Set(records.map((item) => item.title)).size, records.length);
  for (const item of records) {
    assert.ok(item.description.length >= 80, `${item.slug} needs a substantial description`);
    assert.ok(item.intro.length >= 100, `${item.slug} needs a unique introduction`);
    assert.ok(item.sections.length >= 3, `${item.slug} needs meaningful sections`);
    assert.ok(item.related.length >= 2, `${item.slug} needs contextual links`);
  }
});

test('future factories are reserved without publishing thin placeholder pages', () => {
  assert.deepEqual(Object.values(FUTURE_SEO_FACTORIES), [
    '/stack/{technology}', '/how-to/{category}/{task}', '/templates/{template-slug}', '/migrate/{competitor}-to-xroga',
  ]);
});

test('comparison claims are source-verifiable and dated', () => {
  assert.equal(COMPARISONS.length, 6);
  for (const item of COMPARISONS) {
    assert.match(item.lastVerified, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(item.sources.length >= 2);
    assert.ok(item.sources.every(({ href }) => href.startsWith('https://')));
    assert.ok(item.facts.length >= 3);
    assert.ok(item.decisionPoints.length >= 4);
    assert.doesNotMatch(`${item.title} ${item.summary}`, /destroys|objectively #1|garbage/i);
  }
});

test('alternatives pages list several legitimate choices instead of only Xroga', () => {
  assert.equal(ALTERNATIVES.length, 4);
  for (const item of ALTERNATIVES) {
    assert.ok(item.choices.length >= 4);
    assert.ok(item.choices.filter((choice) => !choice.startsWith('Xroga')).length >= 3);
    assert.ok(item.compare.startsWith('/compare/xroga-vs-'));
  }
});
