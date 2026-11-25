import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REASONING_SUMMARY_MAX_CHARS, cleanReasoningSummary, generateReasoningSummary, reasoningSummaryEnabled,
} from './reasoningSummary.js';
import type { TenantModelScope } from './tenantModelDispatch.js';

test('keeps a plain approach note and strips markup, code and hidden thinking', () => {
  const out = cleanReasoningSummary(
    '<think>secret chain</think>**Compare** the two release lines first. ```js\nrun()\n``` Then recommend one for a new project.',
  );
  assert.ok(out);
  assert.doesNotMatch(out!, /secret|run\(\)|\*|`|<think>/);
  assert.match(out!, /Compare the two release lines first\./);
});

test('rejects empty or too-short output and bounds long output at a sentence', () => {
  assert.equal(cleanReasoningSummary('ok'), null);
  assert.equal(cleanReasoningSummary('   '), null);
  const long = 'This is a careful sentence about approach. '.repeat(30);
  const out = cleanReasoningSummary(long)!;
  assert.ok(out.length <= REASONING_SUMMARY_MAX_CHARS);
  assert.match(out, /\.$/);
});

test('can be switched off and is on by default', () => {
  assert.equal(reasoningSummaryEnabled({} as NodeJS.ProcessEnv), true);
  for (const v of ['off', '0', 'false', ' OFF ']) assert.equal(reasoningSummaryEnabled({ XROGA_REASONING_SUMMARY: v } as NodeJS.ProcessEnv), false);
});

test('makes no model call for short messages and returns null without a valid tenant scope', async () => {
  const bad = { userId: 'u', context: undefined } as unknown as TenantModelScope;
  assert.equal(await generateReasoningSummary({ scope: bad, message: 'hi' }), null);
  assert.equal(await generateReasoningSummary({ scope: bad, message: 'Compare Node.js and Next.js latest versions for a new project' }), null);
});
