import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const sidebar = read('../components/layout/Sidebar.tsx');
const history = read('../components/layout/SidebarProjectHistory.tsx');
const chatbar = read('../components/terminal/TerminalChatBar.tsx');
const model = read('../components/terminal/BlackHoleVButton.tsx');
const css = read('../app/globals.css');

test('the sidebar keeps its Automations flyout and separate AI Employees entry', () => {
  assert.match(sidebar, /id: 'automations'/);
  assert.match(sidebar, /\['Automations', 'Browser Automations'\]/);
  assert.match(sidebar, /href: '\/dashboard\/automations#ai-employees'.*label: 'AI Employees'/);
  assert.match(sidebar, /<SidebarHoverMenu/);
});

test('pinned and recent conversations render from the real history records', () => {
  assert.match(history, /aria-label="Pinned items"/);
  assert.match(history, /aria-label="Recent conversations outside projects"/);
  assert.match(history, /pinnedItems\.slice\(0,shownPins\)/);
  assert.match(history, /standaloneRecents\.slice\(0,shownRecents\)/);
});

test('composer menus expose real files, apps, skills, tools and agents', () => {
  assert.match(chatbar, /key: 'files'.*label: 'Files and folders'/);
  assert.match(chatbar, /key: 'plugins'.*label: 'Connected apps'/);
  assert.match(chatbar, /group: 'Skills'/);
  assert.match(chatbar, /group: 'Tools'/);
  assert.match(chatbar, /group: 'Agents'/);
  assert.match(chatbar, /toggleSkill\(key\.slice\(6\)\)/);
});

test('conversation content stays clear of the composer and model usage is fetched, not invented', () => {
  // Current production preserves scroll clearance without clipping the response
  // around the floating composer. Keep the real usage assertions unchanged.
  assert.doesNotMatch(css, /\.xv-terminal-scroll\[data-conversation='true'\]\s*\{[^}]*clip-path:/s);
  assert.match(css, /\.xv-terminal-scroll\s*\{[^}]*padding-bottom:\s*calc\(var\(--xv-chatbar-height/s);
  assert.match(css, /data-workspace-state='conversation'\][^}]*background:\s*transparent !important/s);
  assert.match(model, /api\.billing\.entitlement\(\)/);
  assert.match(model, /role="progressbar"/);
});
