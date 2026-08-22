import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import {
  buildUserCacheScopeScript,
  USER_CACHE_OWNER_KEY,
  USER_CACHE_SCOPE_VERSION,
  USER_SCOPED_DATABASES,
} from './userScopedCache';

function storage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    values,
  };
}

function runBootstrap(owner: string | null) {
  const local = storage({
    ...(owner ? { [USER_CACHE_OWNER_KEY]: owner } : {}),
    xroga_terminal_history: 'previous-user-terminal',
  });
  const session = storage({ xroga_pending_prompt: 'previous-user-prompt' });
  const deletedDatabases: string[] = [];

  vm.runInNewContext(buildUserCacheScopeScript('fresh-user'), {
    localStorage: local,
    sessionStorage: session,
    indexedDB: { deleteDatabase: (name: string) => deletedDatabases.push(name) },
  });

  return { local, session, deletedDatabases };
}

test('clears legacy unowned workspace data before assigning a fresh account', () => {
  const result = runBootstrap(null);

  assert.equal(result.local.getItem('xroga_terminal_history'), null);
  assert.equal(result.session.getItem('xroga_pending_prompt'), null);
  assert.equal(result.local.getItem(USER_CACHE_OWNER_KEY), `${USER_CACHE_SCOPE_VERSION}:fresh-user`);
  assert.deepEqual(result.deletedDatabases, [...USER_SCOPED_DATABASES]);
});

test('clears workspace data when the authenticated account changes', () => {
  const result = runBootstrap('previous-user');

  assert.equal(result.local.getItem('xroga_terminal_history'), null);
  assert.equal(result.session.getItem('xroga_pending_prompt'), null);
  assert.equal(result.local.getItem(USER_CACHE_OWNER_KEY), `${USER_CACHE_SCOPE_VERSION}:fresh-user`);
  assert.deepEqual(result.deletedDatabases, [...USER_SCOPED_DATABASES]);
});

test('migrates a legacy owner marker that may already have claimed stale data', () => {
  const result = runBootstrap('fresh-user');

  assert.equal(result.local.getItem('xroga_terminal_history'), null);
  assert.equal(result.session.getItem('xroga_pending_prompt'), null);
  assert.equal(result.local.getItem(USER_CACHE_OWNER_KEY), `${USER_CACHE_SCOPE_VERSION}:fresh-user`);
  assert.deepEqual(result.deletedDatabases, [...USER_SCOPED_DATABASES]);
});

test('preserves workspace data for the same authenticated account', () => {
  const result = runBootstrap(`${USER_CACHE_SCOPE_VERSION}:fresh-user`);

  assert.equal(result.local.getItem('xroga_terminal_history'), 'previous-user-terminal');
  assert.equal(result.session.getItem('xroga_pending_prompt'), 'previous-user-prompt');
  assert.equal(result.local.getItem(USER_CACHE_OWNER_KEY), `${USER_CACHE_SCOPE_VERSION}:fresh-user`);
  assert.deepEqual(result.deletedDatabases, []);
});
