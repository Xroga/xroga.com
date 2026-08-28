import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const DOCK = read('../components/terminal/TerminalDock.tsx');
const WELCOME = read('../components/dashboard/DashboardWelcome.tsx');
const IDEAS = read('../components/dashboard/WorkspaceStarterIdeas.tsx');
const TEMPLATES = read('../components/dashboard/WorkspaceShowcaseStarts.tsx');
const SIDEBAR = read('../components/layout/Sidebar.tsx');
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

test('ideas change by category and fill the real composer without auto-sending', () => {
  assert.match(IDEAS, /role="tablist"/);
  assert.match(IDEAS, /setGroupId\(nextId\)/);
  assert.match(IDEAS, /setPage\(\(current\) => \(current \+ 1\) % 2\)/);
  assert.match(IDEAS, /setPrompt\(idea\)/);
  assert.match(IDEAS, /textarea\[data-terminal-composer\]/);
  assert.doesNotMatch(IDEAS, /\bsubmit\s*\(/);
});

test('templates are visible in a moving one-row rail, never hidden in a disclosure', () => {
  assert.doesNotMatch(WELCOME, /<details|xv-ws-fold/);
  assert.match(TEMPLATES, /xv-workspace-template-track/);
  assert.match(TEMPLATES, /<TemplateRailGroup \/>[\s\S]*<TemplateRailGroup duplicate \/>/);
  assert.match(TEMPLATES, /setPrompt\(template\.defaultBuildPrompt\)/);
  assert.match(CSS, /\.xv-workspace-template-track\s*\{[^}]*display:\s*flex[^}]*animation:\s*xv-workspace-template-marquee/);
});

test('the new ownership-and-shipping line replaces the retired model claim', () => {
  assert.match(WELCOME, /One prompt\. A product you can/);
  assert.match(WELCOME, />own</);
  assert.match(WELCOME, />ship</);
  assert.doesNotMatch(WELCOME, /first[\s\S]*last[\s\S]*model you will ever need/i);
});
