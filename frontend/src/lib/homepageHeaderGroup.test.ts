import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const CHROME = read('../components/layout/PublicMarketingChrome.tsx');
const HEADER = read('../components/layout/PublicMarketingHeader.tsx');
const HOME = read('../components/homepage/HomepageClient.tsx');
const EDITORIAL = read('../components/seo/EditorialPage.tsx');
const SIDEBAR = read('../components/layout/Sidebar.tsx');
const THEME = read('./theme.ts');

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
  assert.match(HEADER, /href="\/workspace"/);
  assert.match(HEADER, /Start Building Free/);
});

test('full and compact Xroga branding use the supplied shared assets', () => {
  assert.match(THEME, /HEADER_LOGO_URL = '\/brand\/xroga-orb-wordmark-v2\.webp'/);
  assert.match(THEME, /SIDEBAR_FULL_LOGO_URL = '\/brand\/xroga-orb-wordmark-v2\.webp'/);
  assert.match(THEME, /DARK_SURFACE_WORDMARK_LOGO_URL = '\/brand\/xroga-orb-wordmark-dark-v3\.webp'/);
  assert.match(THEME, /SIDEBAR_LOGO_URL = '\/brand\/xroga-orb-mark-v2\.webp'/);
  assert.match(SIDEBAR, /variant="sidebarFull"/);
  assert.match(SIDEBAR, /variant="sidebar"/);
  assert.doesNotMatch(SIDEBAR, /data-testid="xroga-sidebar-wordmark"/);
});
