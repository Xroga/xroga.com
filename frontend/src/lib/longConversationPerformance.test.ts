import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const LOG = read('../components/terminal/SwarmMessageLog.tsx');
const RESPONSE = read('../components/terminal/ReasoningAndFollowUps.tsx');
const CSS = read('../app/globals.css');

test('streaming does not rebuild every historical turn observer for every text batch', () => {
  assert.match(LOG, /const chatTurnIdsKey = chatTurnIds\.join\('\|'\)/);
  assert.match(LOG, /const stableTurnIds = chatTurnIdsKey \? chatTurnIdsKey\.split\('\|'\) : \[\]/);
  assert.match(LOG, /\}, \[chatTurnIdsKey\]\);/);
  assert.doesNotMatch(LOG, /\}, \[chatTurns\]\);/);
});

test('stream rendering is deferred while completed markdown and offscreen turns are reusable', () => {
  assert.match(LOG, /useDeferredValue\(visibleMessages\)/);
  assert.match(LOG, /renderedMessages\.map/);
  assert.match(RESPONSE, /memo\(function ModernResponseText/);
  assert.match(CSS, /\.xv-terminal-turn\s*\{[\s\S]*?content-visibility:\s*auto;/);
});

test('loading transition effects are not keyed to every message delta', () => {
  assert.match(LOG, /\}, \[loading, scrollToBottom\]\);/);
  assert.doesNotMatch(LOG, /\}, \[messages, loading, scrollToBottom\]\);/);
});
