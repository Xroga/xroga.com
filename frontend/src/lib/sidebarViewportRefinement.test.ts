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
test('sidebar and workspace stay in the same responsive flex row when resizing', () => {
  assert.match(shell, /'flex terminal-layout overflow-x-hidden'/);
  assert.match(shell, /'xv-main-column flex-1 flex flex-col w-full min-w-0 max-w-full/);
  assert.match(shell, /style=\{\{ '--sidebar-width': widthPx \} as React.CSSProperties\}/);
  assert.doesNotMatch(shell, /workspaceCanvasAnchor|xv-workspace-resize-stable|canvasOffset/);
  assert.doesNotMatch(globalCss, /\.xv-workspace-resize-stable/);
  assert.match(sidebar, /'xv-sidebar-root relative hidden lg:block shrink-0'/);
  assert.match(sidebar, /'xv-sidebar-floating xv-sidebar-hover relative z-40 flex flex-col shrink-0 overflow-hidden transition-opacity/);
  assert.doesNotMatch(sidebar, /transition-\[width,opacity\]/);
  assert.match(globalCss, /body.xv-sidebar-resizing/);
});
test('profile footer has the real name, plan and square-rounded profile photo', () => {
  assert.match(sidebar, /profile\?\.display_name\?\.trim\(\)/);
  assert.match(sidebar, /routeName.toLowerCase\(\) !== emailLocalPart/);
  assert.match(sidebar, /const planName = useAppStore/);
  assert.match(sidebar, /className="rounded-\[10px\]"/);
  assert.match(sidebar, /xv-sidebar-profile-plan" title=\{userPlan\}/);
});
