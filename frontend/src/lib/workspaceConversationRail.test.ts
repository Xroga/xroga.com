import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const sidebar = read('../components/layout/SidebarProjectHistory.tsx');
const rail = read('../components/terminal/ChatTurnRail.tsx');
const log = read('../components/terminal/SwarmMessageLog.tsx');
const css = read('../app/globals.css');

test('repository, pinned and recent sidebar rows have their original readable labels', () => {
  assert.doesNotMatch(sidebar, /HistoryTick|xv-history-tick/);
  assert.match(sidebar, /folder\.sessions\.map\(\(session\) =>/);
  assert.match(sidebar, /className=\{cn\(\s*'w-full flex items-center/);
  assert.match(sidebar, /session\.title/);
  assert.match(sidebar, /aria-label="Pinned conversations"/);
  assert.match(sidebar, /aria-label="Recent conversations"/);
});

test('only the workspace transcript has a minimal conversation-tick rail', () => {
  assert.doesNotMatch(css, /xv-history-rail|xv-history-tick/);
  assert.match(log, /<ChatTurnRail/);
  assert.match(rail, /aria-label="Conversation turn navigation"/);
  assert.match(rail, /onClick=\{\(\) => onJump\(turn\.id\)\}/);
  assert.match(rail, /xv-chat-turn-tick--active/);
  assert.match(rail, /xv-chat-turn-preview/);
  assert.match(css, /width:\s*var\(--xv-dash-width,7px\)/);
  assert.match(css, /\.xv-chat-turn-tick--active > span/);
  assert.match(rail, /proximityWidth/);
  assert.match(css, /\.xv-chat-turn-tick:focus-visible/);
  assert.match(css, /\.xv-chat-turn-rail--dock \{\s*background: transparent;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.xv-chat-turn-tick > span \{ transition: none; \}/);
});
