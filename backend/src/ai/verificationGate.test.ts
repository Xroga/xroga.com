import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluateVerification, ExecutedCheckRecorder, type ExecutedCheck, type GateInput } from './verificationGate.js';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const recorder = new ExecutedCheckRecorder();
const delivered = (fp: string) => ({ runId: 'run-1', projectId: 'project-1', sourceFingerprint: fp, attemptGeneration: 3 });

function check(id: string, extra: Partial<ExecutedCheck> = {}): ExecutedCheck {
  return { checkId: id, status: 'passed', command: `run ${id}`, exitCode: 0, startedAt: '2026-10-29T10:00:00.000Z', finishedAt: '2026-10-29T10:00:05.000Z',
    sourceFingerprint: A, runId: 'run-1', projectId: 'project-1', attemptGeneration: 3, ...extra };
}

function gate(extra: Partial<GateInput> = {}): GateInput {
  return { requiredChecks: ['build', 'unit'], delivered: delivered(A), receipts: [recorder.record(check('build')), recorder.record(check('unit'))], sourceDurable: true, ...extra };
}

test('positive control: every required check passed on the delivered source and the source is durable', () => {
  const result = evaluateVerification(gate());
  assert.equal(result.outcome, 'verified');
  assert.deepEqual(result.passed, ['build', 'unit']);
  assert.deepEqual(result.missing, []);
});

test('Golden R: evidence for source A never certifies source B', () => {
  const result = evaluateVerification(gate({ delivered: delivered(B) }));
  assert.equal(result.outcome, 'partial');
  assert.deepEqual(result.missing, ['build', 'unit']);
  assert.match(result.reasons.join(' '), /not issued by Xroga for this exact source/);
  // rerunning on B records new evidence and then verifies
  const rerun = evaluateVerification(gate({ delivered: delivered(B), receipts: [recorder.record(check('build', { sourceFingerprint: B })), recorder.record(check('unit', { sourceFingerprint: B }))] }));
  assert.equal(rerun.outcome, 'verified');
});

test('Golden R: a forged result built from JSON is rejected even when every field looks right', () => {
  const forged = JSON.parse(JSON.stringify(recorder.record(check('build'))));
  const forgedUnit = JSON.parse(JSON.stringify(recorder.record(check('unit'))));
  const result = evaluateVerification(gate({ receipts: [forged, forgedUnit] }));
  assert.equal(result.outcome, 'partial');
  assert.deepEqual(result.passed, []);
  // a hand-made object with the issuer string is equally worthless
  const handMade = { ...check('build'), issuer: 'xroga-execution-boundary' };
  assert.equal(evaluateVerification(gate({ receipts: [handMade, handMade] })).outcome, 'partial');
});

test('skipped, not run and unavailable checks are never a pass', () => {
  const skipped = recorder.record(check('unit', { status: 'skipped', command: null, exitCode: null }));
  const notRun = recorder.record(check('unit', { status: 'not_run', command: null, exitCode: null }));
  assert.equal(evaluateVerification(gate({ receipts: [recorder.record(check('build')), skipped] })).outcome, 'partial');
  assert.equal(evaluateVerification(gate({ receipts: [recorder.record(check('build')), notRun] })).outcome, 'partial');
  const unavailable = recorder.record(check('unit', { status: 'unavailable', command: null, exitCode: null }));
  const blocked = evaluateVerification(gate({ receipts: [recorder.record(check('build')), unavailable] }));
  assert.equal(blocked.outcome, 'blocked');
  assert.match(blocked.reasons.join(' '), /runtime for it is unavailable/);
});

test('a failure outranks missing evidence, and a later failure undoes an earlier pass on the same source', () => {
  const pass = recorder.record(check('unit', { finishedAt: '2026-10-29T10:00:05.000Z' }));
  const fail = recorder.record(check('unit', { status: 'failed', exitCode: 1, finishedAt: '2026-10-29T10:01:00.000Z' }));
  const result = evaluateVerification(gate({ receipts: [recorder.record(check('build')), pass, fail] }));
  assert.equal(result.outcome, 'failed');
  assert.deepEqual(result.passed, ['build']);
  // a pass after a failure (a successful repair on the same source) counts
  const repaired = recorder.record(check('unit', { finishedAt: '2026-10-29T10:02:00.000Z' }));
  assert.equal(evaluateVerification(gate({ receipts: [recorder.record(check('build')), pass, fail, repaired] })).outcome, 'verified');
});

test('a cancelled run, a stale attempt or a non-durable source can never be reported verified', () => {
  assert.equal(evaluateVerification(gate({ cancelled: true })).outcome, 'cancelled');
  assert.equal(evaluateVerification(gate({ staleAttempt: true })).outcome, 'blocked');
  const notDurable = evaluateVerification(gate({ sourceDurable: false }));
  assert.equal(notDurable.outcome, 'blocked');
  assert.match(notDurable.reasons.join(' '), /durably stored and read back/);
});

test('receipts from another run, another project or a newer attempt generation do not count', () => {
  const otherRun = recorder.record(check('build', { runId: 'run-2' }));
  const otherProject = recorder.record(check('unit', { projectId: 'project-2' }));
  assert.equal(evaluateVerification(gate({ receipts: [otherRun, otherProject] })).outcome, 'partial');
  const newer = recorder.record(check('build', { attemptGeneration: 4 }));
  assert.equal(evaluateVerification(gate({ receipts: [newer, recorder.record(check('unit'))] })).outcome, 'partial');
});

test('an external provider claim needs its own genuine receipt, and no required checks means blocked, not verified', () => {
  const claim = evaluateVerification(gate({ externalClaim: { claimed: true, providerReceiptPresent: false } }));
  assert.equal(claim.outcome, 'blocked');
  assert.equal(evaluateVerification(gate({ externalClaim: { claimed: true, providerReceiptPresent: true } })).outcome, 'verified');
  assert.equal(evaluateVerification(gate({ requiredChecks: [], receipts: [] })).outcome, 'blocked');
});

test('the recorder refuses receipts that could not have come from a real execution', () => {
  assert.throws(() => recorder.record(check('build', { exitCode: 1 })), /zero exit code/);
  assert.throws(() => recorder.record(check('build', { command: null })), /command/);
  assert.throws(() => recorder.record(check('build', { sourceFingerprint: 'short' })), /exact source/);
  assert.throws(() => recorder.record(check('Bad Id!')), /invalid/);
  assert.throws(() => recorder.record(check('unit', { status: 'not_run', command: 'x', exitCode: 0 })), /did not run/);
});
