import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SwarmRunSummary } from './api';
import { recoverLegacyLandingRun } from './legacyLandingRunRecovery';

function summary(id: string, prompt: string, createdAt: string): SwarmRunSummary {
  return {
    id,
    prompt,
    status: 'complete',
    output: null,
    created_at: createdAt,
    completed_at: createdAt,
    iteration_count: 1,
  };
}

test('legacy terminal recovery skips a failed retry and restores the newest real landing artifact', async () => {
  const history = [
    summary('failed-latest', 'Update Orbit Coffee', '2026-08-22T10:00:00.000Z'),
    summary('real-build', 'Update   Orbit Coffee', '2026-08-22T09:00:00.000Z'),
    summary('different', 'Build another product', '2026-08-22T11:00:00.000Z'),
  ];
  const requested: string[] = [];

  const recovered = await recoverLegacyLandingRun(
    history,
    ['Update Orbit Coffee'],
    async (runId) => {
      requested.push(runId);
      return {
        ...history.find((run) => run.id === runId)!,
        output:
          runId === 'real-build'
            ? { type: 'landing_page', html: '<main>Orbit Coffee</main>' }
            : { type: 'error', code: 'CAPACITY_UNAVAILABLE' },
      };
    }
  );

  assert.deepEqual(requested, ['failed-latest', 'real-build']);
  assert.equal(recovered?.id, 'real-build');
  assert.equal((recovered?.output as { html?: string }).html, '<main>Orbit Coffee</main>');
});

test('legacy terminal recovery returns null when no matching run owns real HTML', async () => {
  const history = [summary('failed', 'Update Orbit Coffee', '2026-08-22T10:00:00.000Z')];
  const recovered = await recoverLegacyLandingRun(history, ['Different prompt'], async () => {
    throw new Error('must not be called');
  });
  assert.equal(recovered, null);
});
