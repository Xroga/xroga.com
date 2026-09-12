import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertProjectTarget, isCurrentProjectTransition, normalizeProjectContext, projectContextForRequest, projectContextKey, transitionProjectState } from './projectContext';

type State = { name: string; files: string[]; deployUrl: string | null; commit: string | null; undo: string | null; preview: string | null; loads: number };
const clean = (): State => ({ name: '', files: [], deployUrl: null, commit: null, undo: null, preview: null, loads: 0 });
const target = (repo: string, branch: string, projectRoot = '/') => ({ repo, branch, projectRoot });

test('normalizes arbitrary repository, branch and future monorepo root into one stable key', () => {
  const raw = target('  Acme-Labs/strange.repo_42  ', '/feature/mobile-shell/', '\\packages\\native\\');
  assert.deepEqual(normalizeProjectContext(raw), target('Acme-Labs/strange.repo_42', 'feature/mobile-shell', '/packages/native'));
  assert.equal(projectContextKey(raw), projectContextKey(target('acme-labs/strange.repo_42', 'feature/mobile-shell', '/packages/native')));
});

test('A -> B -> C -> A restores only each project own files, deployment, commit, preview and undo', () => {
  let key: string | null = null; let state = clean(); let states: Record<string, State> = {}; let version = 0;
  const activate = (repo: string, branch: string) => {
    const result = transitionProjectState({ activeKey: key, activeState: state, states, version, target: target(repo, branch), createClean: clean });
    key = result.key; state = result.activeState; states = result.states; version = result.version;
  };
  activate('org-a/generated-one', 'release/a'); state = { name: 'A', files: ['a.go'], deployUrl: 'https://a.invalid', commit: 'aaa', undo: 'a-checkpoint', preview: 'A', loads: 1 };
  activate('org-b/generated-two', 'work/b');
  assert.deepEqual(state, clean(), 'fresh B must not expose A state');
  state = { name: 'B', files: ['b.rs'], deployUrl: null, commit: 'bbb', undo: null, preview: 'B', loads: 1 };
  activate('org-c/generated-three', 'topic/c'); assert.deepEqual(state, clean());
  state = { name: 'C', files: ['c.swift'], deployUrl: 'https://c.invalid', commit: 'ccc', undo: 'c-checkpoint', preview: 'C', loads: 1 };
  activate('org-a/generated-one', 'release/a');
  assert.deepEqual(state, { name: 'A', files: ['a.go'], deployUrl: 'https://a.invalid', commit: 'aaa', undo: 'a-checkpoint', preview: 'A', loads: 1 });
});

test('same project task changes do not transition or reload project state', () => {
  const identity = target('any-owner/any-library', 'not-main');
  const state = { ...clean(), files: ['lib.kt'], deployUrl: 'https://branch.invalid', undo: 'checkpoint', loads: 1 };
  const key = projectContextKey(identity);
  const result = transitionProjectState({ activeKey: key, activeState: state, states: { [key]: state }, version: 7, target: identity, createClean: clean });
  assert.equal(result.changed, false); assert.equal(result.version, 7); assert.strictEqual(result.activeState, state);
});

test('same repository branches and roots are isolated contexts', () => {
  const repo = 'random-user/polyglot-monorepo';
  assert.notEqual(projectContextKey(target(repo, 'alpha')), projectContextKey(target(repo, 'beta')));
  assert.notEqual(projectContextKey(target(repo, 'alpha', '/apps/one')), projectContextKey(target(repo, 'alpha', '/apps/two')));
});

test('late async restore cannot overwrite the newer active context', () => {
  const a = projectContextKey(target('race-owner/context-a', 'a'));
  const b = projectContextKey(target('race-owner/context-b', 'b'));
  assert.equal(isCurrentProjectTransition(b, 2, a, 1), false);
  assert.equal(isCurrentProjectTransition(b, 2, b, 2), true);
});

test('pipeline target assertion refuses a stale repository or branch', () => {
  const active = normalizeProjectContext(target('safe-owner/current-target', 'release/9'));
  assert.deepEqual(assertProjectTarget(active, active), active);
  assert.throws(() => assertProjectTarget(active, target('other-owner/other-target', 'release/9')), /no longer matches/);
  assert.throws(() => assertProjectTarget(active, target(active.repo, 'release/10')), /no longer matches/);
});

test('a fresh product request cannot inherit the previously active project target', () => {
  const active = target('arbitrary-owner/existing-system', 'release/not-main', '/apps/worker');
  assert.equal(projectContextForRequest(active, true), null);
  assert.deepEqual(projectContextForRequest(active, false), normalizeProjectContext(active));
});
