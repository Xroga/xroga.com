import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHAT_SYSTEM } from './prompts.js';

test('chat answers may request safe rich output without fabricating visual data', () => {
  assert.match(CHAT_SYSTEM, /```xroga-ui|labelled xroga-ui/i);
  assert.match(CHAT_SYSTEM, /never invent values/i);
  assert.match(CHAT_SYSTEM, /strict JSON only/i);
  assert.match(CHAT_SYSTEM, /No HTML, scripts, callbacks, actions/i);
  assert.match(CHAT_SYSTEM, /normal Markdown table/i);
  assert.match(CHAT_SYSTEM, /progress view/i);
  assert.match(CHAT_SYSTEM, /calculator/i);
  assert.match(CHAT_SYSTEM, /calculation breakdown/i);
  assert.match(CHAT_SYSTEM, /scorecard/i);
  assert.match(CHAT_SYSTEM, /file tree/i);
  assert.match(CHAT_SYSTEM, /accordion/i);
  assert.match(CHAT_SYSTEM, /source list/i);
  assert.match(CHAT_SYSTEM, /"type":"card-grid"/i);
  assert.match(CHAT_SYSTEM, /"type":"tree"/i);
  assert.match(CHAT_SYSTEM, /"type":"json"/i);
  assert.match(CHAT_SYSTEM, /"type":"api-request"/i);
  assert.match(CHAT_SYSTEM, /"type":"diff"/i);
  assert.match(CHAT_SYSTEM, /"chartType":"donut"/i);
  assert.match(CHAT_SYSTEM, /"chartType":"radar"/i);
  assert.match(CHAT_SYSTEM, /"chartType":"funnel"/i);
  assert.match(CHAT_SYSTEM, /authorization headers, cookies, tokens, or secrets/i);
});

test('every compact rich-output example is strict JSON', () => {
  const examples = CHAT_SYSTEM.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('{'));
  assert.ok(examples.length >= 10);
  for (const example of examples) assert.doesNotThrow(() => JSON.parse(example));
});
