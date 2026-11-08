import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const menu = read('../components/terminal/WorkspaceConversationMenu.tsx');
const css = read('../components/terminal/WorkspaceConversationMenu.module.css');
const context = read('../context/TerminalChatContext.tsx');
const sidebar = read('../components/layout/SidebarProjectHistory.tsx');

test('workspace title dropdown exposes compact Chats and Actions views, not a crowded flat action list', () => {
  assert.match(menu, /role="tablist" aria-label="Conversation menu views"/);
  assert.match(menu, /role="tab" aria-selected=\{tab === 'chats'\}/);
  assert.match(menu, /role="tab" aria-selected=\{tab === 'actions'\}/);
  assert.match(menu, /aria-expanded=\{expandedGroup === 'share'\}/);
  assert.match(menu, /aria-expanded=\{expandedGroup === 'organize'\}/);
  assert.match(menu, /aria-expanded=\{expandedGroup === 'more'\}/);
  assert.match(menu, /setExpandedGroup\(\(previous\) => previous === group \? null : group\)/);
  assert.doesNotMatch(menu, /Move to section|move-section/);
});

test('workspace-only action groups contain real sharing, organization and management operations', () => {
  for (const label of ['Share private link', 'Copy link', 'Open in new tab', 'Rename', 'Unpin', 'Pin', 'Move to project', 'Archive', 'Delete']) {
    assert.ok(menu.includes(label), `Missing action: ${label}`);
  }
  assert.match(menu, /navigator\.share\(/);
  assert.match(menu, /navigator\.clipboard\.writeText\(/);
  assert.match(menu, /encodeURIComponent\(sessionId\)/);
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
  assert.match(css, /\.tabs\s*\{/);
  assert.match(css, /\.groupButton\s*\{/);
  assert.match(css, /\.inlineEditor\s*\{/);
  assert.match(css, /\.dangerButton\s*\{/);
  assert.match(css, /\.groupButton:focus-visible/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});
