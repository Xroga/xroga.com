import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const view = read('../components/dashboard/DashboardView.tsx');
const menu = read('../components/terminal/WorkspaceConversationMenu.tsx');
const styles = read('../components/terminal/WorkspaceConversationMenu.module.css');

test('workspace header shows the active conversation title menu, preserving incognito and project identity', () => {
  const header = view.slice(view.indexOf('<header className="xv-workspace-header"'), view.indexOf('</header>'));
  assert.match(header, /<WorkspaceConversationMenu\s*\/>/);
  assert.match(header, /incognito\s*\?\s*\(/);
  assert.match(header, /<WorkspaceIdentityMenu incognito\s*\/>/);
  assert.match(header, /activeProject \? <WorkspaceIdentityMenu\s*\/> : null/);
  assert.doesNotMatch(header, /<SidebarProjectHistory/);
});

test('menu uses the active chat prompt rather than Black Hole as its title', () => {
  assert.match(menu, /messages\.find\(\(message\) => message\.role === 'user'\)/);
  assert.match(menu, /meaningfulSidebarTitle\(savedCurrentTitle, firstUserPrompt\)/);
  assert.match(menu, /Open recent chats/);
  assert.match(menu, /aria-expanded=\{open\}/);
});

test('recent chats come from real account-scoped cloud lists, with owner-checked restoration', () => {
  assert.match(menu, /status === 'authenticated' \? userId/);
  assert.match(menu, /loadSidebarChats\(accountId, 0, 60\)/);
  assert.match(menu, /listCloudTerminalSessions\(undefined, \{ limit: 80, offset: 0 \}\)/);
  assert.match(menu, /meta\.get\(chat\.id\)\?\.archived_at/);
  assert.match(menu, /loadSidebarChatById\(accountId, entry\.id\)/);
  assert.match(menu, /loadCloudTerminalSession\(entry\.id\)/);
  assert.match(menu, /await restoreTerminalSession\(/);
  assert.doesNotMatch(menu, /loadTerminalHistory\(|(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\(/);
});

test('dropdown supports accessible search, active item, mobile layout and escape/outside dismissal', () => {
  assert.match(menu, /type="search"/);
  assert.match(menu, /ariaLabel="Recent conversations"/);
  assert.match(menu, /entry\.id === sessionId/);
  assert.match(menu, /<AnchoredPortalPopover/);
  assert.match(styles, /text-overflow: ellipsis/);
  assert.match(styles, /@media \(max-width: 750px\)/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});
