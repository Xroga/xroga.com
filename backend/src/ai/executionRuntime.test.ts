import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CanonicalMutationService,
  ExecutionScheduler,
  InMemoryExecutionStateStore,
  createCanonicalExecutionState,
  evaluateFinalExecution,
  type ExecutableTaskNode,
  type ExecutionEvidence,
  executableTasksFromRoutePlan,
} from './executionRuntime.js';
import { createIntelligentRoutePlan } from './intelligentRouter.js';
import { getRuntimeModelRegistry } from './modelCapabilityRegistry.js';

function node(id: string, operationType: string, dependencies: string[] = [], allowedFiles: string[] = []): ExecutableTaskNode {
  return {
    id, objective: id, operationType, requiredCapabilities: [operationType], selectedRuntime: 'node', selectedProvider: null,
    selectedModel: null, requiredContextReferences: [], allowedFiles, expectedOutputSchema: { type: 'object' }, dependencies,
    riskLevel: allowedFiles.length ? 'medium' : 'low', timeoutMs: 2_000,
    retryPolicy: { maximumAttempts: 2, initialBackoffMs: 10, maximumBackoffMs: 100 }, budget: {},
    validationMethod: ['handler validation'], evidenceRequirements: ['operation evidence'], fallbackRoutes: [],
    status: dependencies.length ? 'pending' : 'ready', attempts: 0, evidence: [],
  };
}

const evidence = (kind: string): ExecutionEvidence[] => [{ id: `${kind}-evidence`, kind, summary: `${kind} executed`, timestamp: new Date().toISOString() }];

test('route plans become persisted executable nodes with all control metadata', () => {
  const registry = getRuntimeModelRegistry().map((model) => ({ ...model, configured: true, enabled: true }));
  const tasks = executableTasksFromRoutePlan(createIntelligentRoutePlan({ prompt: 'Build an unknown data tool and test it', registry }));
  assert.ok(tasks.length > 1);
  assert.ok(tasks.every((task) => task.id && task.objective && task.operationType && task.requiredCapabilities.length && task.expectedOutputSchema && task.retryPolicy.maximumAttempts && task.validationMethod.length && task.evidenceRequirements.length));
  assert.ok(tasks.every((task) => task.status !== 'completed'));
});

test('scheduler executes dependencies, preserves independent work, and never completes plans without evidence', async () => {
  const store = new InMemoryExecutionStateStore();
  const state = createCanonicalExecutionState({ projectId: 'p', runId: 'r', tasks: [
    node('inspect', 'inspect'), node('research', 'research'), node('mutate', 'mutate', ['inspect'], ['src/a.ts']), node('validate', 'validate', ['mutate']),
  ] });
  const order: string[] = [];
  const scheduler = new ExecutionScheduler(store);
  await scheduler.run(state, {
    inspect: async (task) => { order.push(task.id); return { output: {}, evidence: evidence('repository_read'), validated: true }; },
    research: async (task) => { order.push(task.id); return { output: {}, evidence: evidence('research'), validated: true }; },
    mutate: async (task) => { order.push(task.id); return { output: {}, evidence: evidence('file_mutation'), validated: true }; },
    validate: async (task) => { order.push(task.id); return { output: {}, evidence: [], validated: true }; },
  });
  assert.equal(state.tasks.find((task) => task.id === 'validate')?.status, 'failed');
  assert.equal(state.tasks.find((task) => task.id === 'research')?.status, 'completed');
  assert.ok(order.indexOf('mutate') > order.indexOf('inspect'));
  assert.equal(evaluateFinalExecution(state, 'build').status, 'partially_completed');
});

test('restart recovery reloads completed nodes and resumes only pending nodes', async () => {
  const store = new InMemoryExecutionStateStore();
  const state = createCanonicalExecutionState({ projectId: 'p', runId: 'resume', tasks: [node('a', 'inspect'), node('b', 'validate', ['a'])] });
  state.tasks[0].status = 'completed'; state.tasks[0].evidence = evidence('read');
  await store.save(state);
  const reloaded = await store.load('resume');
  assert.ok(reloaded);
  let inspectedAgain = false;
  await new ExecutionScheduler(store).run(reloaded!, {
    inspect: async () => { inspectedAgain = true; return { output: {}, evidence: evidence('read'), validated: true }; },
    validate: async () => ({ output: {}, evidence: evidence('test'), validated: true }),
  });
  assert.equal(inspectedAgain, false);
  assert.equal(reloaded!.tasks[1].status, 'completed');
});

test('canonical mutations are atomic, path-safe, serialised, recoverable, and preserve unrelated files', async () => {
  const state = createCanonicalExecutionState({ projectId: 'p', files: [{ path: 'a.ts', content: 'one' }, { path: 'keep.ts', content: 'safe' }] });
  const mutations = new CanonicalMutationService();
  await assert.rejects(() => mutations.mutate(state, [{ type: 'create', path: '../escape', content: 'bad' }]));
  await Promise.all([
    mutations.mutate(state, [{ type: 'update', patch: { path: 'a.ts', search: 'one', replace: 'two' } }]),
    mutations.mutate(state, [{ type: 'create', path: 'b.ts', content: 'three' }]),
  ]);
  assert.equal(state.currentWorkingSnapshot.find((file) => file.path === 'keep.ts')?.content, 'safe');
  assert.equal(state.currentWorkingSnapshot.find((file) => file.path === 'a.ts')?.content, 'two');
  await mutations.mutate(state, [{ type: 'restore', path: 'a.ts' }]);
  assert.equal(state.currentWorkingSnapshot.find((file) => file.path === 'a.ts')?.content, 'one');
});

test('blocked external operations cannot fabricate push or deployment completion', async () => {
  const state = createCanonicalExecutionState({ projectId: 'p', tasks: [node('github', 'github'), node('deploy', 'deploy', ['github'])] });
  await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(state, {
    github: async () => { throw new Error('remote did not return a commit SHA'); },
    deploy: async () => ({ output: { url: 'https://invented.invalid' }, evidence: evidence('deployment'), validated: true }),
  });
  assert.equal(state.tasks[0].status, 'failed');
  assert.equal(state.tasks[1].status, 'blocked');
  assert.equal(evaluateFinalExecution(state, 'ship').status, 'failed');
});
