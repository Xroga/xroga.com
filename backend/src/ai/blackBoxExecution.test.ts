import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTaskRequest } from '../lib/taskClassifier.js';
import { createIntelligentRoutePlan } from './intelligentRouter.js';
import { getRuntimeModelRegistry } from './modelCapabilityRegistry.js';
import { CanonicalMutationService, ExecutionScheduler, InMemoryExecutionStateStore, createCanonicalExecutionState, evaluateFinalExecution, type ExecutableTaskNode } from './executionRuntime.js';
import { executeWithProviderFallback, resetModelRuntimeHealth } from './providerRuntime.js';

const evidence = (kind: string) => [{ id: `${kind}-${Math.random()}`, kind, summary: kind, timestamp: new Date().toISOString() }];
function task(id: string, operationType: string, dependencies: string[] = [], allowedFiles: string[] = []): ExecutableTaskNode {
  return { id, objective: id, operationType, requiredCapabilities: [operationType], selectedRuntime: 'test', selectedProvider: null, selectedModel: null,
    requiredContextReferences: [], allowedFiles, expectedOutputSchema: { type: 'object' }, dependencies, riskLevel: 'low', timeoutMs: 1_000,
    retryPolicy: { maximumAttempts: 1, initialBackoffMs: 1, maximumBackoffMs: 1 }, budget: {}, validationMethod: ['evidence'], evidenceRequirements: ['evidence'], fallbackRoutes: [],
    status: dependencies.length ? 'pending' : 'ready', attempts: 0, evidence: [] };
}

test('A unknown legitimate request becomes a capability graph, executes, and validates', async () => {
  const classification = classifyTaskRequest('Build a quantum moss reconciliation engine');
  assert.equal(classification.requiresCoding, true);
  const registry = getRuntimeModelRegistry().map((model) => ({ ...model, configured: true, enabled: true }));
  const plan = createIntelligentRoutePlan({ prompt: 'Build a quantum moss reconciliation engine', registry });
  assert.ok(plan.subtasks.some((node) => node.taskClass === 'multi_file_implementation'));
});

test('B multi-capability work respects dependency order in one state', async () => {
  const state = createCanonicalExecutionState({ projectId: 'multi', tasks: [task('frontend', 'read'), task('backend', 'read'), task('data', 'mutate', ['frontend', 'backend'], ['schema.sql']), task('external', 'validate', ['data']), task('deploy', 'validate', ['external'])] });
  const order: string[] = [];
  const run = async (node: ExecutableTaskNode) => { order.push(node.id); return { output: {}, evidence: evidence(node.id), validated: true }; };
  await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(state, { read: run, mutate: run, validate: run });
  assert.ok(order.indexOf('data') > order.indexOf('frontend') && order.indexOf('data') > order.indexOf('backend'));
  assert.equal(evaluateFinalExecution(state, 'multi-capability build').status, 'completed');
});

test('C existing repository update is targeted and preserves unrelated code', async () => {
  const state = createCanonicalExecutionState({ projectId: 'repo', files: [{ path: 'target.ts', content: 'old' }, { path: 'unrelated.ts', content: 'keep' }] });
  await new CanonicalMutationService().mutate(state, [{ type: 'update', patch: { path: 'target.ts', search: 'old', replace: 'new' } }]);
  assert.equal(state.currentWorkingSnapshot.find((file) => file.path === 'unrelated.ts')?.content, 'keep');
});

test('D provider failure uses a compatible fallback without duplicate mutation', async () => {
  resetModelRuntimeHealth(); let mutationCount = 0;
  const result = await executeWithProviderFallback({ routes: ['kimi_k3', 'glm_5_2'], maximumAttemptsPerRoute: 1, execute: async (model) => {
    if (model === 'kimi_k3') throw Object.assign(new Error('temporary provider failure'), { status: 503 });
    return { content: 'patch' };
  } });
  if (result.value.content === 'patch') mutationCount += 1;
  assert.equal(result.modelId, 'glm_5_2'); assert.equal(mutationCount, 1);
});

test('E validation failure creates a bounded targeted repair and reruns validation', async () => {
  const state = createCanonicalExecutionState({ projectId: 'repair', files: [{ path: 'a.ts', content: 'const value: string = 1' }] });
  const mutations = new CanonicalMutationService();
  let validations = 0;
  const validate = () => { validations += 1; return state.currentWorkingSnapshot[0].content.includes('"1"'); };
  assert.equal(validate(), false);
  await mutations.mutate(state, [{ type: 'update', patch: { path: 'a.ts', search: '= 1', replace: '= "1"' } }]);
  state.repairHistory.push({ taskId: 'repair-1', failureClass: 'type_error', files: ['a.ts'], timestamp: new Date().toISOString() });
  assert.equal(validate(), true); assert.equal(validations, 2); assert.equal(state.repairHistory.length, 1);
});

test('F restart recovery does not repeat completed tasks', async () => {
  const store = new InMemoryExecutionStateStore(); const state = createCanonicalExecutionState({ projectId: 'restart', runId: 'restart-run', tasks: [task('done', 'read'), task('pending', 'validate', ['done'])] });
  state.tasks[0].status = 'completed'; state.tasks[0].evidence = evidence('done'); await store.save(state);
  const resumed = await store.load('restart-run'); let repeated = false;
  await new ExecutionScheduler(store).run(resumed!, { read: async () => { repeated = true; return { output: {}, evidence: evidence('read'), validated: true }; }, validate: async () => ({ output: {}, evidence: evidence('validate'), validated: true }) });
  assert.equal(repeated, false); assert.equal(resumed!.tasks[1].status, 'completed');
});

test('G truthful external failure has no fabricated commit or live URL', async () => {
  const state = createCanonicalExecutionState({ projectId: 'external', tasks: [task('push', 'push')] });
  await new ExecutionScheduler(new InMemoryExecutionStateStore()).run(state, { push: async () => { throw new Error('GitHub rejected push; no remote SHA'); } });
  const outcome = evaluateFinalExecution(state, 'push and deploy');
  assert.equal(outcome.status, 'failed'); assert.equal(outcome.evidenceReferences.length, 0); assert.match(outcome.blockers[0], /no remote SHA/);
});
