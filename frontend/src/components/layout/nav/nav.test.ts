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

test('indicator and signal: one gliding surface written to CSS variables, no canvas, no per-frame React state', () => {
  assert.ok(!existsSync(join(dir, 'particles.ts')), 'the particle layer is gone');
  assert.doesNotMatch(HEADER, /<canvas|requestAnimationFrame\(frame|NavParticles|LogoOrbit/);
  assert.match(HEADER, /className="xn-ind"/);
  assert.match(HEADER, /ind\.style\.setProperty\('--x'/);
  assert.match(HEADER, /signalRef\.current\?\.style\.setProperty\('--sx'/);
  // positions are written to the moving elements only, never to an ancestor (which would restyle the open menu)
  assert.doesNotMatch(HEADER, /root\.style\.setProperty/);
  assert.match(HEADER, /className="xn-signal"/);
  assert.match(CSS, /\.xn-ind \{[^}]*transition:[^}]*transform 340ms/);
  // switching menus slides content from the side it was chosen on
  assert.match(HEADER, /setProperty\('--dx'/);
  assert.match(CSS, /translate\(var\(--dx, 0px\), 4px\)/);
  // no blur, glow sprites or ambient loops
  assert.doesNotMatch(CSS, /backdrop-filter|filter: blur|drop-shadow/);
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)/);
});

test('lockup: the approved orb wordmark, split at its artwork gap and spaced', () => {
  assert.match(HEADER, /className="xn-lockup"/);
  assert.match(CSS, /\.xn-lockup \{[^}]*gap: 11px;/);
  assert.match(CSS, /url\('\/brand\/xroga-orb-wordmark-dark-v3\.webp'\)/);
  assert.ok(existsSync(join(dir, '../../../../public/brand/xroga-orb-wordmark-dark-v3.webp')));
});

test('previews are illustrative: no customer claims or invented metrics', () => {
  const pv = read('MegaPreviews.tsx');
  assert.match(pv, /Illustrative/);
  assert.doesNotMatch(pv, /\b\d+% |\b\d{2,}k\b|customers? (love|trust)|revenue|users? served/i);
});
