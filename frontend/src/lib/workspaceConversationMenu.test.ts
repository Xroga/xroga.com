import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
const view = read('../components/dashboard/DashboardView.tsx');
const menu = read('../components/terminal/WorkspaceConversationMenu.tsx');
const styles = read('../components/terminal/WorkspaceConversationMenu.module.css');

test('workspace header keeps conversation actions and independent repository identity', () => {
  const header = view.slice(view.indexOf('<header className="xv-workspace-header"'), view.indexOf('</header>'));
  assert.match(header, /<WorkspaceConversationMenu\s*\/>/);
  assert.match(header, /<WorkspaceIdentityMenu incognito\s*\/>/);
  assert.match(header, /activeProject \? <WorkspaceIdentityMenu\s*\/> : null/);
  assert.doesNotMatch(header, /<SidebarProjectHistory/);
});

test('title shows real chat subject and prefixes only active GitHub or project contexts', () => {
  assert.match(menu, /messages\.find\(\(message\) => message\.role === 'user'\)/);
  assert.match(menu, /meaningfulSidebarTitle\(savedCurrentTitle, firstUserPrompt\)/);
  assert.match(menu, /activeRepo \? `Repo ·/);
  assert.match(menu, /projectName \? `Project ·/);
  assert.match(menu, /contextPrefix \? `\$\{contextPrefix\} \/ \$\{displayTitle\}` : displayTitle/);
  assert.match(menu, /getActiveSidebarProject\(accountId\)/);
  assert.match(menu, /title=\{headerTitle\}/);
  assert.match(menu, /Open conversation actions/);
});

test('header dropdown contains only current-chat actions, not a redundant history browser', () => {
  assert.match(menu, /ariaLabel="Conversation actions"/);
  assert.match(menu, /role="menuitem".*type="button"/);
  assert.match(menu, /beginEditor\('rename'\)/);
  assert.match(menu, /togglePin\(\)/);
  assert.match(menu, /beginEditor\('project'\)/);
  assert.match(menu, /beginEditor\('delete'\)/);
  assert.match(menu, /beginEditor\('archive'\)/);
  assert.doesNotMatch(menu, /Search recent chats|New chat<\/button>|role="tablist"|role="tabpanel"|ariaLabel="Recent conversations"/);
  assert.doesNotMatch(menu, /loadSidebarChats\(|listCloudTerminalSessions\(/);
});

test('management resolves the exact owner-scoped conversation, including old saved chats', () => {
  assert.match(menu, /status === 'authenticated' \? userId/);
  assert.match(menu, /loadSidebarChatById\(accountId, sessionId\)/);
  assert.match(menu, /loadCloudTerminalSession\(sessionId\)/);
  assert.match(menu, /loadSidebarMeta\(accountId\)/);
  assert.match(menu, /currentEntry && messages\.length/);
  assert.match(menu, /<AnchoredPortalPopover/);
  assert.match(styles, /\.actionList\s*\{/);
  assert.match(styles, /\.actionPane\s*\{[^}]*overflow-y: auto/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
});
