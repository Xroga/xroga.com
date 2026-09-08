import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const MENU = read('../components/terminal/WorkspaceIdentityMenu.tsx');
const SWARM = read('../components/terminal/SwarmMessageLog.tsx');
const HELPER = read('./rollbackProjectUpdate.ts');
const API = read('./api.ts');
const ROUTE = read('../../../backend/src/routes/github.ts');
const DEPLOY = read('../../../backend/src/services/integrations/githubDeploy.ts');
const ATOMIC = read('../../../backend/src/services/integrations/githubAtomicWrite.ts');

test('project identity menu exposes only real project actions', () => {
  assert.match(MENU, /Undo last Xroga change/);
  assert.match(MENU, /Ask Xroga about this project/);
  assert.match(MENU, /Open on GitHub/);
  assert.match(MENU, /Open live site/);
  assert.match(MENU, /New task in this project/);
  assert.match(MENU, /Project settings/);
  assert.doesNotMatch(MENU, />Pin</);
  assert.doesNotMatch(MENU, />Share</);
  assert.doesNotMatch(MENU, />Copy link</);
  assert.doesNotMatch(MENU, />New side chat</);
  assert.doesNotMatch(MENU, />Fork</);
  assert.doesNotMatch(MENU, />Open in new window</);
});

test('Ask Xroga prepares the composer and does not auto-submit', () => {
  assert.match(MENU, /setPrompt\(PROJECT_REVIEW_PROMPT\)/);
  assert.doesNotMatch(MENU, /submit\(PROJECT_REVIEW_PROMPT/);
});

test('new task uses the existing repo-preserving chat primitive', () => {
  assert.match(MENU, /const newProjectTask = \(\) => \{[\s\S]*startNewChat\(\)/);
});

test('sync confidence comes from a real GitHub HEAD read', () => {
  assert.match(MENU, /api\.github\.repoState/);
  assert.match(API, /repoState:/);
  assert.match(ROUTE, /router\.get\('\/repo-state'/);
});

test('Undo is one shared implementation and is stale-head protected', () => {
  assert.match(HELPER, /expectedHeadSha/);
  assert.match(HELPER, /deletePaths/);
  assert.match(HELPER, /directWriteAuthorized: true/);
  assert.match(HELPER, /redeployPreview/);
  assert.match(SWARM, /rollbackProjectUpdate/);
  assert.doesNotMatch(SWARM, /userPrompt: 'Rollback last XROGA update'/);
  assert.match(ATOMIC, /expectedStartingHeadSha/);
  assert.match(DEPLOY, /expectedStartingHeadSha/);
  assert.match(ROUTE, /expectedHeadSha/);
});
