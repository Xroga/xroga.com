import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createCanonicalExecutionState,
  type ExecutableTaskNode,
} from '../../ai/executionRuntime.js';
import {
  appendMissingExecutionTasks,
  recoverCanonicalExecutionStateForResume,
  UNCERTAIN_SIDE_EFFECT_PREFIX,
} from './canonicalResume.js';

function task(input: {
  id: string;
  operationType: string;
  status: ExecutableTaskNode['status'];
  dependencies?: string[];
  allowedFiles?: string[];
  attempts?: number;
  started?: boolean;
}): ExecutableTaskNode {
  return {
    id: input.id,
    objective: input.id,
    operationType: input.operationType,
    requiredCapabilities: [],
    selectedRuntime: null,
    selectedProvider: null,
    selectedModel: null,
    requiredContextReferences: [],
    allowedFiles: input.allowedFiles ?? [],
    expectedOutputSchema: {},
    dependencies: input.dependencies ?? [],
    riskLevel: 'low',
    timeoutMs: 60_000,
    retryPolicy: {
      maximumAttempts: 2,
      initialBackoffMs: 10,
      maximumBackoffMs: 100,
    },
    budget: {},
    validationMethod: [],
    evidenceRequirements: [],
    fallbackRoutes: [],
    status: input.status,
    attempts: input.attempts ?? 0,
    evidence: [],
    ...(input.started
      ? { startedAt: '2026-09-29T12:00:00.000Z' }
      : {}),
  };
}

describe('Step 7A canonical recovery', () => {
  it('resumes checkpoint-backed implementation without repeating completed work', () => {
    const state = createCanonicalExecutionState({
      projectId: 'project-1',
      runId: 'run-1',
      tasks: [
        task({
          id: 'understand',
          operationType: 'read',
          status: 'completed',
        }),
        task({
          id: 'universal-implementation',
          operationType: 'multi_file_implementation',
          status: 'running',
          dependencies: ['understand'],
          allowedFiles: ['src/app.ts'],
          attempts: 1,
          started: true,
        }),
      ],
    });

    const recovered = recoverCanonicalExecutionStateForResume(state);
    const completed = recovered.state.tasks.find(
      (item) => item.id === 'understand',
    )!;
    const implementation = recovered.state.tasks.find(
      (item) => item.id === 'universal-implementation',
    )!;

    assert.equal(completed.status, 'completed');
    assert.equal(implementation.status, 'ready');
    assert.equal(implementation.attempts, 0);
    assert.equal(implementation.startedAt, undefined);
    assert.deepEqual(recovered.resumedTaskIds, ['universal-implementation']);
  });

  it('does not replay an interrupted external side effect', () => {
    const state = createCanonicalExecutionState({
      projectId: 'project-1',
      runId: 'run-1',
      tasks: [
        task({
          id: 'publish',
          operationType: 'github_publishing',
          status: 'running',
          attempts: 1,
          started: true,
        }),
      ],
    });

    const recovered = recoverCanonicalExecutionStateForResume(state);
    const publish = recovered.state.tasks[0]!;

    assert.equal(publish.status, 'blocked');
    assert.match(
      publish.blocker ?? '',
      new RegExp(`^${UNCERTAIN_SIDE_EFFECT_PREFIX}`),
    );
    assert.deepEqual(recovered.blockedUncertainTaskIds, ['publish']);
  });

  it('does not append the same route task twice after resume', () => {
    const existing = task({
      id: 'task-a',
      operationType: 'read',
      status: 'completed',
    });

    const state = createCanonicalExecutionState({
      projectId: 'project-1',
      runId: 'run-1',
      tasks: [existing],
    });

    const added = appendMissingExecutionTasks(state, [
      existing,
      task({
        id: 'task-b',
        operationType: 'validate',
        status: 'ready',
      }),
    ]);

    assert.equal(added, 1);
    assert.deepEqual(
      state.tasks.map((item) => item.id),
      ['task-a', 'task-b'],
    );
  });

  it('locks production wiring to durable canonical recovery', () => {
    const pipeline = readFileSync(
      new URL('../../ai/pipeline.ts', import.meta.url),
      'utf8',
    );
    const runStore = readFileSync(
      new URL('../../ai/runStore.ts', import.meta.url),
      'utf8',
    );
    const swarm = readFileSync(
      new URL('../../routes/swarm.ts', import.meta.url),
      'utf8',
    );
    const canonicalTasks = readFileSync(
      new URL('../universalCanonicalTasks.ts', import.meta.url),
      'utf8',
    );

    assert.match(pipeline, /recoverCanonicalExecutionStateForResume/);
    assert.match(pipeline, /appendMissingExecutionTasks/);
    assert.match(pipeline, /synthesisArtifactsFromCanonicalState/);
    assert.match(
      runStore,
      /\.in\(\s*['"]status['"]\s*,\s*\[\s*['"]error['"]\s*,\s*['"]cancelled['"]/s,
    );
    assert.match(swarm, /activeBuildControllers\.has\(\s*runId\s*\)/s);
    assert.match(canonicalTasks, /store\.load\(\s*input\.runId\s*\)/s);
    assert.match(canonicalTasks, /UNCERTAIN_SIDE_EFFECT_PREFIX/);
  });
});
