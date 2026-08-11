import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BENCHMARK_ACTION_CEILINGS,
  capsFromParameters,
  createBenchmarkAdapter,
  selectionFromParameters,
} from './benchmarkAdapter.js';
import { ACTION_DEFINITIONS, initialActionStatus } from './operationsEngine.js';
import { hasOperationsPermission } from './permissions.js';
import { InMemoryBenchmarkResultStore, type CaseExecutor } from '../ai/benchmarkRunner.js';
import type { ModelId } from '../ai/models.js';

const passingCase: CaseExecutor = async () => ({
  buildPassed: true,
  testsPassed: true,
  patchApplied: true,
  regressionCount: 0,
  securityFindings: 0,
  repairAttempts: 0,
  latencyMs: 10,
  inputTokens: 100,
  outputTokens: 100,
});

const models = (): readonly ModelId[] => ['kimi_k3' as ModelId, 'glm_5_2' as ModelId];

test('a benchmark run cannot execute without confirmation and a second approval', () => {
  const definition = ACTION_DEFINITIONS.run_model_benchmark!;
  assert.equal(definition.confirmationRequired, true);
  assert.equal(definition.approvalRole, 'release_manager');
  // Unconfirmed stops at confirmation; confirmed still stops at approval.
  assert.equal(initialActionStatus(definition, false), 'confirmation_required');
  assert.equal(initialActionStatus(definition, true), 'approval_required');
});

test('only roles that manage provider routing may request a run', () => {
  const permission = ACTION_DEFINITIONS.run_model_benchmark!.permission;
  assert.equal(hasOperationsPermission('viewer', permission), false);
  assert.equal(hasOperationsPermission('operator', permission), false);
  assert.equal(hasOperationsPermission('release_manager', permission), true);
  assert.equal(hasOperationsPermission('admin', permission), true);
});

test('a retry is not free, so the action gets one attempt', () => {
  assert.equal(ACTION_DEFINITIONS.run_model_benchmark!.maxAttempts, 1);
});

test('requested caps above the ceiling are clamped down to it', () => {
  const caps = capsFromParameters({
    maximumCases: 10_000,
    maximumCostUsd: 500,
    perCaseTimeoutMs: 86_400_000,
  });
  assert.equal(caps.maximumCases, BENCHMARK_ACTION_CEILINGS.maximumCases);
  assert.equal(caps.maximumCostUsd, BENCHMARK_ACTION_CEILINGS.maximumCostUsd);
  assert.equal(caps.perCaseTimeoutMs, BENCHMARK_ACTION_CEILINGS.perCaseTimeoutMs);
});

test('a request may ask for less than the ceiling and is given less', () => {
  const caps = capsFromParameters({ maximumCases: 2, maximumCostUsd: 0.5 });
  assert.equal(caps.maximumCases, 2);
  assert.equal(caps.maximumCostUsd, 0.5);
});

test('nonsense caps fall back to the ceiling rather than disabling the limit', () => {
  for (const value of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, '20', null, undefined]) {
    const caps = capsFromParameters({ maximumCases: value, maximumCostUsd: value });
    assert.equal(caps.maximumCases, BENCHMARK_ACTION_CEILINGS.maximumCases);
    assert.equal(caps.maximumCostUsd, BENCHMARK_ACTION_CEILINGS.maximumCostUsd);
  }
});

test('the consecutive-failure stop cannot be removed by the request', () => {
  const caps = capsFromParameters({ consecutiveFailureLimit: 999 });
  assert.equal(caps.consecutiveFailureLimit, BENCHMARK_ACTION_CEILINGS.consecutiveFailureLimit);
});

test('heavy cases cannot be opted into from the request', () => {
  assert.equal(selectionFromParameters({ includeHeavy: true }).includeHeavy, false);
});

test('a selection of non-strings is ignored rather than passed through', () => {
  const selection = selectionFromParameters({ benchmarkIds: [1, {}, ''], languages: 'rust' });
  assert.equal(selection.benchmarkIds, undefined);
  assert.equal(selection.languages, undefined);
});

