import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REASONING_SUMMARY_MAX_LINES, REASONING_SUMMARY_MAX_LINE_CHARS, cleanReasoningSummary, generateReasoningSummary,
  planStep, reasoningSummaryEnabled,
} from './reasoningSummary.js';
import type { TenantModelScope } from './tenantModelDispatch.js';

test('keeps one plain note per line and strips markup, code and hidden thinking', () => {
  const out = cleanReasoningSummary(
    '<think>secret chain</think>**Compare** the two release lines first.\n\n- Then weigh stability.\n```js\nrun()\n```\nرات کا خلاصہ لکھنا ہے۔',
  );
  assert.ok(out);
  assert.doesNotMatch(out!, /secret|run\(\)|\*|`|<think>/);
  assert.deepEqual(out!.split('\n'), ['Compare the two release lines first.', 'Then weigh stability.', 'رات کا خلاصہ لکھنا ہے۔']);
});

test('has spending bounds on lines and line length, and no minimum wording', () => {
  assert.equal(cleanReasoningSummary('   \n  '), null);
  assert.equal(cleanReasoningSummary('Say hi'), 'Say hi');
  const out = cleanReasoningSummary(Array.from({ length: 40 }, () => 'x'.repeat(900)).join('\n'))!.split('\n');
  assert.equal(out.length, REASONING_SUMMARY_MAX_LINES);
  assert.ok(out.every((line) => line.length <= REASONING_SUMMARY_MAX_LINE_CHARS));
});

test('can be switched off and is on by default', () => {
  assert.equal(reasoningSummaryEnabled({} as NodeJS.ProcessEnv), true);
  for (const v of ['off', '0', 'false', ' OFF ']) assert.equal(reasoningSummaryEnabled({ XROGA_REASONING_SUMMARY: v } as NodeJS.ProcessEnv), false);
});

test('makes no model call for an empty message and returns null without a valid tenant scope', async () => {
  const bad = { userId: 'u', context: undefined } as unknown as TenantModelScope;
  assert.equal(await generateReasoningSummary({ scope: bad, message: '   ' }), null);
  assert.equal(await generateReasoningSummary({ scope: bad, message: 'hi' }), null);
});

test('plan step lines are recognised and ordinary notes are left alone', () => {
  assert.equal(planStep('STEP: Compare both release lines'), 'Compare both release lines');
  assert.equal(planStep('step - ٹکٹ کی قیمت دیکھنا'), 'ٹکٹ کی قیمت دیکھنا');
  assert.equal(planStep('Stability matters here.'), null);
  assert.equal(cleanReasoningSummary('STEP: **Read** the file\nA note.'), 'STEP: Read the file\nA note.');
});
