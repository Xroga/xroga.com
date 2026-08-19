import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildEngineeringArtifact, isEngineeringArtifact } from './engineeringArtifact.js';
import { completeRun, createRun, failRun, getRun } from './runStore.js';

/**
 * Durability of the final engineering artifact.
 *
 * The invariant: a run that produced real work must be reconstructible from the persisted
 * record alone, with zero SSE bytes delivered. These tests exercise the store directly,
 * because the store *is* what the recovery path reads — asserting against a mock of it would
 * pass while the real record lost the artifact, which is precisely the class of defect here.
 */

const artifactOutput = () =>
  buildEngineeringArtifact({
    outcome: 'blocked',
    phaseReached: 'validation',
    verified: false,
    reason: 'typecheck failed',
    blockers: ['TS2345 in src/app/page.tsx'],
    commitSha: 'deadbeef1234',
    files: ['src/app/page.tsx', 'src/lib/util.ts'],
    evidence: [{ phase: 'implementation', statement: '2 files written', detail: '' }],
    repository: { owner: 'acme', repo: 'site', branch: 'xroga/run-1', resultingCommitSha: 'deadbeef1234', verified: true },
  });

test('a blocked run persists its full artifact, not a generic error', () => {
  // `completeRun(..., success: false)` marks the row `error` while keeping the artifact. The
  // recovery path reads exactly this record.
  const runId = `run-${Math.random().toString(36).slice(2)}`;
  createRun('user-1', 'add pagination', runId);
  completeRun(runId, { output: artifactOutput(), featureCategory: 'universal', success: false });

  const record = getRun(runId)!;
  assert.equal(record.status, 'error');
  assert.ok(isEngineeringArtifact(record.output), 'the artifact must survive on the record');
  const artifact = record.output as ReturnType<typeof artifactOutput>;
  assert.equal(artifact.blockers[0], 'TS2345 in src/app/page.tsx');
  assert.equal(artifact.fileCount, 2);
  assert.equal(artifact.commitSha, 'deadbeef1234');
});

test('failRun preserves an artifact that already exists on the record', () => {
  // The defect: failRun assigned `rec.output` unconditionally, destroying the result of any
  // run that produced files and a commit and then threw late.
  const runId = `run-${Math.random().toString(36).slice(2)}`;
  createRun('user-1', 'add pagination', runId);
  completeRun(runId, { output: artifactOutput(), featureCategory: 'universal', success: false });

  failRun(runId, 'Provider timed out while publishing', 'error', { code: 'BUILD_FAILED' });

  const record = getRun(runId)!;
  assert.ok(isEngineeringArtifact(record.output), 'the artifact must survive failRun');
  const output = record.output as Record<string, unknown>;
  assert.equal(output.fileCount, 2, 'the file manifest must survive');
  assert.equal(output.commitSha, 'deadbeef1234', 'the commit must survive');
  // And the failure is still recorded alongside it, not instead of it.
  assert.equal(output.error, 'Provider timed out while publishing');
  assert.equal(output.code, 'BUILD_FAILED');
});

test('failRun on a run with no artifact still records a plain error', () => {
  // The direction check: preserving artifacts must not stop ordinary failures being recorded.
  const runId = `run-${Math.random().toString(36).slice(2)}`;
  createRun('user-1', 'add pagination', runId);
  failRun(runId, 'Out of actions', 'error', { code: 'OUT_OF_ACTIONS' });

  const record = getRun(runId)!;
  const output = record.output as Record<string, unknown>;
  assert.equal(output.type, 'error');
  assert.equal(output.error, 'Out of actions');
  assert.equal(output.code, 'OUT_OF_ACTIONS');
});

test('a cancelled run keeps its artifact and reports cancellation', () => {
  const runId = `run-${Math.random().toString(36).slice(2)}`;
  createRun('user-1', 'add pagination', runId);
  completeRun(runId, { output: artifactOutput(), featureCategory: 'universal', success: false });
  failRun(runId, 'Cancelled by user', 'cancelled');

  const record = getRun(runId)!;
  assert.equal(record.status, 'cancelled');
  assert.ok(isEngineeringArtifact(record.output));
  assert.equal((record.output as Record<string, unknown>).code, 'BUILD_CANCELLED');
});

test('a verified run persists as complete with its artifact intact', () => {
  const runId = `run-${Math.random().toString(36).slice(2)}`;
  createRun('user-1', 'add pagination', runId);
  const verified = buildEngineeringArtifact({
    outcome: 'completed',
    phaseReached: 'complete',
    verified: true,
    reason: 'all checks passed',
    blockers: [],
    commitSha: 'cafe1234',
    files: ['src/a.ts'],
    evidence: [{ phase: 'validation', statement: 'build succeeded', detail: 'exit 0' }],
  });
  completeRun(runId, { output: verified, featureCategory: 'universal', success: true });

  const record = getRun(runId)!;
  assert.equal(record.status, 'complete');
  assert.ok(isEngineeringArtifact(record.output));
  assert.equal((record.output as Record<string, unknown>).status, 'verified');
});

test('the persisted artifact is small enough to travel over SSE', () => {
  // Repository and sandbox storage stay authoritative for source; this must never carry it.
  const runId = `run-${Math.random().toString(36).slice(2)}`;
  createRun('user-1', 'big build', runId);
  const many = buildEngineeringArtifact({
    outcome: 'completed',
    phaseReached: 'complete',
    verified: true,
    reason: 'ok',
    blockers: [],
    files: Array.from({ length: 400 }, (_, index) => `src/generated/file-${index}.ts`),
    evidence: [],
  });
  completeRun(runId, { output: many, featureCategory: 'universal', success: true });
  const serialized = JSON.stringify(getRun(runId)!.output);
  assert.ok(serialized.length < 80_000, `persisted artifact was ${serialized.length} bytes`);
});
