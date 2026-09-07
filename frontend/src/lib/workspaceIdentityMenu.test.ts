import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const MENU = read('../components/terminal/WorkspaceIdentityMenu.tsx');
const DASHBOARD = read('../components/dashboard/DashboardView.tsx');

test('every workspace identity action has a real handler', () => {
  assert.match(MENU, /onClick=\{togglePinned\}/);
  assert.match(MENU, /onClick=\{archiveWorkspace\}/);
  assert.match(MENU, /void shareWorkspace\(\)/);
  assert.match(MENU, /void copyWorkspace\(\)/);
  assert.match(MENU, /window\.open\('\/workspace\?new=1'/);
  assert.match(MENU, /void forkWorkspace\(\)/);
  assert.match(MENU, /window\.open\('\/workspace', 'xroga-workspace'/);
});

test('new side chat opens a genuinely fresh terminal instead of restoring the old one', () => {
  assert.match(DASHBOARD, /url\.searchParams\.get\('new'\) !== '1'/);
  assert.match(DASHBOARD, /markFreshTerminalIntent\(\)/);
  assert.match(DASHBOARD, /startNewChat\(\)/);
  assert.match(DASHBOARD, /url\.searchParams\.delete\('new'\)/);
});
