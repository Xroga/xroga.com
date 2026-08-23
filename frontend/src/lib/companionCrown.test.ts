import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { DEFAULT_COMPANION_PREFERENCES } from './companion';

/**
 * The companion wears no crown badge.
 *
 * It used to: an X-shaped mark drawn over Smoky on every surface — the homepage hero,
 * the composer, the workspace and the wardrobe preview. Two things made it worth
 * removing rather than defaulting off.
 *
 * It sat across the character's face, so the artwork underneath was never fully visible.
 * And `crownEnabled` defaulted to `true` with no control anywhere in the product that
 * could change it — not in Settings, not in the customizer. A preference nothing can set
 * is not a preference; it is a constant with extra steps, and leaving the flag behind
 * would invite someone to wire a toggle to it later and put the X back.
 *
 * The mantle mark is a separate overlay and is deliberately untouched.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const RENDERER = read('../components/companion/CompanionRenderer.tsx');
const COMPANION = read('../components/companion/XrogaCompanion.tsx');
const CUSTOMIZER = read('../components/companion/CompanionCustomizer.tsx');
const STORE = read('../store/useCompanionStore.ts');
const CSS = read('../styles/companion.css');
const LIB = read('./companion.ts');

test('nothing draws a crown badge any more', () => {
  // The mark itself: a circle with two crossed strokes.
  assert.ok(
    !/crown-mark/i.test(RENDERER + CSS),
    'the crown badge element or its styles are back',
  );
  assert.ok(
    !/M7\.2 7\.2 L16\.8 16\.8/.test(RENDERER),
    'the X path that formed the badge is back in the renderer',
  );
});

test('the flag that could only ever be true is gone', () => {
  assert.ok(
    !('crownEnabled' in DEFAULT_COMPANION_PREFERENCES),
    'crownEnabled is still a companion preference',
  );
  for (const [name, source] of [
    ['companion.ts', LIB],
    ['CompanionRenderer', RENDERER],
    ['XrogaCompanion', COMPANION],
    ['CompanionCustomizer', CUSTOMIZER],
    ['useCompanionStore', STORE],
  ] as const) {
    assert.ok(!source.includes('crownEnabled'), `${name} still references crownEnabled`);
  }
});

test('the mantle overlay is untouched', () => {
  // Removing one overlay should not quietly take the other with it.
  assert.ok(RENDERER.includes('xv-companion-mantle-mark'), 'the mantle mark should still render');
  assert.ok(
    'mantleEnabled' in DEFAULT_COMPANION_PREFERENCES,
    'the mantle preference should still exist',
  );
});

test('the costume artwork is still what the renderer shows', () => {
  // The badge was an overlay on top of the costume image; taking it away must not
  // disturb how the costume itself is resolved.
  assert.ok(
    RENDERER.includes('portraitSrc ?? costumeImage(costume)'),
    'the renderer must still resolve artwork from the selected costume',
  );
  assert.ok(
    /\/brand\/costumes\/\$\{costume\}\.webp/.test(RENDERER),
    'costume art still resolves from public/brand/costumes',
  );
});
