import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const gate = readFileSync(
  new URL('./WorkspaceAuthGate.tsx', import.meta.url),
  'utf8',
);
const shell = readFileSync(
  new URL('../layout/AppShell.tsx', import.meta.url),
  'utf8',
);
const sidebar = readFileSync(
  new URL('../layout/Sidebar.tsx', import.meta.url),
  'utf8',
);
const chatbar = readFileSync(
  new URL('../terminal/TerminalChatBar.tsx', import.meta.url),
  'utf8',
);
const chat = readFileSync(
  new URL('../../context/TerminalChatContext.tsx', import.meta.url),
  'utf8',
);

test('workspace mounts one reusable guest auth gate around the interactive shell', () => {
  assert.match(shell, /<WorkspaceAuthGateProvider>/);
  assert.match(gate, /role="dialog"/);
  assert.match(gate, /Your current guest conversation stays in this browser/);
  assert.match(gate, /auth\/signup\?next=%2Fworkspace/);
  assert.match(gate, /auth\/login\?next=%2Fworkspace/);
});

test('guest protected sidebar destinations stay in the workspace instead of navigating to login', () => {
  assert.match(sidebar, /guestGateReasonForHref/);
  assert.match(sidebar, /event\.preventDefault\(\)/);
  assert.match(sidebar, /dashboard\/integrations'\) return 'integration'/);
  assert.match(sidebar, /requestAuthGate\(gateReason\)/);
  assert.match(sidebar, /requestAuthGate\('history'\)/);
});

test('guest file and integration actions are gated before authenticated tools run', () => {
  assert.match(chatbar, /requestAuthGate\('upload'\)/);
  assert.match(chatbar, /requestAuthGate\('integration'\)/);
  assert.match(chatbar, /disabled=\{incognito \|\| isGuest\}/);
});

test('reaching the guest chat limit opens the shared account gate', () => {
  assert.match(chat, /GUEST_LIMIT_REACHED/);
  assert.match(chat, /requestAuthGate\('limit'\)/);
});
