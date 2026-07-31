import assert from 'node:assert/strict';
import test from 'node:test';
import { COMPANION_COSTUMES, DEFAULT_COMPANION_PREFERENCES } from './companion';

test('there are exactly five companion skins', () => {
  assert.equal(COMPANION_COSTUMES.length, 5);
  assert.equal(new Set(COMPANION_COSTUMES).size, 5);
});

test('the original coder skin is first and remains the default', () => {
  assert.equal(COMPANION_COSTUMES[0], 'coder');
  assert.equal(DEFAULT_COMPANION_PREFERENCES.costume, 'coder');
});

test('every skin id maps to a file-safe asset name', () => {
  for (const id of COMPANION_COSTUMES) {
    assert.match(id, /^[a-z]+(-[a-z]+)*$/, id);
  }
});

test('the removed skins are gone, so no stale preference can resolve', () => {
  for (const old of ['guardian', 'exec', 'scout', 'builder', 'mystic', 'pilot', 'shadow']) {
    assert.ok(!(COMPANION_COSTUMES as readonly string[]).includes(old), `${old} should be removed`);
  }
});
