import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const NAV = read('../components/layout/Sidebar.tsx');
const FLYOUT = read('../components/ui/SidebarHoverMenu.tsx');
const CSS = read('../styles/uiverse.css');
const STORE = read('../store/useThemeStore.ts');

test('primary navigation retains the requested order and does not duplicate old groups', () => {
  const table = NAV.slice(NAV.indexOf('const navItems: NavEntry[] = ['), NAV.indexOf('interface SidebarProps'));
  const markers = ["label: 'Workspace'", "label: 'Dashboard'", "label: 'Projects'", "label: 'Plugins'",
    "id: 'automations'", "id: 'library'", "label: 'Publish'", "id: 'more'"];
  let last = -1;
  for (const marker of markers) {
    const pos = table.indexOf(marker);
    assert.ok(pos > last, marker + ' is missing or out of order');
    last = pos;
  }
  assert.doesNotMatch(table, /id: 'launch'|id: 'explore'/);
  assert.doesNotMatch(table, /href: '\/os-preview'/);
});
test('planned automation and Drive features are not navigable links', () => {
  assert.match(NAV, /if \(child\.planned\)/);
  assert.match(NAV, /role="menuitem" aria-disabled="true"/);
  for (const label of ['Workflows', 'Scheduled Tasks', 'AI Employees', 'Work Packs', 'Run History',
    'My Files', 'Artifacts', 'Skills', 'Xroga Drive']) {
    assert.match(NAV, new RegExp("label: '" + label + "'"));
  }
  assert.match(NAV, /href: '\/showcase', label: 'Templates'/);
});
test('compact width preserves stored preferences and popover accessibility', () => {
  assert.match(STORE, /SIDEBAR_DEFAULT_WIDTH = 232/);
  assert.match(STORE, /typeof state\.sidebarWidth === 'number'/);
  assert.match(CSS, /xv-sidebar-nav-v2/);
  assert.match(CSS, /min-height: 44px/);
  assert.match(FLYOUT, /window\.addEventListener\('scroll', placeMenu, true\)/);
  assert.match(FLYOUT, /onMouseLeave=\{scheduleClose\}/);
  assert.match(FLYOUT, /onFocusIn/);
  assert.match(FLYOUT, /event\.key === 'Escape'/);
  assert.match(FLYOUT, /requestAnimationFrame/);
});
