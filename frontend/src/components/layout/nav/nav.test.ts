import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONNECT_GROUPS, CONNECT_MORE, MEGA_MENUS } from './navData';

const dir = fileURLToPath(new URL('./', import.meta.url));
const read = (p: string) => readFileSync(join(dir, p), 'utf8');
const HEADER = read('../PublicMarketingHeader.tsx');
const CSS = read('xroga-nav.css');
const FX = read('particles.ts');
const app = join(dir, '../../../app');

test('every menu destination is a real page', () => {
  const hrefs = new Set<string>();
  for (const m of Object.values(MEGA_MENUS)) {
    hrefs.add(m.ctaHref);
    for (const g of m.groups) for (const it of g.items) hrefs.add(it.href);
  }
  hrefs.add('/integrations');
  for (const href of hrefs) {
    const seg = href.replace(/^\//, '');
    const found = [seg, `(shell)/${seg}`, `(workspace)/${seg}`].some((s) => existsSync(join(app, s, 'page.tsx')));
    assert.ok(found, `${href} has a page`);
  }
});

test('menu content carried over: five menus, the same destinations, Connect keeps its real providers', () => {
  assert.deepEqual(Object.keys(MEGA_MENUS), ['Product', 'Build', 'Connect', 'Develop', 'Explore']);
  assert.deepEqual(
    MEGA_MENUS.Build.groups.flatMap((g) => g.items.map((i) => i.label)),
    ['Web apps', 'Websites', 'SaaS', 'Extensions, APIs & tools', 'Games', 'Web3 & crypto'],
  );
  assert.deepEqual(
    MEGA_MENUS.Develop.groups.flatMap((g) => g.items.map((i) => i.label)),
    ['Existing projects', 'GitHub repositories', 'Add features & fix bugs', 'Test & verify', 'Production readiness', 'Developer docs'],
  );
  const names = CONNECT_GROUPS.flatMap((g) => g.brands.map((b) => b.name));
  for (const n of ['GitHub', 'Gmail', 'Google Calendar', 'Google Drive', 'Slack', 'Discord', 'Notion', 'Linear', 'Jira', 'Asana', 'Airtable', 'Stripe', 'Shopify', 'HubSpot', 'Salesforce', 'Vercel', 'Supabase', 'Cloudflare']) assert.ok(names.includes(n), n);
  // marks Simple Icons no longer serves go straight to the provider favicon
  for (const b of [...CONNECT_GROUPS.flatMap((g) => g.brands), ...CONNECT_MORE]) if (b.favicon) assert.ok(b.domain, `${b.name} has a favicon domain`);
});

test('disclosure navigation: triggers own their panel, Escape returns focus, the closed panel is inert', () => {
  assert.match(HEADER, /aria-controls="xn-panel"/);
  assert.match(HEADER, /aria-expanded=\{isOpen\}/);
  assert.match(HEADER, /triggers\.current\[current\]\?\.focus\(\)/);
  assert.match(HEADER, /panelRef\.current\.inert = !activeMega/);
  // Tab from an open trigger enters its panel; past the last link it continues to the next trigger
  assert.match(HEADER, /const onTriggerKey/);
  assert.match(HEADER, /const onPanelKey/);
  // hover intent: a short delay to open, a longer one to close, and a bridge between bar and panel
  assert.match(HEADER, /open\(key, activeMega \? 0 : 90\)/);
  assert.match(HEADER, /setActiveMega\(null\), 260\)/);
  assert.match(CSS, /\.xn-panel \{[^}]*padding-top: 10px;/);
});

test('scroll: hides going down past the opening screen, returns going up, never while pinned, no flicker', () => {
  assert.match(HEADER, /addEventListener\('scroll', onScroll, \{ passive: true \}\)/);
  assert.match(HEADER, /requestAnimationFrame\(update\)/);
  assert.match(HEADER, /travel > 24 && y > threshold\(\)/);
  assert.match(HEADER, /travel < -12/);
  assert.match(HEADER, /const pinned = Boolean\(activeMega\) \|\| menuOpen \|\| focusInside/);
  assert.match(HEADER, /matches\(':focus-visible'\)/);
  assert.match(CSS, /\.xn\[data-hidden\] \{[^}]*pointer-events: none;/);
});

test('particles: crisp points, idle at rest, paused when hidden or the bar is hidden, still under reduced motion', () => {
  // the loop continues only while something moves or the pointer is near; frame time never runs backwards
  assert.match(FX, /if \(busy\) this\.raf = requestAnimationFrame/);
  assert.match(FX, /const dt = Math\.max\(0, Math\.min\(40, now - this\.last\)\)/);
  assert.match(FX, /document\.hidden/);
  // no blur anywhere in the layer: points are placed on whole device pixels
  assert.doesNotMatch(FX, /shadowBlur|filter\s*=/);
  assert.match(FX, /Math\.round\(x \* this\.dpr\)/);
  assert.doesNotMatch(CSS, /backdrop-filter/);
  // reduced motion: one still frame, no loop and no pointer response
  assert.match(HEADER, /new NavParticles\(canvas, bar, matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\)/);
  assert.match(FX, /if \(this\.raf \|\| document\.hidden \|\| this\.reduced\) return;/);
  assert.match(HEADER, /fx\.current\?\.setEnabled\(!hidden\)/);
  assert.match(HEADER, /orbit\.current\?\.setEnabled\(!hidden\)/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
  // no React state per frame: the layer is driven imperatively
  assert.doesNotMatch(FX, /useState|setState/);
});

test('previews are illustrative: no customer claims or invented metrics', () => {
  const pv = read('MegaPreviews.tsx');
  assert.match(pv, /Illustrative/);
  assert.doesNotMatch(pv, /\b\d+% |\b\d{2,}k\b|customers? (love|trust)|revenue|users? served/i);
});
