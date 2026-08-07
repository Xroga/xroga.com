/**
 * The frontend copy of the lifecycle must not drift from the backend's.
 *
 * The two are separate npm workspaces with no shared package, so the state list is
 * duplicated. Duplication is acceptable only while it is enforced, which is what this
 * file does: it reads the backend source off disk and compares the state lists directly.
 * Add a state on one side and this fails.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  SUCCESS_STATES,
  VERIFICATION_STATES,
  isProductionVerified,
  isSuccessState,
  isVerificationState,
  verificationLabel,
  type VerificationState,
} from './verificationLifecycle';

/** Pulls a `const X = [...] as const` string-literal array out of TypeScript source. */
function readStateArray(source: string, name: string): string[] {
  const marker = `${name} = [`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `could not find ${name} in the backend source`);
  const end = source.indexOf('] as const', start);
  assert.notEqual(end, -1, `could not find the end of ${name}`);
  const body = source.slice(start + marker.length, end);
  return [...body.matchAll(/'([a-z_]+)'/g)].map((match) => match[1]);
}

const BACKEND_SOURCE = join(
  process.cwd(),
  process.cwd().endsWith('frontend') ? '..' : '.',
  'backend',
  'src',
  'ai',
  'verificationLifecycle.ts',
);

test('the backend and frontend state lists are identical and in the same order', () => {
  // Normalise line endings: this file is read as text and compared, and a CRLF checkout
  // must not change the answer.
  const source = readFileSync(BACKEND_SOURCE, 'utf8').replace(/\r\n/g, '\n');
  const backendStates = readStateArray(source, 'VERIFICATION_STATES');

  assert.deepEqual(
    [...VERIFICATION_STATES],
    backendStates,
    'the frontend lifecycle has drifted from the backend lifecycle',
  );
});

test('the two success sets agree', () => {
  const source = readFileSync(BACKEND_SOURCE, 'utf8').replace(/\r\n/g, '\n');
  const marker = 'SUCCESS_STATES: readonly VerificationState[] = [';
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, 'could not find SUCCESS_STATES in the backend source');
  const end = source.indexOf('];', start);
  const backendSuccess = [...source.slice(start, end).matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

  assert.deepEqual([...SUCCESS_STATES], backendSuccess, 'success states have drifted');
});

test('a generated preview is never labelled as verified or successful', () => {
  assert.equal(isSuccessState('generated_unverified'), false);
  assert.match(verificationLabel('generated_unverified'), /not verified/i);
});

test('a reported deployment is not the same as a live check', () => {
  assert.equal(isProductionVerified('deployed'), false);
  assert.equal(isProductionVerified('production_verified'), true);
  assert.match(verificationLabel('deployed'), /pending/i);
});

test('the words that used to stand in for success are not states', () => {
  for (const word of ['generated', 'accepted', 'preview available', 'files extracted', 'ok', 'shipped']) {
    assert.equal(isVerificationState(word), false, `"${word}" must not be a lifecycle state`);
    assert.equal(isSuccessState(word), false, `"${word}" must never read as success`);
  }
});

test('every state has a label', () => {
  for (const state of VERIFICATION_STATES) {
    assert.ok(verificationLabel(state as VerificationState).length > 0, `${state} needs a label`);
  }
});
