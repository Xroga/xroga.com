import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import {
  COMPANION_COSTUMES,
  DEFAULT_COMPANION_PREFERENCES,
  RETIRED_COMPANION_COSTUMES,
  resolveCostume,
} from './companion';

test('there are exactly four companion skins', () => {
  assert.equal(COMPANION_COSTUMES.length, 4);
  assert.equal(new Set(COMPANION_COSTUMES).size, 4);
});

test('the retired coder skin is not selectable and is not the default', () => {
  // It was the original default, which is what makes it the value most accounts
  // still have stored — so it has to be unreachable here and recoverable below.
  assert.ok(!(COMPANION_COSTUMES as readonly string[]).includes('coder'));
  assert.notEqual(DEFAULT_COMPANION_PREFERENCES.costume, 'coder');
  assert.ok((COMPANION_COSTUMES as readonly string[]).includes(DEFAULT_COMPANION_PREFERENCES.costume));
});

test('a stored coder preference resolves to a skin that exists', () => {
  // Without this the value reaches an <img> src for artwork that was deleted.
  assert.equal(resolveCostume('coder'), DEFAULT_COMPANION_PREFERENCES.costume);
  assert.equal(resolveCostume(undefined), DEFAULT_COMPANION_PREFERENCES.costume);
  assert.equal(resolveCostume('not-a-costume'), DEFAULT_COMPANION_PREFERENCES.costume);
  // A real one is passed through untouched.
  for (const id of COMPANION_COSTUMES) assert.equal(resolveCostume(id), id);
});

test('every retired skin is named, and none is still selectable', () => {
  assert.ok(RETIRED_COMPANION_COSTUMES.includes('coder'));
  for (const retired of RETIRED_COMPANION_COSTUMES) {
    assert.ok(
      !(COMPANION_COSTUMES as readonly string[]).includes(retired),
      `${retired} is retired but still offered`,
    );
  }
});

test('the persisted store migrates a saved coder preference', () => {
  // zustand only calls `migrate` when the stored version differs from the declared
  // one. Retiring a costume without bumping the version means every existing browser
  // rehydrates its saved `coder` untouched and the migration never runs for the only
  // people who need it — so the version and the resolver are one guard, not two.
  const store = readFileSync(new URL('../store/useCompanionStore.ts', import.meta.url), 'utf8');
  const version = /version:\s*(\d+)/.exec(store)?.[1];
  assert.ok(version && Number(version) >= 5, `store version is ${version}; retiring a skin must bump it`);
  assert.match(store, /costume:\s*resolveCostume\(current\.costume\)/, 'migrate must resolve the costume');
  // The server profile is the other way a retired costume gets in.
  assert.match(store, /result\.costume = resolveCostume\(result\.costume\)/, 'server preferences must resolve too');
});

test('the wardrobe offers exactly the skins that have artwork', () => {
  // The picker and the asset folder drift apart silently: a leftover entry shows
  // a broken tile, and deleted art shows nothing at all until someone selects it.
  const customizer = readFileSync(
    new URL('../components/companion/CompanionCustomizer.tsx', import.meta.url),
    'utf8',
  );
  // Scoped to the COSTUMES array: the file also declares a GROUPS array whose tab
  // entries have the same `{ id: '...' }` shape and would otherwise be counted.
  const start = customizer.indexOf('const COSTUMES');
  assert.notEqual(start, -1, 'the wardrobe list has been renamed');
  const list = customizer.slice(start, customizer.indexOf('];', start));
  const offered = [...list.matchAll(/\{ id: '([a-z-]+)'/g)].map((m) => m[1]);
  assert.deepEqual([...offered].sort(), [...COMPANION_COSTUMES].sort());

  const assets = new URL('../../public/brand/costumes/', import.meta.url);
  for (const id of COMPANION_COSTUMES) {
    assert.ok(existsSync(new URL(`${id}.webp`, assets)), `${id}.webp is missing`);
  }
  for (const retired of RETIRED_COMPANION_COSTUMES) {
    assert.ok(
      !existsSync(new URL(`${retired}.webp`, assets)),
      `${retired}.webp should have been deleted with the skin`,
    );
  }
});

test('voice and care gamification are disabled by default', () => {
  assert.equal(DEFAULT_COMPANION_PREFERENCES.voiceEnabled, false);
  assert.equal(DEFAULT_COMPANION_PREFERENCES.careEnabled, false);
  assert.equal(DEFAULT_COMPANION_PREFERENCES.reducedGamification, true);
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
