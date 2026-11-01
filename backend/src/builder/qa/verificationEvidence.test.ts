import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gateQaReport } from './verificationEvidence.js';
import type { QaCheckResult, QaReport } from './types.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);

const check = (id: string, over: Partial<QaCheckResult> = {}): QaCheckResult => ({
  id, title: `check ${id}`, category: 'functional', viewport: 'desktop', required: true, status: 'passed', executed: true,
  failureClass: null, durationMs: 10, pendingReason: null, evidence: null, regression: false, ...over,
} as unknown as QaCheckResult);

const report = (checks: QaCheckResult[], status: QaReport['status'] = 'passed'): QaReport => ({
  version: 1, status, executedChecks: checks.length, passedChecks: checks.length, failedChecks: 0, pendingChecks: 0, checks, notChecked: [],
  environment: { driver: 'fake', browser: null, baseHost: null }, startedAt: 't', finishedAt: 't', reason: '',
} as unknown as QaReport);

const input = (r: QaReport, tested = A, delivered = A) => ({ report: r, runId: 'run-1', projectId: 'project-1', revisionContentSha256: delivered, testedContentSha256: tested });

test('positive control: every required check executed and passed on the recorded revision', () => {
  assert.equal(gateQaReport(input(report([check('home'), check('contact-form'), check('mobile-menu')])))?.outcome, 'verified');
});

test('checks that ran on one revision never verify another (Golden R, Batch 2 path)', () => {
  const result = gateQaReport(input(report([check('home')]), A, B));
  assert.notEqual(result?.outcome, 'verified');
});

test('the gate does not apply when nothing is claimed verified or required checks were not executed here', () => {
  assert.equal(gateQaReport(input(report([check('home')], 'failed'))), null);
  assert.equal(gateQaReport(input(report([]))), null);
  // an incremental run that carried a pass forward without executing it is outside the gate, and the existing rule stands
  assert.equal(gateQaReport(input(report([check('home', { executed: false })]))), null);
});

test('an optional check that did not run does not block verification of the required ones', () => {
  assert.equal(gateQaReport(input(report([check('home'), check('extra', { required: false, status: 'pending', executed: false })])))?.outcome, 'verified');
});

test('a required check that failed or was left pending after a claimed pass cannot verify', () => {
  assert.equal(gateQaReport(input(report([check('home'), check('form', { status: 'failed' })])))?.outcome, 'failed');
  assert.notEqual(gateQaReport(input(report([check('home'), check('form', { status: 'pending' })])))?.outcome, 'verified');
});
