import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sidebar = readFileSync(new URL('../components/layout/Sidebar.tsx', import.meta.url), 'utf8');
const store = readFileSync(new URL('../store/useProjectWorkspaceStore.ts', import.meta.url), 'utf8');

test('logout clears in-memory project state and pauses persistence before storage deletion', () => {
  const handler = sidebar.slice(sidebar.indexOf('async function handleLogout()'), sidebar.indexOf('const logoHref'));
  const pause = handler.indexOf('suspendProjectWorkspacePersistence()');
  const reset = handler.indexOf('resetForAccountBoundary()');
  const clear = handler.indexOf('persist.clearStorage()');
  const signOut = handler.indexOf('auth.signOut()');
  assert.ok(pause >= 0 && reset > pause && clear > reset && signOut > clear);
});

test('account-boundary reset discards every saved context and task association', () => {
  const reset = store.slice(store.indexOf('resetForAccountBoundary: () => set'), store.indexOf("}, { name: 'xroga-project-workspace'"));
  assert.match(reset, /activeProjectContext: null/);
  assert.match(reset, /activeTaskSessionId: null/);
  assert.match(reset, /activeTaskSessionByProject: \{\}/);
  assert.match(reset, /projectStates: \{\}/);
});
