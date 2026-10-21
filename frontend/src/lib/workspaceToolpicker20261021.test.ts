import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const actions = source('../components/terminal/ChatBarActionsMenu.tsx');
const composer = source('../components/terminal/TerminalChatBar.tsx');
const chips = source('../components/terminal/ComposerToolChip.tsx');
const plugins = source('../components/terminal/IntegrationsModal.tsx');
const header = source('../components/dashboard/WorkspaceNewTerminal.tsx');
const css = source('../components/dashboard/WorkspaceNewTerminal.module.css');
const palette = source('../components/terminal/WorkspaceControls.module.css');
const sidebar = source('../components/layout/Sidebar.tsx');

test('all requested tool categories remain available without the redundant header or logos', () => {
  assert.doesNotMatch(actions, /Choose a tool, or describe your task|Examples fill the composer without sending anything/);
  assert.doesNotMatch(actions, /xv-cba-integrations-logo|IntegrationLogo/);
  for (const name of ['Plugins', 'Library', 'Projects', 'Browser automation', 'AI Employees', 'Apps automation', 'Slash commands', 'Plan before build', 'Debug an error', 'Skills', 'Rules'])
    assert.ok(actions.includes(name), name + ' missing');
  assert.match(palette, /data-tone='orange'/);
  assert.match(palette, /data-tone='red'/);
  assert.doesNotMatch(palette, /filter: grayscale\(1\)/);
});

test('chosen tools remain removable and connected plugin selections never bypass verification', () => {
  assert.match(composer, /<ComposerToolChip/);
  assert.match(composer, /setSelectedTool\(null\)/);
  assert.match(composer, /onSelect=\{\(plugin\) =>/);
  assert.doesNotMatch(composer, /onPointerEnter=\{event => \{ if \(event.pointerType === 'mouse' && !isGuest\) setIntegrationsOpen\(true\)/);
  assert.match(plugins, /plugin.connected && onSelect/);
  assert.match(plugins, /Boolean\(toolkit.connected\)/);
  assert.match(chips, /AnchoredPortalPopover/);
  assert.match(chips, /onRemove/);
});

test('restored animated headline and delayed second line honor motion preference', () => {
  assert.match(header, /ROTATING_WORDS/);
  assert.match(header, /browser automation/);
  assert.match(header, /3400/);
  assert.match(header, /setTimeout\(\(\) => setShowDetail\(true\), 2200\)/);
  assert.match(header, /prefers-reduced-motion: reduce/);
  assert.match(css, /filter: blur\(8px\)/);
  assert.match(css, /scrollbar-width: none/);
  assert.match(sidebar, /Overview/);
});
