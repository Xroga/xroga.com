import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const PAGE = read('../components/homepage/HomepageClient.tsx');
const ROUTE = read('../app/page.tsx');

test('the first screen is the locked S00 hero, mounted once (S00_FINAL_LOCK)', () => {
  assert.match(PAGE, /<div className="hpx-root">\s*<S00Hero \/>\s*<\/div>/);
  assert.equal(PAGE.match(/<S00Hero \/>/g)?.length, 1, 'one hero, no feature flag');
  assert.match(PAGE, /import '@\/components\/homepage-next\/tokens\.css';/);
});

test('the previous production hero is fully removed from the page', () => {
  for (const old of ['xv-hc-hero', 'xv-hc-headline', 'AI APP BUILDER + CODING AGENT', 'code you own.', '<HomepageChatBar />', 'xv-hc-category-track', 'xroga-clean-horizon']) {
    assert.ok(!PAGE.includes(old), `old hero still present: ${old}`);
  }
});

test('homepage metadata carries the primary and secondary search intent', () => {
  assert.match(ROUTE, /AI App Builder & Coding Agent for Real Software \| Xroga/);
  assert.match(ROUTE, /keywords: \['AI app builder', 'AI coding agent'/);
  assert.match(ROUTE, /path: '\/'/);
});
