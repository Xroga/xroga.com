import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const history = read('../components/layout/SidebarProjectHistory.tsx');
const style = read('../components/layout/SidebarOrganize.css');
const globalCss = read('../app/globals.css');
const shell = read('../components/layout/AppShell.tsx');
const sidebar = read('../components/layout/Sidebar.tsx');

test('project, pinned and recent labels fade instead of ellipsis and scroll on hover', () => {
  assert.match(history, /<SidebarMovingTitle text=\{label\}\/>/);
  assert.match(style, /text-overflow:clip/);
  assert.match(style, /mask-image: linear-gradient\(to right/);
  assert.match(style, /xv-sidebar-work-row:is\(:hover,:focus-within\)/);
  assert.match(style, /width:16px/);
  assert.match(globalCss, /padding-right: 2px !important/);
});
test('workspace tabs and composer keep a stable canvas offset as sidebar resizes', () => {
  assert.match(shell, /workspaceCanvasAnchor/);
  assert.match(shell, /isDashboard && 'xv-workspace-resize-stable'/);
  assert.match(globalCss, /\.xv-workspace-resize-stable > \.xv-sidebar-root/);
  assert.match(globalCss, /padding-inline-start:var\(--xv-workspace-canvas-offset\)/);
});
test('profile footer has the real name, plan and square-rounded profile photo', () => {
  assert.match(sidebar, /profile\?\.display_name\?\.trim\(\)/);
  assert.match(sidebar, /routeName.toLowerCase\(\) !== emailLocalPart/);
  assert.match(sidebar, /const planName = useAppStore/);
  assert.match(sidebar, /className="rounded-\[10px\]"/);
  assert.match(sidebar, /xv-sidebar-profile-plan" title=\{userPlan\}/);
});
