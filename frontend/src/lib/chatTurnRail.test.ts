import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { bookmarkStorageKey, buildChatTurns, MAX_VISIBLE_CHAT_TURNS, proximityWidth, shouldShowChatTurnRail, turnMarkerTop, visibleChatTurns } from '../components/terminal/ChatTurnRail';

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
  assert.deepEqual(turns.map(turn => turn.id), ['u1','u2']);
  assert.equal(turns[1].label, 'Explain the voice limit');
  assert.equal(turns[0].label, 'Fix the checkout');
  assert.equal(turns[0].summary, 'Done and live.');
  assert.equal(turns[0].detail, 'Tests passed');
  assert.equal(turns[1].summary, 'Voice typing still works, but usage is finished.');
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
  assert.equal(selected[0].id, 'message-180');
  assert.equal(selected.at(-1)?.id, 'message-224');
  assert.equal(visibleChatTurns(all, [], null, 15, 0).length, 15);
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
  assert.match(RAIL, /chatRailCapacity/);
  assert.match(RAIL, /Older messages/);
  assert.match(RAIL, /Newer messages/);
  assert.match(RAIL, /visibleChatTurns\(turns, savedIds, activeId, capacity, effectiveStart\)/);
  assert.doesNotMatch(RAIL, /Jump to \$\{/);
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

test('workspace conversation markers are anchored to the pane, not delayed viewport coordinates', () => {
  assert.match(RAIL, /root\.closest<HTMLElement>\('\.xv-terminal-panel'\)/);
  assert.match(RAIL, /setRailHost\(host\)/);
  assert.match(RAIL, /railHost \?\? document\.body/);
  assert.match(RAIL, /style=\{railHost \? undefined : \{ left: layout\.left \}\}/);
  assert.match(CSS, /\.xv-chat-turn-rail\.xv-chat-turn-rail--dock\.xv-chat-turn-rail--pane\s*\{\s*position: absolute/);
  assert.match(CSS, /body\.xv-sidebar-resizing \.xv-terminal-dock\s*\{\s*transition-property: opacity !important/);
  assert.match(CSS, /\.xv-workspace-header \.xv-workspace-identity-cluster\s*\{[\s\S]*?overflow: hidden/);
  assert.match(CSS, /@media \(min-width: 1024px\) and \(max-width: 1200px\)/);
});

test('workspace history rail is always present for multi-turn chats, even when transcript fits', () => {
  assert.match(RAIL, /railAnchorRef = useRef<HTMLSpanElement>\(null\)/);
  assert.match(RAIL, /railAnchorRef\.current\?\.closest<HTMLElement>\('\.xv-terminal-scroll'\)/);
  assert.match(RAIL, /railAnchorRef\.current\?\.closest<HTMLElement>\('\.xv-terminal-panel'\)/);
  assert.match(RAIL, /const anchor = <span ref=\{railAnchorRef\} hidden aria-hidden="true" \/>/);
  assert.doesNotMatch(RAIL, /\|\| !layout\.navigable/);
  assert.match(RAIL, /!shouldShowChatTurnRail\(turns\.length, visibleTurns\.length, layout\.width\)/);
  assert.match(RAIL, /railHost \?\? document\.body/);
  assert.match(CSS, /\.xv-chat-turn-rail\.xv-chat-turn-rail--dock\.xv-chat-turn-rail--pane\s*\{\s*position: absolute/);
});

test('one real question-and-answer pair shows one navigable history marker', () => {
  const turns = buildChatTurns([
    { id: 'prompt-1', role: 'user', content: 'Compare PostgreSQL, MySQL and SQLite for a small SaaS' },
    { id: 'answer-1', role: 'assistant', content: 'For a small multi-tenant SaaS, default to PostgreSQL.' },
  ]);
  assert.equal(turns.length, 1, 'one conversation exchange is one genuine history target');
  assert.equal(shouldShowChatTurnRail(turns.length, turns.length, 1422), true);
  assert.equal(shouldShowChatTurnRail(1, 1, 1024), true);
  assert.equal(shouldShowChatTurnRail(1, 1, 390), true);
  assert.equal(shouldShowChatTurnRail(0, 0, 1422), false);
  assert.equal(shouldShowChatTurnRail(2, 2, 320), false, 'respect tiny viewport cutoff');
  assert.match(RAIL, /onClick=\{\(\) => onJump\(turn\.id\)\}/);
});
