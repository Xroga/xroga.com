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
  assert.match(history, /aria-label="Recent conversations"/);
  assert.match(history, /pinnedItems\.slice\(0,shownPins\)/);
  assert.match(history, /recentConversations\.slice\(0,shownRecents\)/);
});

test('composer menus expose real files, apps, skills, tools and agents', () => {
  assert.match(chatbar, /key: 'files'.*label: 'Files and folders'/);
  assert.match(chatbar, /key: 'plugins'.*label: 'Connected apps'/);
  assert.match(chatbar, /group: 'Skills'/);
  assert.match(chatbar, /group: 'Tools'/);
  assert.match(chatbar, /group: 'Agents'/);
  assert.match(chatbar, /toggleSkill\(key\.slice\(6\)\)/);
});

test('active dock is opaque and model usage is fetched, not invented', () => {
  assert.match(css, /data-workspace-state='conversation'\] \{\s*background:var\(--terminal-ui-surface,var\(--background\)\) !important/);
  assert.match(model, /api\.billing\.entitlement\(\)/);
  assert.match(model, /role="progressbar"/);
});
