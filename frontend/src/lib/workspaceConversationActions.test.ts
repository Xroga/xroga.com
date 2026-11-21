import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const menu = read('../components/terminal/WorkspaceConversationMenu.tsx');
const css = read('../components/terminal/WorkspaceConversationMenu.module.css');
const context = read('../context/TerminalChatContext.tsx');
const sidebar = read('../components/layout/SidebarProjectHistory.tsx');

test('workspace title dropdown directly exposes real conversation actions', () => {
  assert.match(menu, /ariaLabel="Conversation actions"/);
  assert.match(menu, /className=\{styles\.actionList\}/);
  assert.match(menu, /beginEditor\('rename'\)/);
  assert.match(menu, /beginEditor\('project'\)/);
  assert.match(menu, /beginEditor\('archive'\)/);
  assert.match(menu, /beginEditor\('delete'\)/);
  assert.doesNotMatch(menu, /role="tablist"|Search recent chats|setTab\(/);
  assert.doesNotMatch(menu, /New chat<\/button>|Move to section|move-section/);
});

test('workspace actions reuse the existing organizing and management handlers', () => {
  for (const label of ['Rename', 'Unpin', 'Pin', 'Move to project', 'Archive', 'Delete']) {
    assert.ok(menu.includes(label), `Missing action: ${label}`);
  }
  assert.doesNotMatch(menu, /shareLink\(|navigator\.share\(|Copy link|Share private link/);
  assert.match(menu, /styles\.primaryActionRow/);
  assert.match(menu, /changeSidebarMeta\(accountId, 'conversation', sessionId, changes\)/);
  assert.match(menu, /loadSidebarProjects\(accountId, 0, 100\)/);
  assert.match(menu, /deleteSidebarChat\(accountId, sessionId\)/);
  assert.match(menu, /api\.terminalSessions\.delete\(sessionId\)/);
  assert.match(menu, /deleteSidebarMeta\(accountId, 'conversation', sessionId\)/);
});

test('destructive actions require confirmation, authorization, and do not restore a deleted thread', () => {
  assert.match(menu, /!accountId \|\| !canManage \|\| !currentEntry/);
  assert.match(menu, /editor === 'delete'/);
  assert.match(menu, /'Delete permanently'/);
  assert.match(menu, /discardCurrentChat\(\)/);
  assert.match(menu, /removeTerminalHistoryEntry\(sessionId\)/);
  assert.match(context, /discardCurrentChat: \(\) => void;/);
  assert.match(context, /if \(!discard && !usePrivacyStore\.getState\(\)\.incognito && messages\.length > 0\)/);
  assert.match(context, /discardNextNewChatRef\.current = true;/);
});

test('the sidebar itself remains untouched and workspace actions are compact and accessible', () => {
  assert.match(sidebar, /<SidebarActionMenu/);
  assert.match(sidebar, /'move-section' as const/);
  assert.match(css, /\.actionList\s*\{/);
  assert.match(css, /\.actionDivider\s*\{/);
  assert.match(css, /\.inlineEditor\s*\{/);
  assert.match(css, /\.dangerButton\s*\{/);
  assert.match(css, /\.actionList \.subAction:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
