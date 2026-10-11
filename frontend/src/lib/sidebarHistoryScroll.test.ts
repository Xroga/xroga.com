import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const NAV = read('../components/layout/Sidebar.tsx');
const SCROLLER = read('../components/layout/SidebarNavScroller.tsx');
const HISTORY = read('../components/layout/SidebarProjectHistory.tsx');
const GLOBAL = read('../app/globals.css');
const STYLES = read('../styles/uiverse.css');
const CAPABILITIES = read('../components/dashboard/UpcomingCapabilitySection.tsx');
const ROCKET = read('../components/icons/animated/RocketIcon.tsx');

test('a single native thumb scrolls all sidebar content, no arrow controls or nested 280px history scroller', () => {
  assert.match(NAV, /xv-sidebar-scroll-track/);
  assert.match(SCROLLER, /xv-nav-scroller/);
  assert.doesNotMatch(SCROLLER, /ChevronUp|ChevronDown|xv-nav-arrow|scrollBy/);
  assert.match(GLOBAL, /xv-sidebar-nav-scroll\.xv-sidebar-scroll-track::\-webkit-scrollbar-thumb/);
  assert.match(GLOBAL, /scrollbar-width: thin !important/);
  assert.doesNotMatch(HISTORY, /max-h-\[280px\]/);
  assert.match(GLOBAL, /xv-repos-scroll \{ overflow: visible !important; max-height: none !important/);
});

test('repository terminals precede pinned and recent conversations with account-scoped pins', () => {
  const repo = HISTORY.indexOf('Repositories');
  const pin = HISTORY.indexOf('aria-label="Pinned conversations"');
  const rec = HISTORY.indexOf('aria-label="Recent conversations"');
  assert.ok(repo !== -1 && repo < pin && pin < rec, 'sidebar history ordering');
  assert.match(HISTORY, /xroga_sidebar_pins_v1:/);
  assert.match(HISTORY, /workspaceIdentity\.userId/);
  assert.match(HISTORY, /aria-label=\{pinned \? 'Unpin conversation' : 'Pin conversation'\}/);
  assert.match(HISTORY, /savedConversations\.filter\(s => !pinnedIds\.includes\(s\.id\)\)/);
  assert.doesNotMatch(HISTORY, /foldersList = foldersList\.slice\(0, 12\)/);
  assert.match(HISTORY, /onClick=\{\(\) => void openSession\(session\)\}/);
});

test('sidebar font changes are scoped, with full-size touch targets on mobile', () => {
  assert.match(STYLES, /font-size: 11px; font-weight: 540/);
  assert.match(STYLES, /max-width: 1023px/);
  assert.match(STYLES, /min-height: 44px/);
});

test('coming-soon sections do not misleadingly promise an interactive preview', () => {
  assert.doesNotMatch(CAPABILITIES, /Preview this section/);
  assert.match(CAPABILITIES, /Coming soon/);
});

test('Publish rocket preserves user-provided floating and morphing-flame animation', () => {
  assert.match(NAV, /label: 'Publish'[\s\S]*?animated: RocketIcon/);
  assert.match(ROCKET, /const ROCKET_VARIANTS: Variants/);
  assert.match(ROCKET, /const FIRE_VARIANTS: Variants/);
  assert.match(ROCKET, /duration: 6/);
  assert.match(ROCKET, /repeat: Infinity/);
  assert.match(ROCKET, /useReducedMotion/);
  assert.match(ROCKET, /motion\/react-m/);
});
