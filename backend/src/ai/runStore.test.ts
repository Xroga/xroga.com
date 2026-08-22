import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  appendRunEvent,
  createRun,
  getRun,
  isRunCancellationRequested,
  mergeRunHistory,
  requestRunCancellation,
  type SwarmRunRecord,
} from './runStore.js';

function runRecord(id: string, createdAt: string, prompt: string): SwarmRunRecord {
  return {
    id,
    userId: 'user-1',
    prompt,
    status: 'complete',
    output: null,
    created_at: createdAt,
    completed_at: createdAt,
    iteration_count: 1,
    events: [],
    lastSequence: 0,
  };
}

describe('swarm run event replay', () => {
  it('merges a partial hot cache with durable history and prefers live state', () => {
    const older = runRecord('older', '2026-08-20T10:00:00.000Z', 'older build');
    const persistedNewest = runRecord('newest', '2026-08-22T10:00:00.000Z', 'persisted');
    const hotNewest = { ...persistedNewest, prompt: 'live state', status: 'running' as const };

    const merged = mergeRunHistory([older, persistedNewest], [hotNewest], 30);

    assert.deepEqual(merged.map((run) => run.id), ['newest', 'older']);
    assert.equal(merged[0]?.prompt, 'live state');
    assert.equal(merged[0]?.status, 'running');
  });

  it('assigns stable monotonic sequences and supports after-sequence replay', () => {
    const runId = randomUUID();
    createRun(randomUUID(), 'test build', runId);

    const first = appendRunEvent(runId, 'progress', { message: 'Read repository' });
    const second = appendRunEvent(runId, 'progress', { message: 'Validated build' });
    const run = getRun(runId);

    assert.equal(first?.sequence, 1);
    assert.equal(second?.sequence, 2);
    assert.equal(run?.lastSequence, 2);
    assert.deepEqual(
      run?.events.filter((event) => event.sequence > 1).map((event) => event.data.message),
      ['Validated build'],
    );
  });

  it('redacts credentials before progress enters the replay journal', () => {
    const runId = randomUUID();
    createRun(randomUUID(), 'test build', runId);

    const event = appendRunEvent(runId, 'progress', {
      message: 'Provider connected',
      authorization: 'Bearer should-never-persist',
      nested: { databaseUrl: 'sensitive test connection' },
    });

    assert.equal(event?.data.authorization, '[REDACTED]');
    assert.deepEqual(event?.data.nested, { databaseUrl: '[REDACTED]' });
  });

  it('makes cancellation durable to the local worker immediately', async () => {
    const previousServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      const runId = randomUUID();
      const userId = randomUUID();
      createRun(userId, 'test cancellation', runId);

      assert.equal(await requestRunCancellation(runId, userId), true);
      assert.equal(await isRunCancellationRequested(runId), true);
      assert.equal(getRun(runId)?.status, 'cancelled');
      assert.equal(
        (getRun(runId)?.output as { code?: string } | null)?.code,
        'BUILD_CANCELLED',
      );
    } finally {
      if (previousServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previousServiceKey;
    }
  });
});
