import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { MIGRATION_GUIDES, READINESS_CHECKS, STACK_GUIDES, summarizeReadiness } from './seoExpansionContent';

const allPages = [...STACK_GUIDES, ...MIGRATION_GUIDES];

test('expansion pages have unique, substantial, evidence-backed records', () => {
  assert.equal(new Set(allPages.map((page) => page.slug)).size, allPages.length);
  assert.equal(new Set(allPages.map((page) => page.title)).size, allPages.length);
  assert.equal(new Set(allPages.map((page) => page.description)).size, allPages.length);
  for (const page of allPages) {
    const text = [page.intro, ...page.sections.flatMap((section) => [section.heading, ...section.paragraphs, ...(section.bullets ?? [])])].join(' ');
    assert.ok(text.length >= 900, `${page.slug} is too thin (${text.length} characters)`);
    assert.ok(page.sources.length >= 2, `${page.slug} needs at least two primary sources`);
    assert.ok(page.sources.every((source) => /^https:\/\//.test(source.href)), `${page.slug} has a non-HTTPS source`);
    assert.equal(page.reviewed, '2026-09-11');
  }
});

test('published SEO copy keeps current product facts and excludes unsupported claims', () => {
  const content = JSON.stringify(allPages);
  assert.doesNotMatch(content, /\$19|guaranteed traffic|guaranteed ranking|AggregateRating|ratingValue/i);
  assert.doesNotMatch(content, /best AI (?:app builder|coding agent)/i);
});

test('readiness checker reports evidence without an invented score', () => {
  const partial = Object.fromEntries(READINESS_CHECKS.slice(0, 3).map(({ id }) => [id, true]));
  assert.deepEqual(summarizeReadiness(partial), { confirmed: 3, unresolved: READINESS_CHECKS.length - 3, total: READINESS_CHECKS.length });
});

test('crawler policy explicitly distinguishes search crawlers and user retrieval', () => {
  const policy = JSON.parse(readFileSync(new URL('../../../scripts/seo-crawlers.json', import.meta.url), 'utf8'));
  const byAgent = new Map(policy.crawlers.map((crawler: { userAgent: string }) => [crawler.userAgent, crawler]));
  assert.equal(byAgent.get('OAI-SearchBot')?.robotsApplies, true);
  assert.equal(byAgent.get('PerplexityBot')?.robotsApplies, true);
  assert.equal(byAgent.get('ChatGPT-User')?.robotsApplies, false);
  assert.equal(byAgent.get('Perplexity-User')?.robotsApplies, false);
});
