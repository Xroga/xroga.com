import assert from 'node:assert/strict';
import test from 'node:test';
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
 * Automatic mode resolves to dark on every theme. This is the guard on the change
 * that pinned the terminal: a light page must not silently produce a light terminal,
 * because that is what made ANSI output differ between users. A light skin is
 * reachable only by choosing it.
 */
test('automatic mode stays dark on every theme', () => {
  for (const theme of ['white', 'beige', 'gray', 'black']) {
    const resolved = skinForTheme(theme);
    assert.equal(skinTone(resolved), 'dark', `${theme} resolved to a light terminal`);
  }
  for (const skin of Object.values(DEFAULT_TERMINAL_SKIN)) {
    assert.equal(isTerminalSkin(skin), true);
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
