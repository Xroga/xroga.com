import assert from 'node:assert/strict';
import test from 'node:test';
import { browserTurnPolicy, defaultBrowserEffort } from './localBrowser.js';

test('a browser turn reasons at high unless the server or the request says otherwise', () => {
  assert.equal(defaultBrowserEffort({}), 'high');
  assert.equal(browserTurnPolicy(undefined, {}).effort, 'high');
  assert.equal(browserTurnPolicy('max', {}).effort, 'max');
  assert.equal(browserTurnPolicy('none', {}).effort, 'none');
});

test('the rollback switch sets what an unspecified turn gets, and an unknown word is ignored', () => {
  assert.equal(defaultBrowserEffort({ XROGA_BROWSER_REASONING_DEFAULT: 'none' }), 'none');
  assert.equal(defaultBrowserEffort({ XROGA_BROWSER_REASONING_DEFAULT: 'max' }), 'max');
  assert.equal(defaultBrowserEffort({ XROGA_BROWSER_REASONING_DEFAULT: 'medium' }), 'high');
});

test('more reasoning gets more output room, more spend ceiling and more time', () => {
  const none = browserTurnPolicy('none', {});
  const high = browserTurnPolicy('high', {});
  const max = browserTurnPolicy('max', {});
  assert.ok(none.maxTokens < high.maxTokens && high.maxTokens < max.maxTokens);
  assert.ok(none.ceilingMicros < high.ceilingMicros && high.ceilingMicros < max.ceilingMicros);
  assert.ok(none.timeoutMs < high.timeoutMs && high.timeoutMs < max.timeoutMs);
  assert.equal(none.maxTokens, 2_048);
});
