import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const DOCK = read('../components/terminal/TerminalDock.tsx');
const WELCOME = read('../components/dashboard/DashboardWelcome.tsx');
const IDEAS = read('../components/dashboard/WorkspaceStarterIdeas.tsx');
const TEMPLATES = read('../components/dashboard/WorkspaceShowcaseStarts.tsx');
const SIDEBAR = read('../components/layout/Sidebar.tsx');
const CHATBAR = read('../components/terminal/TerminalChatBar.tsx');
const CSS = read('../app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('an empty terminal centers the one canonical composer and exposes starters', () => {
  assert.match(DOCK, /messages\.length === 0/);
  assert.match(DOCK, /showStarterExperience = emptyWorkspace && !workspaceOpen/);
  assert.match(DOCK, /xv-terminal-dock--idle/);
  assert.match(DOCK, /<TerminalChatBar \/>/);
  assert.equal((DOCK.match(/<TerminalChatBar \/>/g) ?? []).length, 1);
  assert.match(DOCK, /showStarterExperience[\s\S]*<WorkspaceStarterIdeas \/>[\s\S]*<WorkspaceShowcaseStarts \/>/);
  assert.match(CSS, /\.xv-terminal-dock--idle:not\(\.xv-terminal-dock--fullscreen\)\s*\{[^}]*top:\s*54%[^}]*bottom:\s*auto !important/);
});

test('New Terminal closes Project edits before revealing the centered starter', () => {
  const handler = SIDEBAR.slice(SIDEBAR.indexOf('function handleNewChat()'), SIDEBAR.indexOf('async function handleLogout'));
  assert.match(handler, /startNewChat\(\)/);
  assert.match(handler, /useProjectWorkspaceStore\.getState\(\)\.setWorkspaceOpen\(false\)/);
  assert.match(handler, /xroga-request-new-terminal/);
});

test('New Terminal leaves repository selection available without opening it over the composer', () => {
  const start = CHATBAR.indexOf('// Sidebar "New Terminal"');
  const effectOpen = CHATBAR.indexOf('useEffect(() => {', start);
  const effect = CHATBAR.slice(start, CHATBAR.indexOf('useEffect(() => {', effectOpen + 20));
  assert.match(effect, /clearSelectedRepoContext\(\)/);
  assert.match(effect, /notifyRepoContextCleared\(\)/);
  assert.match(effect, /textareaRef\.current\?\.focus\(\)/);
  assert.doesNotMatch(effect, /notifyOpenRepoPicker/);
  assert.doesNotMatch(effect, /setRepoGate/);
});

test('ideas stay collapsed until a category is chosen, then fill the real composer without auto-sending', () => {
  assert.match(IDEAS, /role="tablist"/);
  assert.match(IDEAS, /useState<string \| null>\(null\)/);
  assert.match(IDEAS, /setGroupId\(nextId\)/);
  assert.match(IDEAS, /setPage\(\(current\) => \(current \+ 1\) % 2\)/);
  assert.match(IDEAS, /activeGroup \? \(/);
  assert.doesNotMatch(IDEAS, /Xroga ideas|Choose a direction, then make it yours|New ideas/);
  assert.match(IDEAS, /setPrompt\(idea\)/);
  assert.match(IDEAS, /textarea\[data-terminal-composer\]/);
  assert.doesNotMatch(IDEAS, /\bsubmit\s*\(/);
});

test('templates are visible in a moving one-row rail and open a preview-or-build decision', () => {
  assert.doesNotMatch(WELCOME, /<details|xv-ws-fold/);
  assert.match(TEMPLATES, /xv-workspace-template-track/);
  assert.match(TEMPLATES, /<TemplateRailGroup onSelect=\{setSelectedTemplate\} onInteractStart=/);
  assert.match(TEMPLATES, /<TemplateRailGroup duplicate onSelect=\{setSelectedTemplate\} onInteractStart=/);
  assert.match(TEMPLATES, /onPointerDown=\{onInteractStart\}/);
  assert.match(TEMPLATES, /role="dialog"/);
  assert.match(TEMPLATES, /Full preview/);
  assert.match(TEMPLATES, /Use prompt &amp; ship/);
  assert.match(TEMPLATES, /setPrompt\(prompt\)/);
  assert.match(TEMPLATES, /selected GitHub repository/);
  assert.match(CSS, /\.xv-workspace-template-track\s*\{[^}]*display:\s*flex[^}]*animation:\s*xv-workspace-template-marquee/);
});

test('the new ownership-and-shipping line replaces the retired model claim', () => {
  assert.match(WELCOME, /One prompt\./);
  assert.match(WELCOME, />Yours</);
  assert.match(WELCOME, />ship</);
  assert.doesNotMatch(WELCOME, /first[\s\S]*last[\s\S]*model you will ever need/i);
});

test('an untouched terminal hides transcript and checklist noise behind the starter', () => {
  assert.match(CSS, /\.xv-terminal-scroll\[data-conversation='false'\] \.xv-term-empty/);
  assert.match(CSS, /\.xv-terminal-scroll\[data-conversation='false'\] \.xv-first-run-checklist/);
});
