import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./projectWorkspaceStorage.ts', import.meta.url), 'utf8');

test('persisted project context is stamped with and checked against the active account owner', () => {
  assert.match(source, /PERSISTED_OWNER_FIELD = '__xrogaCacheOwner'/);
  assert.match(source, /parsed\[PERSISTED_OWNER_FIELD\] === owner \? value : null/);
  assert.match(source, /JSON\.stringify\(\{ \.\.\.parsed, \[PERSISTED_OWNER_FIELD\]: owner \}\)/);
});

test('unowned legacy project context cannot hydrate into an authenticated account', () => {
  assert.match(source, /if \(!owner\) return null/);
  assert.match(source, /const ownedLegacy = valueForCurrentOwner\(legacy\)/);
  assert.doesNotMatch(source, /return legacy;/);
});
