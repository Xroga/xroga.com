import {
  randomUUID,
} from 'node:crypto';

import {
  describe,
  it,
} from 'node:test';

import assert from 'node:assert/strict';

import {
  createRunDurable,
  failRun,
  getRun,
  resumeRunDurable,
  withRunAttempt,
  completeRun,
  appendRunEvent,
  persistRunState,
} from './runStore.js';

it('old asynchronous callbacks cannot borrow a resumed attempt or mutate a run before admission', async () => {
  const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const runId = randomUUID();
    const owner = randomUUID();
    let release!: () => void;
    let ready!: () => void;
    const admitted = new Promise<void>(resolve => { ready = resolve; });
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const oldAttempt = withRunAttempt(async () => {
      await createRunDurable(owner, 'original', runId);
      failRun(runId, 'interrupted');
      ready();
      await blocked;
      assert.equal(appendRunEvent(runId, 'progress', { message: 'stale' }), null);
      assert.equal(completeRun(runId, { output: { stale: true } }), null);
      assert.equal(failRun(runId, 'stale failure'), null);
      await assert.rejects(persistRunState(runId), /unknown swarm run/);
    });
    await admitted;
    await withRunAttempt(async () => {
      assert.equal(appendRunEvent(runId, 'progress', { message: 'not admitted' }), null);
      assert.equal(failRun(runId, 'not admitted'), null);
      const resumed = await resumeRunDurable(owner, 'continue', runId);
      release();
      await oldAttempt;
      assert.equal(resumed.status, 'running');
      assert.equal(resumed.events.length, 0);
      assert.equal(completeRun(runId, { output: { fresh: true } })?.status, 'complete');
    });
  } finally {
    if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
  }
});

describe(
  'durable swarm run resume',
  () => {
    it(
      'reopens the same interrupted run without changing its id',
      async () => {
        const previousServiceRole =
          process.env
            .SUPABASE_SERVICE_ROLE_KEY;

        delete process.env
          .SUPABASE_SERVICE_ROLE_KEY;

        try {
          const runId =
            randomUUID();

          const userId =
            randomUUID();

          await createRunDurable(
            userId,
            'Build Jhon Mix',
            runId,
          );

          failRun(
            runId,
            'Build stopped.',
            'cancelled',
          );

          const resumed =
            await resumeRunDurable(
              userId,
              'Continue this build',
              runId,
            );

          assert.equal(
            resumed.id,
            runId,
          );

          assert.equal(
            resumed.status,
            'running',
          );

          assert.equal(
            resumed.completed_at,
            null,
          );

          assert.equal(
            getRun(
              runId,
            )?.status,
            'running',
          );
        } finally {
          if (
            previousServiceRole
          ) {
            process.env
              .SUPABASE_SERVICE_ROLE_KEY =
              previousServiceRole;
          } else {
            delete process.env
              .SUPABASE_SERVICE_ROLE_KEY;
          }
        }
      },
    );

    it(
      'refuses to resume a run owned by another user',
      async () => {
        const previousServiceRole =
          process.env
            .SUPABASE_SERVICE_ROLE_KEY;

        delete process.env
          .SUPABASE_SERVICE_ROLE_KEY;

        try {
          const runId =
            randomUUID();

          const owner =
            randomUUID();

          await createRunDurable(
            owner,
            'Build something',
            runId,
          );

          failRun(
            runId,
            'Stopped.',
            'cancelled',
          );

          await assert.rejects(
            () =>
              resumeRunDurable(
                randomUUID(),
                'Continue',
                runId,
              ),

            /checkpoint could not be found/i,
          );
        } finally {
          if (
            previousServiceRole
          ) {
            process.env
              .SUPABASE_SERVICE_ROLE_KEY =
              previousServiceRole;
          } else {
            delete process.env
              .SUPABASE_SERVICE_ROLE_KEY;
          }
        }
      },
    );
  },
);
