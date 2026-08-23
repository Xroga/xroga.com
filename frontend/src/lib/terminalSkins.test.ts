import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_TERMINAL_SKIN,
  TERMINAL_SKINS,
  TERMINAL_SKIN_CYCLE,
  TERMINAL_SKIN_LABELS,
  isTerminalSkin,
  skinForTheme,
  skinTone,
} from './theme';

test('every skin id is unique and carries a label, tone, and full swatch', () => {
  const ids = TERMINAL_SKINS.map((skin) => skin.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate skin id');

  for (const skin of TERMINAL_SKINS) {
    assert.ok(skin.label.trim().length > 0, `${skin.id} has no label`);
    assert.ok(['dark', 'light'].includes(skin.tone), `${skin.id} has an unknown tone`);
    assert.equal(skin.swatch.length, 3, `${skin.id} swatch is not [surface, ink, accent]`);
    for (const colour of skin.swatch) {
      assert.match(colour, /^#[0-9a-f]{6}$/i, `${skin.id} swatch colour ${colour} is not a hex triplet`);
    }
    assert.equal(TERMINAL_SKIN_LABELS[skin.id], skin.label);
  }
});

/**
 * The five original ids are persisted in `xroga-theme` on real users' machines.
 * Renaming or dropping one would silently reset their terminal, so they are pinned.
 */
test('the skin ids that predate the picker still resolve', () => {
  for (const id of ['dark', 'light', 'light-grid', 'gray', 'amoled']) {
    assert.equal(isTerminalSkin(id), true, `${id} no longer exists`);
  }
});

test('isTerminalSkin rejects anything not in the catalogue', () => {
  for (const value of ['', 'DARK', 'neon', null, undefined, 7, {}]) {
    assert.equal(isTerminalSkin(value), false, `${String(value)} was accepted`);
  }
});

test('the cycle covers the catalogue exactly once', () => {
  assert.deepEqual([...TERMINAL_SKIN_CYCLE].sort(), TERMINAL_SKINS.map((s) => s.id).sort());
});

/**
 * Automatic mode follows the theme.
 *
 * It used to resolve to dark on every theme, so "auto" tracked nothing: switching the
 * page to White or Beige left a black terminal in the middle of a light application,
 * and the theme control appeared to do nothing to the largest surface on screen. That
 * is the reported defect this reverses.
 *
 * The tone must match the theme's own tone, which is the property that actually
 * matters — naming one skin per theme here would pass while a later catalogue change
 * silently made the pairing wrong.
 */
const THEME_TONE: Record<string, 'dark' | 'light'> = {
  white: 'light',
  beige: 'light',
  gray: 'dark',
  black: 'dark',
};

test('automatic mode resolves to a skin whose tone matches the theme', () => {
  for (const [theme, tone] of Object.entries(THEME_TONE)) {
    const resolved = skinForTheme(theme);
    assert.equal(skinTone(resolved), tone, `${theme} resolved to a ${skinTone(resolved)} terminal`);
  }
});

test('every automatic resolution is a real skin, and they are not all the same one', () => {
  for (const skin of Object.values(DEFAULT_TERMINAL_SKIN)) {
    assert.equal(isTerminalSkin(skin), true, `${skin} is not in the catalogue`);
  }
  // The regression being guarded is a table where every entry is identical: that is
  // what "auto" looked like before, and it is indistinguishable from having no
  // mapping at all.
  const distinct = new Set(Object.values(DEFAULT_TERMINAL_SKIN));
  assert.ok(distinct.size > 1, 'every theme resolves to the same skin, so auto tracks nothing');
});

test('choosing a skin by hand is still what turns automatic mode off', () => {
  const source = readFileSync(new URL('../store/useThemeStore.ts', import.meta.url), 'utf8');
  assert.match(source, /setTerminalSkin: \(terminalSkin\) => set\(\{ terminalSkin, terminalSkinAuto: false \}\)/);
});

test('choosing a theme restyles the terminal too, from one place', () => {
  /*
   * This used to read `terminalSkinAuto ? skinForTheme(next) : terminalSkin`, so a
   * skin picked once by hand froze the terminal against every later theme change.
   *
   * That half of the contract was already contradicted in practice: the sidebar's
   * `ThemeToggle` called `setTerminalSkin` immediately after `setTheme`, forcing the
   * skin anyway, while the homepage switcher called only `setTheme`. The two controls
   * disagreed about what picking a theme means — the sidebar restyled the workspace,
   * the homepage left it behind, and the user had to pick the same theme a second
   * time from inside the workspace to make it take.
   *
   * The decision lives in the store now, so both controls do the same thing. A skin
   * picked by hand still survives navigation and reloads; it gives way to the next
   * explicit theme choice, which is a fresh statement about the whole shell.
   */
  const source = readFileSync(new URL('../store/useThemeStore.ts', import.meta.url), 'utf8');
  assert.match(source, /terminalSkin: skinForTheme\(next\),\s*\n\s*terminalSkinAuto: true,/);
  assert.ok(
    !/terminalSkinAuto \? skinForTheme/.test(source),
    'setTheme is conditional again, so a hand-picked skin will freeze the terminal',
  );

  // And no control may re-force the skin beside it, or they can drift apart again.
  for (const control of ['../components/layout/ThemeToggle.tsx', '../components/companion/HomepageThemeSwitcher.tsx']) {
    const picker = readFileSync(new URL(control, import.meta.url), 'utf8');
    assert.ok(
      !/setTerminalSkin\(/.test(picker),
      `${control} forces the skin itself instead of leaving it to setTheme`,
    );
  }
});

test('skinTone falls back to dark for an unknown skin rather than throwing', () => {
  assert.equal(skinTone('not-a-skin' as never), 'dark');
});

test('both tones are actually offered', () => {
  const tones = new Set(TERMINAL_SKINS.map((skin) => skin.tone));
  assert.equal(tones.has('dark'), true);
  assert.equal(tones.has('light'), true);
});
