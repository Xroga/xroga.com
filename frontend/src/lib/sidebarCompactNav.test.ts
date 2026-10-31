import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const NAV = read('../components/layout/Sidebar.tsx');
const FLYOUT = read('../components/ui/SidebarHoverMenu.tsx');
const CSS = read('../styles/uiverse.css');
const STORE = read('../store/useThemeStore.ts');
const LAUNCHER = read('../components/terminal/WorkspaceLauncher.tsx');
const NOTIFICATIONS = read('../components/notifications/SidebarNotificationCenter.tsx');

test('primary navigation retains the requested order and does not duplicate old groups', () => {
  const table = NAV.slice(NAV.indexOf('const navItems: NavEntry[] = ['), NAV.indexOf('interface SidebarProps'));
  const markers = ["label: 'Dashboard'", "id: 'automations'", "label: 'AI Employees'", "label: 'Plugins'",
    "id: 'library'", "label: 'Publish'", "id: 'more'"];
  let last = -1;
  for (const marker of markers) {
    const pos = table.indexOf(marker);
    assert.ok(pos > last, marker + ' is missing or out of order');
    last = pos;
  }
  assert.doesNotMatch(table, /id: 'launch'|id: 'explore'/);
  assert.doesNotMatch(table, /href: '\/os-preview'/);
  assert.doesNotMatch(table, /label: 'Workspace'|label: 'Projects'/);
  assert.match(NAV, /<SidebarProjectHistory expanded=\{navExpanded\}/);
});
test('planned capabilities stay clickable as informative sections', () => {
  assert.doesNotMatch(NAV, /aria-disabled="true"/);
  assert.doesNotMatch(NAV, /href: '#'/);
  assert.match(NAV, /href: '\/dashboard\/automations#workflows'/);
  assert.match(NAV, /href: DRIVE_ENABLED \? '\/drive' : '\/dashboard\/library#xroga-drive'/);
  assert.match(NAV, /planned: !DRIVE_ENABLED/);
  assert.match(NAV, /href: '\/showcase', label: 'Templates'/);
  for (const label of ['Workflows', 'Scheduled Tasks', 'AI Employees', 'Work Packs', 'Run History',
    'My Files', 'Artifacts', 'Skills', 'Xroga Drive']) {
    assert.match(NAV, new RegExp("label: '" + label + "'"));
  }
  assert.match(NAV, /LucideWorkflowIcon/);
  assert.match(NAV, /LucideFoldersIcon/);
  assert.doesNotMatch(NAV, /ChevronDown/);
});

test('compact width preserves stored preferences and popover accessibility', () => {
  assert.match(STORE, /SIDEBAR_DEFAULT_WIDTH = 216/);
  assert.match(STORE, /typeof state\.sidebarWidth === 'number'/);
  assert.match(CSS, /xv-sidebar-nav-v2/);
  assert.match(CSS, /min-height: 44px/);
  assert.match(FLYOUT, /window\.addEventListener\('scroll', placeMenu, true\)/);
  assert.match(FLYOUT, /onMouseLeave=\{scheduleClose\}/);
  assert.match(FLYOUT, /onFocusIn/);
  assert.match(FLYOUT, /event\.key === 'Escape'/);
  assert.match(FLYOUT, /requestAnimationFrame/);
});

test('utility controls retain accessible names without the retired global tooltip host', () => {
  const utilities = NAV.slice(NAV.indexOf('className="xv-sidebar-utilities"'), NAV.indexOf('className="xv-sidebar-collapsed-actions"'));
  assert.match(utilities, /<ThemeToggle \/>/);
  assert.match(utilities, /aria-label="Notifications"/);
  assert.match(utilities, /aria-label="Close sidebar"/);
  assert.doesNotMatch(read('../components/layout/AppShell.tsx'), /CompactAppTooltip/);
  assert.match(NAV, /className="xv-sidebar-utilities" aria-label="Sidebar utilities"/);
  assert.match(read('../components/terminal/WorkspaceSearchButton.tsx'), /aria-label="Search workspace"/);
  assert.match(NAV, /<SidebarNotificationButton/);
  assert.match(LAUNCHER, /data-short-tip=\{chatbarHidden \? 'Show chatbar' : 'Hide chatbar'\}/);
  assert.doesNotMatch(NOTIFICATIONS, /title="Notifications"/);
});

test('Drive shortcut bypasses only collapsed-rail expansion and keeps destination authorization', () => {
  assert.match(NAV, /href="\/drive" data-drive-shortcut/);
  assert.ok(NAV.includes("event.target.closest('[data-drive-shortcut]')"));
  assert.match(NAV, /handleNavEntryClick\(event, '\/drive'\)/);
});
