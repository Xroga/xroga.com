import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';

import {
  buildUserCacheScopeScript,
  USER_CACHE_OWNER_KEY,
  USER_CACHE_SCOPE_VERSION,
  USER_SCOPED_DATABASES,
} from './userScopedCache';
import {
  GUEST_AUTH_INTENT_KEY,
  GUEST_MIGRATION_MARKER_KEY,
  GUEST_WORKSPACE_SNAPSHOT_KEY,
} from './guestWorkspace';

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


test('migrates a fresh guest transcript into the authenticated workspace once', () => {
  const now = Date.now();
  const guestSession = {
    prompt: 'Plan my marketplace',
    messages: [
      { id: 'u1', role: 'user', content: 'Plan my marketplace', createdAt: now },
      { id: 'a1', role: 'assistant', content: 'Start with listings and checkout.', createdAt: now },
    ],
    sessionId: 'guest-terminal',
    updatedAt: new Date(now).toISOString(),
  };
  const guestSnapshot = JSON.stringify({
    version: 1,
    guestSessionId: '33333333-3333-4333-8333-333333333333',
    updatedAt: new Date(now).toISOString(),
    workspaceSession: guestSession,
  });
  const local = storage({
    [USER_CACHE_OWNER_KEY]: `${USER_CACHE_SCOPE_VERSION}:guest`,
    [GUEST_WORKSPACE_SNAPSHOT_KEY]: guestSnapshot,
    [GUEST_AUTH_INTENT_KEY]: JSON.stringify({
      version: 1,
      guestSessionId: '33333333-3333-4333-8333-333333333333',
      reason: 'build',
      createdAt: new Date(now).toISOString(),
    }),
    xroga_workspace_session: JSON.stringify(guestSession),
  });
  const session = storage();
  const deletedDatabases: string[] = [];

  vm.runInNewContext(buildUserCacheScopeScript('signed-in-user'), {
    localStorage: local,
    sessionStorage: session,
    indexedDB: { deleteDatabase: (name: string) => deletedDatabases.push(name) },
  });

  assert.equal(
    local.getItem(USER_CACHE_OWNER_KEY),
    `${USER_CACHE_SCOPE_VERSION}:signed-in-user`,
  );
  assert.equal(local.getItem(GUEST_WORKSPACE_SNAPSHOT_KEY), null);
  assert.deepEqual(
    JSON.parse(local.getItem('xroga_workspace_session') || '{}'),
    guestSession,
  );
  assert.equal(local.getItem(GUEST_AUTH_INTENT_KEY), null);
  assert.deepEqual(
    JSON.parse(local.getItem(GUEST_MIGRATION_MARKER_KEY) || '{}'),
    {
      version: 1,
      guestSessionId: '33333333-3333-4333-8333-333333333333',
      reason: 'build',
      restoredWorkspace: true,
      migratedAt: JSON.parse(local.getItem(GUEST_MIGRATION_MARKER_KEY) || '{}').migratedAt,
    },
  );
  assert.deepEqual(deletedDatabases, [...USER_SCOPED_DATABASES]);
});

test('preserves a guest auth intent even when there is no transcript to restore', () => {
  const now = Date.now();
  const local = storage({
    [USER_CACHE_OWNER_KEY]: `${USER_CACHE_SCOPE_VERSION}:guest`,
    [GUEST_AUTH_INTENT_KEY]: JSON.stringify({
      version: 1,
      guestSessionId: '44444444-4444-4444-8444-444444444444',
      reason: 'integration',
      createdAt: new Date(now).toISOString(),
    }),
  });
  const session = storage();

  vm.runInNewContext(buildUserCacheScopeScript('signed-in-user'), {
    localStorage: local,
    sessionStorage: session,
    indexedDB: { deleteDatabase: () => undefined },
  });

  const marker = JSON.parse(local.getItem(GUEST_MIGRATION_MARKER_KEY) || '{}');
  assert.equal(marker.guestSessionId, '44444444-4444-4444-8444-444444444444');
  assert.equal(marker.reason, 'integration');
  assert.equal(marker.restoredWorkspace, false);
});
