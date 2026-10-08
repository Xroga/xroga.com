import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHAT_SYSTEM } from './prompts.js';

test('chat answers may request safe rich output without fabricating visual data', () => {
  assert.match(CHAT_SYSTEM, /```xroga-ui|labelled xroga-ui/i);
  assert.match(CHAT_SYSTEM, /never invent values/i);
  assert.match(CHAT_SYSTEM, /strict JSON only/i);
  assert.match(CHAT_SYSTEM, /No HTML, scripts, callbacks, actions/i);
  assert.match(CHAT_SYSTEM, /normal Markdown table/i);
});
