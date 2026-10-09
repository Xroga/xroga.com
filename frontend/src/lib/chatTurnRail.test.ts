import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildChatTurns, MAX_VISIBLE_CHAT_TURNS, turnMarkerTop, visibleChatTurns } from '../components/terminal/ChatTurnRail';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const RAIL = read('../components/terminal/ChatTurnRail.tsx');
const CSS = read('../app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '');
const HOMEPAGE_CSS = read('../styles/homepage-coding.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('conversation map matches the left dash rail and hover card reference', () => {
  assert.match(RAIL, /xv-chat-turn-rail--dock hidden lg:block/);
  assert.match(RAIL, /onMouseEnter=\{\(\) => setHoveredId\(turn.id\)\}/);
  assert.match(RAIL, /onClick=\{\(\) => onJump\(turn.id\)\}/);
  assert.match(RAIL, /aria-current=\{turn.id === activeId \? 'location'/);
  assert.match(RAIL, /xv-chat-turn-preview-heading/);
  assert.match(RAIL, /Bookmark turn/);
  assert.doesNotMatch(RAIL, /ChevronUp|ChevronDown|xv-chat-turn-panel|xv-chat-turn-collapsed/);
  assert.match(CSS, /\.xv-chat-turn-rail\s*\{[^}]*position:\s*fixed[^}]*top:\s*8px/);
  assert.doesNotMatch(RAIL, /xv-chat-turn-track/);
  assert.doesNotMatch(CSS, /\.xv-chat-turn-track\s*\{/);
  assert.match(CSS, /\.xv-chat-turn-rail--dock\s*\{[^}]*background:\s*transparent/);
  assert.match(CSS, /\.xv-chat-turn-rail\s*\{[^}]*pointer-events:\s*none/);
  assert.match(CSS, /\.xv-chat-turn-tick\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(RAIL, /visibleTurns\.length === 0/);
  assert.match(CSS, /\.xv-chat-turn-tick--active > span\s*\{[^}]*width:\s*10px[^}]*background:\s*#a3a3a3/);
  assert.match(CSS, /\.xv-chat-turn-tick:hover > span,[\s\S]*?width:\s*27px/);
  assert.match(CSS, /\.xv-chat-turn-preview\s*\{[^}]*left:\s*38px[^}]*width:\s*min\(322px/);
  assert.doesNotMatch(CSS, /--xv-turn-blue/);
});

test('chat lines stay in sequence instead of spreading two turns across the screen', () => {
  assert.deepEqual([turnMarkerTop(0, 2, 800), turnMarkerTop(1, 2, 800)], [12, 23]);
  assert.equal(turnMarkerTop(11, 12, 800), 133);
  assert.ok(turnMarkerTop(99, 100, 800) < 800);
  assert.match(RAIL, /style=\{\{ top: turnMarkerTop\(index, visibleTurns\.length, railHeight\) \}\}/);
});

test('the history rail grows with real turns and caps at the latest 50', () => {
  const turns = Array.from({ length: 75 }, (_, index) => ({
    id: `turn-${index}`,
    label: `Prompt ${index}`,
    summary: '',
  }));
  assert.equal(MAX_VISIBLE_CHAT_TURNS, 50);
  assert.equal(visibleChatTurns(turns.slice(0, 2)).length, 2);
  assert.equal(visibleChatTurns(turns).length, 50);
  assert.equal(visibleChatTurns(turns)[0]?.id, 'turn-25');
  assert.equal(visibleChatTurns(turns).at(-1)?.id, 'turn-74');
});

test('hover cards pair each prompt with its own answer and omit code blocks', () => {
  const turns = buildChatTurns([
    { id: 'u1', role: 'user', content: 'Fix the checkout' },
    { id: 'a1', role: 'assistant', content: 'Done and live.\n- Tests passed\n```tsx\nsecretCode()\n```' },
    { id: 'u2', role: 'user', content: 'Explain the voice limit' },
    { id: 'a2', role: 'assistant', content: 'Voice typing still works, but AI usage is finished.' },
  ]);
  assert.equal(turns.length, 2);
  assert.deepEqual(turns[0], { id: 'u1', label: 'Fix the checkout', summary: 'Done and live.', detail: 'Tests passed' });
  assert.equal(turns[1]?.summary, 'Voice typing still works, but AI usage is finished.');
  assert.ok(!JSON.stringify(turns).includes('secretCode'));
});

test('mobile intelligence cards form a reversible sticky scroll deck', () => {
  assert.match(HOMEPAGE_CSS, /@media\(max-width:600px\)/);
  assert.match(HOMEPAGE_CSS, /\.xv-intelligence__grid\{display:block;padding-bottom:8svh\}/);
  assert.match(HOMEPAGE_CSS, /position:sticky;top:calc\(4\.5rem \+ var\(--xv-stack-index\) \* \.48rem\)/);
  for (const index of [2, 3, 4, 5]) {
    assert.match(HOMEPAGE_CSS, new RegExp(`\\.xv-intelligence-card:nth-child\\(${index}\\)\\{--xv-stack-index:${index - 1}`));
  }
  assert.match(HOMEPAGE_CSS, /animation-timeline:view\(\)/);
  assert.match(HOMEPAGE_CSS, /animation-range:entry 0% entry 70%/);
});
