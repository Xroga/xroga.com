import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const shell = read('../components/layout/AppShell.tsx');
const dock = read('../components/terminal/TerminalDock.tsx');
const view = read('../components/dashboard/DashboardView.tsx');
const identity = read('../components/terminal/WorkspaceIdentityMenu.tsx');
const sidebar = read('../components/layout/Sidebar.tsx');
const starter = read('../components/dashboard/WorkspaceNewTerminal.tsx');
const plugin = read('../components/terminal/IntegrationsModal.tsx');
const rail = read('../components/terminal/ChatTurnRail.tsx');
const css = read('../app/globals.css');

test('composer only mounts on /workspace; never paints above projects, plugins or dashboard routes', () => {
  assert.match(shell, /\{isDashboard \? <TerminalDock \/> : null\}/);
  assert.match(dock, /pathname === '\/workspace'/);
  assert.doesNotMatch(view, /xv-term-lights/);
  assert.doesNotMatch(identity.slice(identity.indexOf('className="xv-term-title xv-term-title--button"'), identity.indexOf('<AnchoredPortalPopover open={open}')), /TerminalPromptIcon|repoIdentity\.branch|STATUS_LABEL/);
});

test('repo header is only the actual repository name; menu still has complete identity', () => {
  assert.match(identity, /activeProject\?\.repo\.split\('\/'\)\.pop\(\)/);
  assert.match(identity, /max-w-\[136px\] truncate/);
  assert.doesNotMatch(identity.slice(identity.indexOf('className="xv-term-title xv-term-title--button"'), identity.indexOf('<AnchoredPortalPopover open={open}')), /title=|ChevronDown/);
  assert.match(identity, /repoIdentity\.fullName \|\| 'No GitHub repository'/);
});

test('sidebar uses animated Blocks for Overview and Locate for Search', () => {
  assert.match(sidebar, /import \{ LocateIcon \} from '@\/components\/ui\/locate-icon'/);
  assert.match(sidebar, /<LocateIcon size=\{16\} duration=\{1\}/);
  assert.match(sidebar, /<LucideBlocksIcon ref=\{overviewIconRef\} size=\{15\} aria-hidden="true"/);
  assert.match(sidebar, /overviewIconRef\.current\?\.startAnimation\(\)/);
  assert.match(sidebar, /overviewIconRef\.current\?\.stopAnimation\(\)/);
});

test('plugin search uses full catalog with debounce and cannot misrepresent unloaded results', () => {
  assert.match(plugin, /xrogaConnect\.catalog\(\{ search: query\.trim\(\), limit: 25 \}\)/);
  assert.match(plugin, /setTimeout\(\(\) =>/);
  assert.match(plugin, /catalogSearching/);
  assert.match(plugin, /Live plugin search is unavailable/);
  assert.match(plugin, /plugin\.connected && onSelect/);
});

test('conversation navigation uses 1 marker per user request and reply with adaptive page limits', async () => {
  const mod = await import('../components/terminal/ChatTurnRail');
  assert.equal(mod.MAX_VISIBLE_CHAT_TURNS, 45);
  assert.equal(mod.chatRailCapacity(1366,900),45);
  assert.equal(mod.chatRailCapacity(820,900),25);
  assert.equal(mod.chatRailCapacity(390,900),15);
  const turns = mod.buildChatTurns([
    {id:'u1',role:'user',content:'Can you build a site?'},
    {id:'a1',role:'assistant',content:'Built a site and tested it'},
    {id:'u2',role:'user',content:'Make it accessible'},
    {id:'a2',role:'assistant',content:'Updated accessibility'},
  ]);
  assert.deepEqual(turns.map(t => t.id), ['u1','u2']);
  assert.equal(turns[0].summary,'Built a site and tested it');
  assert.match(rail, /aria-label=\{\x60\$\{saved \? 'Bookmarked ' : ''\}message:/);
  assert.match(css, /xv-chat-rail-page--older/);
  assert.match(css, /xv-chat-rail-page--newer/);
});

test('automatic intro replaces first line in the same position; scroll control is animated', () => {
  assert.match(starter, /className=\{styles\.automaticFirst\} data-visible=\{!showDetail\}/);
  assert.match(starter, /className=\{styles\.automaticDetail\} data-visible=\{showDetail\}/);
  assert.match(dock, /<SquareChevronUpIcon size=\{19\}/);
});
