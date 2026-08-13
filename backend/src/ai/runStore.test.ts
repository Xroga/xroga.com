import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  appendRunEvent,
  createRun,
  getRun,
  isRunCancellationRequested,
  requestRunCancellation,
} from './runStore.js';

describe('swarm run event replay', () => {
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
