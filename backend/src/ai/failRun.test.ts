import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createRun, failRun, getRun } from './runStore.js';

/**
 * Cover for the code lost on the way to storage.
 *
 * `failRun` always wrote `code: 'BUILD_FAILED'` to the persisted row, whatever the real
 * reason was. The live SSE stream sent the accurate code (CAPACITY_UNAVAILABLE,
 * MODEL_CAP_REACHED, ...) in the moment, but anyone who reconnected or reloaded — the
 * exact situation a dropped SSE stream puts a user in — read back a generic failure
 * with no way to tell a pacing cap from an actual defect.
 */

function freshRun(): string {
  const runId = randomUUID();
  createRun('user-1', 'test prompt', runId);
  return runId;
}

test('without an explicit code, an error run still falls back to BUILD_FAILED', () => {
  const runId = freshRun();
  failRun(runId, 'boom');
  assert.equal(getRun(runId)?.output?.code, 'BUILD_FAILED');
});

test('the real reason code survives to the persisted row', () => {
  const runId = freshRun();
  failRun(runId, "Today's unlocked AI capacity is fully in use.", 'error', {
    code: 'CAPACITY_UNAVAILABLE',
  });
  assert.equal(getRun(runId)?.output?.code, 'CAPACITY_UNAVAILABLE');
});

test('nextUnlockAt survives to the persisted row when present', () => {
  const runId = freshRun();
  failRun(runId, 'capacity', 'error', {
    code: 'CAPACITY_UNAVAILABLE',
    nextUnlockAt: '2026-08-03T15:42:46.809Z',
  });
  assert.equal(getRun(runId)?.output?.nextUnlockAt, '2026-08-03T15:42:46.809Z');
});

test('a cancelled run is always BUILD_CANCELLED, even if a code was passed', () => {
  // Cancellation is a fact about how the run ended, not about why a reservation failed
  // — the status must win regardless of what extra.code says.
  const runId = freshRun();
  failRun(runId, 'stopped', 'cancelled', { code: 'CAPACITY_UNAVAILABLE' });
  assert.equal(getRun(runId)?.output?.code, 'BUILD_CANCELLED');
});

test('no nextUnlockAt field is written when none applies', () => {
  const runId = freshRun();
  failRun(runId, 'boom', 'error', { code: 'BUILD_FAILED' });
  assert.equal('nextUnlockAt' in (getRun(runId)?.output ?? {}), false);
});

test('an unknown run is a no-op, not a throw', () => {
  assert.equal(failRun(randomUUID(), 'boom'), null);
});
