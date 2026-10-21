import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const dock = read('../components/terminal/TerminalDock.tsx');
const starter = read('../components/dashboard/WorkspaceNewTerminal.tsx');
const voice = read('../components/terminal/XrogaVoiceControl.tsx');
const audio = read('../components/terminal/AudioLinesIcon.tsx');
const shell = read('../components/ui/AnchoredPortalPopover.tsx');
const sidebar = read('../components/layout/Sidebar.tsx');
const profile = read('../components/ui/ProfileQuickMenu.tsx');
const model = read('../components/terminal/BlackHoleVButton.tsx');

test('an actionable model selector and live voice remain after removing decorative chevrons', () => {
  assert.match(model, /onClick=\{\(\) => setOpen\(value => !value\)\}/);
  assert.doesNotMatch(model, /<ChevronDown/);
  assert.match(audio, /scaleY: \[1, scale, 1\]/);
  assert.match(voice, /<AudioLinesIcon size=\{22\}/);
  assert.match(dock, /aria-label=\{showJumpToLatest/);
  assert.doesNotMatch(dock, /data-short-tip|data-tooltip/);
});

test('starter cards provide stable hover details, explicit Back, and detailed draft rather than executing', () => {
  assert.match(starter, /onMouseEnter=\{\(\) => setSelectedFeature\(index\)\}/);
  assert.match(starter, /Back to categories/);
  assert.match(starter, /Use this in chat/);
  assert.match(starter, /Ask for approval before publishing/);
  assert.doesNotMatch(starter, /onBlur=\{event => \{ if \(!event.currentTarget.contains/);
});

test('popovers are clamped, fully opaque and accessible to small screens', () => {
  assert.match(shell, /maxHeight: 'calc\(100dvh - 24px\)'/);
  assert.match(shell, /availableAbove/);
  assert.match(sidebar, /overviewIconRef.current\?\.startAnimation\(\)/);
  assert.match(profile, /navigator.clipboard.writeText\(email\)/);
});

test('New Work and active conversations share one bordered composer with inline Projects and Plugins', () => {
  const chatbar = read('../components/terminal/TerminalChatBar.tsx');
  const shell = read('../components/layout/AppShell.tsx');
  assert.doesNotMatch(dock, /xv-chatbar-context-strip|WorkspaceConnectionsStrip/);
  assert.match(dock, /data-composer-frame="single"/);
  assert.match(chatbar, /arrowSend=\{!incognito\}/);
  assert.match(chatbar, /plusIcon=\{!incognito\}/);
  assert.match(chatbar, /aria-label="Projects"/);
  assert.match(chatbar, /aria-label="Plugins"/);
  assert.doesNotMatch(shell, /<CompactAppTooltip/);
  assert.match(audio, /LazyMotion features=\{domMin\}/);
  assert.match(starter, /TASK_ACCEPTANCE\[label\]/);
});