test('an environment with no configured provider reports setup required, not a failed measurement', async () => {
  const adapter = createBenchmarkAdapter({ executor: passingCase, models: () => [] });
  const result = await adapter.execute('run_model_benchmark', {});
  assert.equal(result.status, 'external_setup_required');
  assert.equal(result.errorCategory, 'provider_credentials_unavailable');
});

test('an unrelated capability is refused rather than silently run', async () => {
  const adapter = createBenchmarkAdapter({ executor: passingCase, models });
  const result = await adapter.execute('rollback_release', {});
  assert.equal(result.status, 'unsupported');
});

test('a selection that resolves to no case is blocked rather than reported as a clean run', async () => {
  const adapter = createBenchmarkAdapter({ executor: passingCase, models });
  const result = await adapter.execute('run_model_benchmark', {
    parameters: { benchmarkIds: ['no-such-benchmark'] },
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.errorCategory, 'empty_selection');
});

test('a run records one row per measured case and reports what it spent', async () => {
  const store = new InMemoryBenchmarkResultStore();
  const adapter = createBenchmarkAdapter({ executor: passingCase, models, store });
  const result = await adapter.execute('run_model_benchmark', { parameters: { maximumCases: 3 } });

  assert.equal(result.status, 'verified');
  assert.equal(store.rows.length, 3);
  assert.equal((result.observedState as { attempted: number }).attempted, 3);
  assert.equal((result.observedState as { persisted: boolean }).persisted, true);
  assert.match(result.safeSummary, /Measured 3 cases/);
});

test('caps are read from the flat input shape the service actually passes', async () => {
  // `executeAction` spreads `execution_plan` across the top level of the adapter input
  // rather than nesting it under `parameters`. Reading only the nested form would silently
  // ignore every cap an operator set and run at the ceiling instead.
  const store = new InMemoryBenchmarkResultStore();
  const adapter = createBenchmarkAdapter({ executor: passingCase, models, store });
  const result = await adapter.execute('run_model_benchmark', {
    maximumCases: 1,
    userId: 'u1',
    actionId: 'a1',
  });

  assert.equal(result.status, 'verified');
  assert.equal(store.rows.length, 1);
});

test('a run with no durable store says so instead of implying the results were kept', async () => {
  const adapter = createBenchmarkAdapter({ executor: passingCase, models });
  const result = await adapter.execute('run_model_benchmark', { parameters: { maximumCases: 1 } });
  assert.equal((result.observedState as { persisted: boolean }).persisted, false);
  assert.match(result.safeSummary, /not persisted/);
});

test('a suite where every model fails is still a completed measurement', async () => {
  const failing: CaseExecutor = async () => ({
    buildPassed: false,
    testsPassed: false,
    patchApplied: true,
    regressionCount: 1,
    securityFindings: 0,
    repairAttempts: 0,
    latencyMs: 10,
    inputTokens: 10,
    outputTokens: 10,
  });
  const store = new InMemoryBenchmarkResultStore();
  const adapter = createBenchmarkAdapter({ executor: failing, models, store });
  const result = await adapter.execute('run_model_benchmark', { parameters: { maximumCases: 2 } });

  assert.equal(result.status, 'verified');
  assert.equal((result.observedState as { succeeded: number }).succeeded, 0);
  assert.equal(store.rows.every((row) => row.succeeded === false), true);
});

test('the summary carries no provider key, prompt or model output', async () => {
  const adapter = createBenchmarkAdapter({ executor: passingCase, models });
  const result = await adapter.execute('run_model_benchmark', { parameters: { maximumCases: 1 } });
  const serialized = JSON.stringify(result);
  for (const forbidden of ['API_KEY', 'sk-', 'Bearer', 'secret']) {
    assert.ok(!serialized.includes(forbidden), `result leaked ${forbidden}`);
  }
});

test('the adapter never claims a mutation capability it does not have', () => {
  const adapter = createBenchmarkAdapter();
  assert.deepEqual(adapter.supportedCapabilities, ['run_model_benchmark']);
  assert.equal(adapter.idempotencySupport, true);
  assert.equal(adapter.retryPolicy.maxAttempts, 1);
});
