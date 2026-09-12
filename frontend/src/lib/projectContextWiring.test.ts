import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const STORE = read('../store/useProjectWorkspaceStore.ts');
const REPO = read('./repoContext.ts');
const CHAT = read('../context/TerminalChatContext.tsx');
const HISTORY = read('./terminalHistory.ts');
const SIDEBAR = read('../components/layout/SidebarProjectHistory.tsx');
const HEADER = read('../components/terminal/WorkspaceIdentityMenu.tsx');
const REPO_BAR = read('../components/terminal/RepoContextBar.tsx');

test('one activation operation owns repository selection and compatibility writes delegate to it', () => {
  assert.match(REPO, /export function activateProjectContext/);
  assert.match(REPO, /getState\(\)\.activateProjectContext\(ctx\)/);
  assert.match(REPO, /saveSelectedRepoContext = activateProjectContext/);
  assert.match(STORE, /activeProjectContextKey/);
  assert.match(STORE, /projectStates: Record<string, ProjectWorkspaceSnapshot>/);
  assert.match(STORE, /activeTaskSessionByProject: Record<string, string \| null>/);
});

test('canonical project activation clears stale fresh-product intent', () => {
  assert.match(REPO, /function activateProjectContext/);
  const activation = REPO.slice(
    REPO.indexOf('export function activateProjectContext'),
    REPO.indexOf('/** @deprecated Compatibility adapter'),
  );
  assert.match(activation, /sessionStorage\.removeItem\(FRESH_TERMINAL_KEY\)/);
});

test('header, sidebar and task history bind to the canonical project identity', () => {
  assert.match(HEADER, /state\.activeProjectContext/);
  assert.doesNotMatch(HEADER, /loadTerminalHistory|getSelectedRepoContext/);
  assert.match(SIDEBAR, /projectContextKey\(\{ repo, branch, projectRoot \}\)/);
  assert.match(HISTORY, /projectContextKey\?: string/);
  assert.match(HISTORY, /existing\?\.projectContextKey/);
  assert.match(CHAT, /setActiveTaskSession\(sessionIdRef\.current, activeProjectContextKey\)/);
});

test('outgoing write metadata is asserted against the visible canonical context', () => {
  assert.match(CHAT, /assertActiveProjectTarget\(\{/);
  assert.match(CHAT, /githubTargetRepo: stickyTargetRepo/);
  assert.match(CHAT, /githubTargetBranch: stickyTargetBranch/);
  assert.match(CHAT, /projectRoot: activeBuildContext\?\.projectRoot \|\| '\/'/);
});

test('same-context activation is a no-op and async restoration is version guarded', () => {
  assert.match(STORE, /if \(!result\.changed\) return/);
  assert.match(STORE, /isCurrentProjectTransition/);
  assert.match(STORE, /completeProjectContextRestore/);
  assert.match(STORE, /current\.transitionVersion > 0/);
});

test('passive repository refresh cannot reset the canonical branch', () => {
  assert.match(REPO_BAR, /const canonical = getSelectedRepoContext\(\)/);
  assert.match(REPO_BAR, /const fallback = preferred\?\.trim\(\) \|\| 'main'/);
  assert.match(REPO_BAR, /setSelectedBranch\(fallback\)/);
  assert.match(REPO_BAR, /return fallback/);
  const passiveRefresh = REPO_BAR.slice(
    REPO_BAR.indexOf('const canonical = getSelectedRepoContext()'),
    REPO_BAR.indexOf('} else if (freshTerminal)'),
  );
  assert.equal(
    [...passiveRefresh.matchAll(/saveSelectedRepoContext/g)].length,
    2,
    'the passive refresh has only the initial and validated bootstrap writes',
  );
  assert.equal(
    [...passiveRefresh.matchAll(/if \(!canonical\) saveSelectedRepoContext/g)].length,
    2,
    'both bootstrap writes must be guarded when a canonical context already exists',
  );
});
