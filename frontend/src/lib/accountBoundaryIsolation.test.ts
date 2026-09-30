import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sidebar = readFileSync(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8');
const store = readFileSync(new URL('../store/useProjectWorkspaceStore.ts', import.meta.url), 'utf8');
const projectStorage = readFileSync(new URL('./projectWorkspaceStorage.ts', import.meta.url), 'utf8');

test('logout clears in-memory project state and pauses persistence before storage deletion', () => {
  const handler = sidebar.slice(sidebar.indexOf('async function handleLogout()'), sidebar.indexOf('const logoHref'));
  const pause = handler.indexOf('suspendProjectWorkspacePersistence()');
  const reset = handler.indexOf('resetForAccountBoundary()');
  const clear = handler.indexOf('persist.clearStorage()');
  const signOut = handler.indexOf('auth.signOut()');
  assert.ok(pause >= 0 && reset > pause && clear > reset && signOut > clear);
});

test('account-boundary reset discards every saved context and task association', () => {
  const start = store.indexOf('resetForAccountBoundary:');
  const end = store.indexOf("name:", start);
  const reset = store.slice(start, end);
  assert.ok(start >= 0 && end > start, 'account-boundary reset could not be located');
  assert.match(reset, /activeProjectContext:\s*null/);
  assert.match(reset, /activeProjectContextKey:\s*null/);
  assert.match(reset, /activeTaskSessionId:\s*null/);
  assert.match(reset, /activeTaskSessionByProject:\s*\{\s*\}/);
  assert.match(reset, /projectStates:\s*\{\s*\}/);
});

test('project persistence refuses another account owner even if IndexedDB deletion races hydration', () => {
  assert.match(projectStorage, /__xrogaCacheOwner/);
  assert.match(projectStorage, /valueForCurrentOwner\(stored\)/);
  assert.match(projectStorage, /stampCurrentOwner\(value\)/);
});
