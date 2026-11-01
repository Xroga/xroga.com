import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SoftwarePreviewEvidence } from '../../ai/softwareAgent/contracts.js';
import { gateChange, type ChangeGateInput } from './verificationEvidence.js';
import type { TestRunResult } from './testRunner.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

const tests = (status: TestRunResult['status']): TestRunResult => ({
  status, plan: {} as TestRunResult['plan'], summary: status, evidence: '', durationMs: 5,
  stages: [{ id: 't', label: 'npm test', kind: 'test', exitCode: status === 'passed' ? 0 : 1 } as TestRunResult['stages'][number]],
});
const preview = (status: 'passed' | 'failed' | 'not_checked'): SoftwarePreviewEvidence => ({ status, attempted: status !== 'not_checked', url: null, notCheckedReason: status === 'not_checked' ? 'sandbox_unavailable' : undefined } as unknown as SoftwarePreviewEvidence);

function input(over: Partial<ChangeGateInput> = {}): ChangeGateInput {
  return { runId: 'run-1', projectId: 'binding-1', testedDigest: A, deliveredDigest: A, tests: tests('passed'), preview: null, owesBrowser: false, sourceComplete: true, ...over };
}

test('positive control: tests passed on exactly the delivered change set', () => {
  assert.equal(gateChange(input()).outcome, 'verified');
});

test('tests that ran on a different change set than the one delivered never verify (Golden R, Batch 3 path)', () => {
  const result = gateChange(input({ testedDigest: A, deliveredDigest: B }));
  assert.notEqual(result.outcome, 'verified');
  assert.match(result.reasons.join(' '), /exact source/);
});

test('failed, unavailable, unsupported and timed-out tests never verify', () => {
  assert.equal(gateChange(input({ tests: tests('failed') })).outcome, 'failed');
  assert.equal(gateChange(input({ tests: tests('unavailable') })).outcome, 'blocked');
  assert.equal(gateChange(input({ tests: tests('unsupported') })).outcome, 'partial');
  assert.equal(gateChange(input({ tests: tests('timeout') })).outcome, 'partial');
  assert.equal(gateChange(input({ tests: null, testedDigest: null })).outcome, 'partial');
});

test('a visual change needs a passing browser observation for the same change set', () => {
  assert.equal(gateChange(input({ owesBrowser: true, preview: preview('passed') })).outcome, 'verified');
  assert.equal(gateChange(input({ owesBrowser: true, preview: preview('not_checked') })).outcome, 'partial');
  assert.equal(gateChange(input({ owesBrowser: true, preview: preview('failed') })).outcome, 'failed');
  assert.equal(gateChange(input({ owesBrowser: true, preview: null })).outcome, 'partial');
});

test('a visual change with no native test runner is verified by the browser alone, and still needs it', () => {
  assert.equal(gateChange(input({ tests: tests('unsupported'), owesBrowser: true, preview: preview('passed') })).outcome, 'verified');
  assert.equal(gateChange(input({ tests: tests('unsupported'), owesBrowser: true, preview: preview('not_checked') })).outcome, 'partial');
  assert.equal(gateChange(input({ tests: tests('unsupported'), owesBrowser: false })).outcome, 'partial');
});

test('an incomplete working copy or a cancelled run cannot verify', () => {
  assert.equal(gateChange(input({ sourceComplete: false })).outcome, 'blocked');
  assert.equal(gateChange(input({ cancelled: true })).outcome, 'cancelled');
});
