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
} from './runStore.js';

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
