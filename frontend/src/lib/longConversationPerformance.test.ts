import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const LOG = read('../components/terminal/SwarmMessageLog.tsx');
const RESPONSE = read('../components/terminal/ReasoningAndFollowUps.tsx');
const CSS = read('../app/globals.css');

test('streaming does not rebuild every historical turn observer for every text batch', () => {
  assert.match(LOG, /const chatTurnIdsKey = chatTurnIds\.join\('\|'\)/);
  assert.match(LOG, /const ids = chatTurnIdsKey \? chatTurnIdsKey\.split\('\|'\) : \[\]/);
  assert.match(LOG, /\}, \[chatTurnIdsKey, sessionId\]\);/);
  assert.match(LOG, /requestAnimationFrame\(sync\)/);
  assert.match(LOG, /while \(lo <= hi\)/);
  assert.doesNotMatch(LOG, /\}, \[chatTurns\]\);/);
});

test('stream rendering is deferred while completed markdown and offscreen turns are reusable', () => {
  assert.match(LOG, /useDeferredValue\(transcript\)/);
  assert.match(LOG, /renderedMessages\.map/);
  assert.match(RESPONSE, /memo\(function ModernResponseText/);
  assert.match(CSS, /\.xv-terminal-turn\s*\{[\s\S]*?content-visibility:\s*auto;/);
});

test('a conversation reset or switch paints the current messages before deferred streaming catches up', () => {
  assert.match(LOG, /deferredTranscript\.sessionId === sessionId/);
  assert.match(LOG, /deferredTranscript\.messages\[0\]\?\.id === visibleMessages\[0\]\?\.id/);
  assert.match(LOG, /\? deferredTranscript\.messages\s*:\s*visibleMessages/);
});

test('submit anchoring depends on the prompt identity instead of streamed message content', () => {
  assert.match(LOG, /\}, \[loading, sessionRestoring, latestPromptId, renderedPromptId\]\);/);
  assert.match(LOG, /anchoredPromptId\.current = renderedPromptId;\s*pendingPromptId\.current = null;/);
  assert.doesNotMatch(LOG, /\}, \[messages, loading, scrollToBottom\]\);/);
});
