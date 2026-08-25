import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';

/**
 * Guards for the crypto page's route, its theme, and its footer.
 *
 * **The page was behind the login wall.** `PUBLIC_PREFIXES` listed
 * `/crypto-builder`, a route that has never existed, so the real page at `/crypto`
 * was not public and every signed-out visitor was redirected to `/auth/login`. A
 * marketing page nobody can reach without an account is the most expensive kind of
 * broken, because it looks fine to whoever is signed in and testing it.
 *
 * **The permanent redirect pointed at the same missing route.** `/crypto-hackathon-
 * builder` → `/crypto-builder` was meant to rescue old links and delivered them to a
 * 404. It is `permanent`, so browsers and indexes have it cached: `/crypto-builder`
 * is now redirected too rather than merely dropped.
 *
 * **The page only exists in black.** It paints its own deep-blue scene end to end.
 * Under the light themes it kept the light ink, so the headline and the composer
 * rendered near-black on near-black. The theme is forced at render rather than
 * written into the store, so the user's own choice survives leaving the page.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const ACCESS = read('./supabase/routeAccess.ts');
const CONFIG = read('../../next.config.mjs');
const PROVIDER = read('../components/providers/ThemeProvider.tsx');
const PAGE = read('../app/crypto/page.tsx');

test('the crypto page is reachable without an account', () => {
  assert.match(ACCESS, /'\/crypto',/, '/crypto is not a public route');
  assert.ok(
    !/'\/crypto-builder'/.test(ACCESS),
    'the public list still names a route that does not exist',
  );
});

test('every crypto route in the config resolves to a page that exists', () => {
  // The routes named as redirect destinations must be real directories under app/.
  const destinations = [...CONFIG.matchAll(/source: '(\/crypto[^']*)', destination: '([^']+)'/g)];
  assert.ok(destinations.length >= 2, 'the old crypto URLs are no longer redirected');
  for (const [, source, destination] of destinations) {
    assert.equal(destination, '/crypto', `${source} points at ${destination}`);
  }
  assert.ok(
    existsSync(new URL('../app/crypto/page.tsx', import.meta.url)),
    'the destination page is missing',
  );
  // The cached permanent redirect has to land somewhere real too.
  assert.ok(
    destinations.some(([, source]) => source === '/crypto-builder'),
    'the cached /crypto-builder redirect is unhandled, so old links still 404',
  );
});

test('the crypto page renders in black whatever the stored theme is', () => {
  assert.match(
    PROVIDER,
    /pathname\?\.startsWith\('\/crypto'\) \? \('black' as const\) : null/,
    'the crypto route no longer forces its theme',
  );
  assert.match(PROVIDER, /const core = forcedTheme \?\? normalizeTheme\(theme\)/, 'the forced theme must win');
  // Forced at render, not written to the store: the user's own choice comes back
  // the moment they leave.
  const at = PROVIDER.indexOf('forcedTheme');
  assert.ok(
    !/setTheme\('black'\)/.test(PROVIDER.slice(at, at + 600)),
    'forcing the page theme must not overwrite the stored preference',
  );
});

/**
 * The hero followed the homepage's rhythm — headline, subtitle, composer — after
 * losing a "Start building" button that sat between the subtitle and the composer
 * and linked to `#builder`, the composer directly beneath it. It scrolled to
 * something already on screen, and it put a second call to action in front of the
 * only control on the page that starts a build.
 */
test('the hero goes straight from the headline to the composer', () => {
  const hero = PAGE.slice(PAGE.indexOf('styles.heroInner'), PAGE.indexOf('styles.stackLabel'));
  assert.ok(hero.length > 0, 'the hero could not be located');

  // The anchor is still the composer, so inbound `#builder` links keep landing.
  assert.match(hero, /id="builder"/, 'the composer lost its anchor');
  assert.ok(
    !/href="#builder"/.test(hero.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')),
    'the hero links to a target already on screen',
  );

  // Headline, then subtitle, then the composer — nothing between them.
  const order = ['styles.heroTitle', 'styles.heroSub', 'styles.heroConsole'].map((mark) => hero.indexOf(mark));
  assert.ok(order.every((at) => at >= 0), 'the hero is missing one of its three parts');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'the hero parts are out of order');
});

test('the page uses the shared footer and drops the redundant badge', () => {
  assert.match(PAGE, /<MarketingFooter \/>/, 'the crypto page needs the shared footer');
  // It carried its own copy — same links, same wording, its own markup — so every
  // change to the site footer had to be made twice.
  assert.ok(!/styles\.footer/.test(PAGE), 'the duplicated footer markup is back');
  assert.ok(
    !/XROGA CRYPTO BUILDER/.test(PAGE),
    'the badge repeats the headline directly above it',
  );
});
