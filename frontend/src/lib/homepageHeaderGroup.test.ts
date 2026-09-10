import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const CHROME = read('../components/layout/PublicMarketingChrome.tsx');
const HEADER = read('../components/layout/PublicMarketingHeader.tsx');
const HOME = read('../components/homepage/HomepageClient.tsx');
const EDITORIAL = read('../components/seo/EditorialPage.tsx');

test('public pages have one canonical header and footer source', () => {
  assert.match(CHROME, /<PublicMarketingHeader \/>/);
  assert.match(CHROME, /<MarketingFooter \/>/);
  assert.doesNotMatch(HOME, /xv-hc-header|<MarketingFooter/);
  assert.doesNotMatch(EDITORIAL, /xv-seo-header|<MarketingFooter/);
});

test('the canonical header owns desktop and mobile navigation', () => {
  assert.match(HEADER, /PUBLIC_MARKETING_NAV\.map/g);
  assert.match(HEADER, /aria-label="Primary navigation"/);
  assert.match(HEADER, /aria-label="Mobile navigation"/);
  assert.match(HEADER, /aria-expanded=\{menuOpen\}/);
  assert.match(HEADER, /event\.key === 'Escape'/);
});

test('theme and account controls use the same shared public header', () => {
  assert.match(HEADER, /<HomepageThemeSwitcher \/>/);
  assert.match(HEADER, /loggedIn \? 'Dashboard' : 'Sign in'/);
  assert.match(HEADER, /href="\/auth\/signup">Start free/);
});
