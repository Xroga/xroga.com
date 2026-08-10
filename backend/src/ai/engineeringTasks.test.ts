import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HANDLED_TASK_CLASSES, engineeringTaskHandlers } from './engineeringTasks.js';
import {
  ExecutionScheduler,
  InMemoryExecutionStateStore,
  createCanonicalExecutionState,
  type ExecutableTaskNode,
} from './executionRuntime.js';

/**
 * Command 3 §29A/§29C — engineering tasks execute, and cannot complete without evidence.
 *
 * The defect these cover: `pipeline.ts` pushed engineering tasks into canonical state and
 * marked two of them completed with an evidence sentence it composed itself, so a task was
 * recorded complete while no handler had run. `ExecutionScheduler` already gates completion
 * on `result.validated && !missingEvidence`; the guarantee was bypassed, not absent.
 */

function taskNode(overrides: Partial<ExecutableTaskNode> & { id: string; operationType: string }): ExecutableTaskNode {
  return {
    objective: `do ${overrides.operationType}`,
    requiredCapabilities: [overrides.operationType],
    selectedRuntime: null,
    selectedProvider: null,
    selectedModel: null,
    requiredContextReferences: [],
    allowedFiles: [],
    expectedOutputSchema: { description: 'test' },
    dependencies: [],
    riskLevel: 'low',
    timeoutMs: 5_000,
    retryPolicy: { maximumAttempts: 1, initialBackoffMs: 1, maximumBackoffMs: 2 },
    budget: { maximumTokens: 1_000 },
    validationMethod: [],
    evidenceRequirements: [],
    fallbackRoutes: [],
    status: 'ready',
    attempts: 0,
    evidence: [],
    ...overrides,
  } as ExecutableTaskNode;
}

function stateWith(tasks: ExecutableTaskNode[]) {
  const state = createCanonicalExecutionState({
    runId: 'run-test',
    projectId: 'project-test',
  });
  state.tasks.push(...tasks);
  return state;
}

const inputs = {
  classification: { requiresCoding: true, requiredCapabilities: ['cli_application', 'testing'] },
  files: [{ path: 'src/main.rs', content: 'fn main() {}' }, { path: 'Cargo.toml', content: '[package]' }],
  repository: 'Xroga/example',
};

test('handled engineering tasks complete through the scheduler with real evidence', async () => {
  const state = stateWith([
    taskNode({ id: 't1', operationType: 'request_understanding' }),
    taskNode({ id: 't2', operationType: 'repository_analysis' }),
  ]);

  await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(
    state,
    engineeringTaskHandlers(inputs),
  );

  for (const id of ['t1', 't2']) {
    const task = state.tasks.find((candidate) => candidate.id === id)!;
    assert.equal(task.status, 'completed', `${id}: ${task.blocker ?? ''}`);
    assert.ok(task.evidence.length > 0, `${id} completed without evidence`);
    // Evidence must be bound to the artifact, not narrated about it.
    assert.match(task.evidence[0]!.identifier ?? '', /^sha256:[0-9a-f]{64}$/);
  }
});

test('repository evidence reports the real file count, not a fabricated one', async () => {
  const state = stateWith([taskNode({ id: 't2', operationType: 'repository_analysis' })]);
  await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(state, engineeringTaskHandlers(inputs));

  const task = state.tasks.find((candidate) => candidate.id === 't2')!;
  assert.match(task.evidence[0]!.summary, /Read 2 existing files from Xroga\/example/);
  assert.deepEqual((task.output as { paths: string[] }).paths, ['Cargo.toml', 'src/main.rs']);
});

test('an empty repository is reported as new, not as inspected files', async () => {
  const state = stateWith([taskNode({ id: 't2', operationType: 'repository_analysis' })]);
  await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(
    state,
    engineeringTaskHandlers({ ...inputs, files: [], repository: null }),
  );

  const task = state.tasks.find((candidate) => candidate.id === 't2')!;
  assert.equal(task.status, 'completed');
  assert.match(task.evidence[0]!.summary, /no existing files/i);
  assert.match(task.evidence[0]!.summary, /new project/i);
  assert.doesNotMatch(task.evidence[0]!.summary, /inspected/i);
});

test('a classification naming no capability does not pass understanding', async () => {
  const state = stateWith([taskNode({ id: 't1', operationType: 'request_understanding' })]);
  await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(
    state,
    engineeringTaskHandlers({ ...inputs, classification: { requiresCoding: true, requiredCapabilities: [] } }),
  );

  const task = state.tasks.find((candidate) => candidate.id === 't1')!;
  assert.equal(task.status, 'failed');
  assert.match(task.blocker ?? '', /did not pass its validation rule/);
});

test('a task class with no handler is blocked, never completed', async () => {
  // The truthful record while the canonical runtime does not yet implement. The failure
  // this guards against is the original defect: an unexecuted task recorded as completed.
  const state = stateWith([taskNode({ id: 't9', operationType: 'implementation' })]);
  await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(state, engineeringTaskHandlers(inputs));

  const task = state.tasks.find((candidate) => candidate.id === 't9')!;
  assert.equal(task.status, 'blocked');
  assert.match(task.blocker ?? '', /no handler for implementation/);
  assert.equal(task.evidence.length, 0);
});

test('the handled set is exactly what the handler map provides', () => {
  const handlers = Object.keys(engineeringTaskHandlers(inputs)).sort();
  assert.deepEqual(handlers, [...HANDLED_TASK_CLASSES].sort());
});
