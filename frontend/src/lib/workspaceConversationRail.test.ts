import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const sidebar = read('../components/layout/SidebarProjectHistory.tsx');
const rail = read('../components/terminal/ChatTurnRail.tsx');
const log = read('../components/terminal/SwarmMessageLog.tsx');
const css = read('../app/globals.css');

test('project, pinned and recent sidebar rows retain readable labels and accessible open controls', () => {
  assert.doesNotMatch(sidebar, /HistoryTick|xv-history-tick/);
  assert.match(sidebar, /function renderRow\(kind:SidebarKind,id:string,label:string,open:\(\)=>void/);
  assert.match(sidebar, /onClick=\{open\}/);
  assert.match(sidebar, /aria-label=\{label\}/);
  assert.match(sidebar, /<SidebarMovingTitle text=\{label\}\/>/);
  assert.doesNotMatch(sidebar, /\{leading\}/);
  assert.match(sidebar, /session\.title/);
  assert.match(sidebar, /aria-label="Projects"/);
  assert.match(sidebar, /aria-label="Pinned items"/);
  assert.match(sidebar, /aria-label="Recent conversations outside projects"/);
});

test('only the workspace transcript has a minimal conversation-tick rail', () => {
  assert.doesNotMatch(css, /xv-history-rail|xv-history-tick/);
  assert.match(log, /<ChatTurnRail/);
  assert.match(rail, /aria-label="Conversation turn navigation"/);
  assert.match(rail, /onClick=\{\(\) => onJump\(turn\.id\)\}/);
  assert.match(rail, /xv-chat-turn-tick--active/);
  assert.match(rail, /xv-chat-turn-preview/);
    // PRs #829 and #831 own graduated message/artifact markers and bookmarks.
    assert.match(rail, /proximityWidth\(near\)/);
    assert.match(rail, /'--xv-dash-width': width \+ 'px'/);
    assert.match(rail, /toggleBookmark\(hoveredTurn\.id\)/);
    assert.match(css, /width: var\(--xv-dash-width,\s*7px\);\s*height: 1\.5px;/);
    assert.match(css, /\.xv-chat-turn-tick--active > span,[\s\S]*?background: var\(--xv-dash-strong\)/);
    assert.match(css, /\.xv-chat-turn-tick--hovered > span,[\s\S]*?opacity: 1/);
    assert.match(css, /\.xv-chat-turn-tick:focus-visible \{\s*outline: 1px solid var\(--xv-dash-strong\)/);
  assert.match(css, /\.xv-chat-turn-rail--dock \{\s*background: transparent;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.xv-chat-turn-tick > span \{ transition: none; \}/);
});
