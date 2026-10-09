import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildChatTurns } from '../components/terminal/ChatTurnRail';

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
  assert.match(CSS, /\.xv-chat-turn-track\s*\{[\s\S]*?repeating-linear-gradient/);
  assert.match(CSS, /\.xv-chat-turn-tick--active > span\s*\{[^}]*width:\s*30px[^}]*background:\s*#e5e5e5/);
  assert.match(CSS, /\.xv-chat-turn-preview\s*\{[^}]*left:\s*40px[^}]*width:\s*min\(322px/);
  assert.doesNotMatch(CSS, /--xv-turn-blue/);
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
