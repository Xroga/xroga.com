import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const ROUTE = read('../app/page.tsx');
const CLIENT = read('../components/homepage/HomepageClient.tsx');
const PUBLIC_NAV = read('./publicMarketing.ts');
const FAQ = read('./homepageFaq.ts');
const SEO = read('./seo.ts');
const PRICING = read('../components/homepage/HomepagePricingPreview.tsx');

test('homepage is a server route with crawlable metadata and structured content', () => {
  assert.doesNotMatch(ROUTE, /^['"]use client['"]/);
  assert.match(ROUTE, /export const metadata/);
  assert.match(ROUTE, /path: '\/'/);
  assert.match(ROUTE, /FAQPage/);
  assert.match(ROUTE, /<HomepageClient \/>/);
});

test('homepage uses canonical Free and Xroga Pro product truth', () => {
  assert.match(SEO, /name: 'Free'[\s\S]*price: '0'/);
  assert.match(SEO, /name: 'Xroga Pro'[\s\S]*price: '25'/);
  assert.match(SEO, /billingDuration: 'P1M'/);
  assert.match(PRICING, /GALACTIC_PLANS/);
  assert.doesNotMatch(`${CLIENT}\n${FAQ}\n${SEO}\n${PRICING}`, /\$49|Lemon Squeezy|per 30-day|30-day free trial|AggregateRating/);
});

test('homepage navigation points only to current canonical destinations', () => {
  for (const destination of ['/ai-app-builder', '/ai-coding-agent', '/docs', '/pricing']) {
    assert.ok(PUBLIC_NAV.includes(destination), `${destination} is missing`);
  }
  assert.doesNotMatch(PUBLIC_NAV, /href:\s*'\/crypto-builder'/);
});
