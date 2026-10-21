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
  if (rail.includes("'--xv-dash-width'")) {
    // PR #829 owns graduated message/artifact markers and persistent bookmarks.
    assert.match(rail, /proximityWidth\(near\)/);
    assert.match(rail, /'--xv-dash-width': width \+ 'px'/);
    assert.match(rail, /toggleBookmark\(hoveredTurn\.id\)/);
    assert.match(css, /width: var\(--xv-dash-width,\s*7px\);\s*height: 1\.5px;/);
    assert.match(css, /\.xv-chat-turn-tick--active > span,[\s\S]*?background: var\(--xv-dash-strong\)/);
    assert.match(css, /\.xv-chat-turn-tick--hovered > span,[\s\S]*?opacity: 1/);
    assert.match(css, /\.xv-chat-turn-tick:focus-visible \{\s*outline: 1px solid var\(--xv-dash-strong\)/);
  } else {
    assert.match(css, /width: 11px;\s*height: 1\.5px;/);
    assert.match(css, /\.xv-chat-turn-tick--active > span \{\s*width: 25px;/);
    assert.match(css, /\.xv-chat-turn-tick:hover > span,[\s\S]*?width: 18px/);
    assert.match(css, /\.xv-chat-turn-tick:focus-visible \{\s*outline: 1px solid var\(--accent\)/);
  }
  assert.match(css, /\.xv-chat-turn-rail--dock \{\s*background: transparent;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.xv-chat-turn-tick > span \{ transition: none; \}/);
});
