import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bookmarkStorageKey, buildChatTurns, MAX_VISIBLE_CHAT_TURNS, proximityWidth, turnMarkerTop, visibleChatTurns } from '../components/terminal/ChatTurnRail';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const RAIL = read('../components/terminal/ChatTurnRail.tsx');
const LOG = read('../components/terminal/SwarmMessageLog.tsx');
const CSS = read('../app/globals.css');
const HOMEPAGE_CSS = read('../styles/homepage-coding.css');

test('each dash maps to real user or assistant message ids, with no phantom filler markers', () => {
  const turns = buildChatTurns([
    { id: 'u1', role: 'user', content: 'Fix the checkout' },
    { id: 'a1', role: 'assistant', content: 'Done and live.\n- Tests passed\n```tsx\nsecretCode()\n```' },
    { id: 'sys', role: 'system', content: 'tool invoked' },
    { id: 'u2', role: 'user', content: 'Explain the voice limit' },
    { id: 'a2', role: 'assistant', content: 'Voice typing still works, but usage is finished.' },
    { id: 'a3', role: 'assistant', content: '', featureOutput: { type: 'image', title: 'Final product render' } },
  ]);
  assert.deepEqual(turns.map(turn => turn.id), ['u1','a1','u2','a2','a3']);
  assert.equal(turns[4].label, 'Final product render');
  assert.equal(turns[0].label, 'Fix the checkout');
  assert.equal(turns[0].summary, 'Done and live.');
  assert.equal(turns[0].detail, 'Tests passed');
  assert.equal(turns[1].label, 'Done and live.');
  assert.ok(!JSON.stringify(turns).includes('secretCode'));
  assert.ok(!JSON.stringify(turns).includes('tool invoked'));
  assert.deepEqual(buildChatTurns([{ id: 'x', role: 'assistant', content: '   ' }]), []);
});

test('proximity dash lengths form a symmetric 30/20/14/10/7 taper', () => {
  assert.deepEqual([0,1,2,3,4,9].map(proximityWidth), [30,20,14,10,7,7]);
  assert.equal(proximityWidth(null), 7);
  assert.equal(turnMarkerTop(0, 1, 800), 400);
  assert.deepEqual([turnMarkerTop(0, 2, 800), turnMarkerTop(1, 2, 800)], [394,406]);
  assert.ok(turnMarkerTop(99, 100, 580) < 580);
  assert.match(CSS, /width:\s*var\(--xv-dash-width,7px\)/);
  assert.match(CSS, /185ms cubic-bezier/);
  assert.match(CSS, /\.xv-chat-turn-preview::before/);
  assert.match(CSS, /prefers-reduced-motion: reduce/);
});

test('long histories sample real targets across time without hiding ordinary bookmarks', () => {
  const all = Array.from({ length: 225 }, (_, n) => ({ id: 'message-'+n, label: 'Message '+n, summary: '' }));
  const selected = visibleChatTurns(all, ['message-3','message-45','message-119','message-200'], 'message-79');
  assert.equal(selected.length, MAX_VISIBLE_CHAT_TURNS);
  for (const id of ['message-0','message-3','message-45','message-79','message-119','message-200','message-224'])
    assert.ok(selected.some(item => item.id === id), 'Missing anchor ' + id);
  assert.deepEqual(visibleChatTurns(all.slice(0, 2)).map(item => item.id), ['message-0','message-1']);
});

test('bookmark storage is specific to account and session, and preview buttons persist real ids', () => {
  assert.notEqual(bookmarkStorageKey('account-a:thread-1'), bookmarkStorageKey('account-b:thread-1'));
  assert.notEqual(bookmarkStorageKey('account-a:thread-1'), bookmarkStorageKey('account-a:thread-2'));
  assert.match(RAIL, /localStorage\.setItem\(bookmarkStorageKey\(conversationKey\)/);
  assert.match(RAIL, /aria-pressed=\{savedSet\.has\(hoveredTurn\.id\)\}/);
  assert.match(RAIL, /Bookmark this message/);
  assert.match(RAIL, /Remove bookmark/);
  assert.match(RAIL, /xv-chat-turn-tick--bookmarked/);
  assert.match(RAIL, /onClick=\{\(\) => onJump\(turn\.id\)\}/);
  assert.match(RAIL, /document\.body/);
  assert.match(RAIL, /hidden lg:block/);
  assert.match(RAIL, /visibleChatTurns\(turns, savedIds\)/);
  assert.doesNotMatch(RAIL, /visibleChatTurns\(turns, savedIds, activeId\)/);
});

test('reading position uses rendered real message anchors and an efficient binary search', () => {
  assert.match(LOG, /data-turn-id=\{msg\.role === 'user' \|\| msg\.role === 'assistant'/);
  assert.match(LOG, /requestAnimationFrame\(sync\)/);
  assert.match(LOG, /while \(lo <= hi\)/);
  assert.match(LOG, /\}, \[chatTurnIdsKey, sessionId\]\);/);
  assert.match(LOG, /conversationKey=\{/);
  assert.match(LOG, /key=\{sessionId\}/);
  assert.match(LOG, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
});

test('visual rail stays within the existing left-side portal, with no fake messages', () => {
  assert.match(CSS, /\.xv-chat-turn-rail\s*\{[^}]*position:\s*fixed[^}]*top:\s*8px/);
  assert.match(CSS, /\.xv-chat-turn-rail--dock\s*\{[^}]*background:\s*transparent/);
  assert.match(CSS, /\.xv-chat-turn-rail\s*\{[^}]*pointer-events:\s*none/);
  assert.match(CSS, /\.xv-chat-turn-tick\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(CSS, /\.xv-chat-turn-preview\s*\{[^}]*background:\s*#202020/);
  assert.doesNotMatch(RAIL, /Waiting for Xroga|fake|Placeholder response/);
});

test('mobile intelligence cards retain their independently verified sticky scroll deck', () => {
  assert.match(HOMEPAGE_CSS, /@media\(max-width:600px\)/);
  assert.match(HOMEPAGE_CSS, /\.xv-intelligence__grid\{display:block;padding-bottom:8svh\}/);
  assert.match(HOMEPAGE_CSS, /position:sticky;top:calc\(4\.5rem \+ var\(--xv-stack-index\) \* \.48rem\)/);
});
