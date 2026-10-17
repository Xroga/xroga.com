import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assertBenchmarkResult, SupabaseBenchmarkResultStore, plan, DEFAULT_CAPS, runBenchmarks } from './benchmarkRunner.js';
import { loadMeasuredEvidence } from './measuredEvidence.js';
import { createBenchmarkAdapter } from '../operations/benchmarkAdapter.js';
import type { BenchmarkResult } from './modelBenchmarks.js';

const valid: BenchmarkResult = {
  schemaVersion: '1.0.0', benchmarkId: 'fixture', modelId: 'kimi_k3', succeeded: true,
  buildPassed: true, testsPassed: true, patchApplied: null, regressionCount: 0,
  securityFindings: 0, repairAttempts: 0, latencyMs: 1, inputTokens: 1, outputTokens: 1,
  estimatedCostUsd: 0.001, at: '2026-10-16T00:00:00.000Z',
};

test('malformed measurements cannot enter storage or routing evidence', async () => {
  let writes = 0;
  const store = new SupabaseBenchmarkResultStore({ from: () => ({ insert: async () => { writes++; return { error: null }; } }) });
  await store.record(valid);
  assert.equal(writes, 1);
  for (const change of [{ succeeded: 'false' }, { buildPassed: undefined }, { inputTokens: -1 },
    { outputTokens: 1.2 }, { latencyMs: Infinity }, { estimatedCostUsd: NaN }, { at: undefined }, { regressionCount: null }]) {
    const invalid = { ...valid, ...change } as unknown as BenchmarkResult;
    assert.throws(() => assertBenchmarkResult(invalid), /Invalid benchmark/);
    await assert.rejects(store.record(invalid), /Invalid benchmark/);
    const evidence = await loadMeasuredEvidence({ loader: async () => [invalid], force: true });
    assert.equal(evidence.source, 'unavailable');
    assert.deepEqual(evidence.entries, []);
  }
  assert.equal(writes, 1);
  const evidence = await loadMeasuredEvidence({ force: true, loader: async () => { throw new Error('secret-db-token'); } });
  assert.equal(evidence.reason?.includes('secret-db-token'), false);
});

test('invalid direct caps fail before any execution and malformed outcome is never a pass', async () => {
  for (const change of [{ maximumCases: NaN }, { maximumCostUsd: Infinity }, { perCaseTimeoutMs: 0 }, { consecutiveFailureLimit: -1 }]) {
    assert.throws(() => plan({}, ['kimi_k3'], { ...DEFAULT_CAPS, ...change }), /Invalid benchmark caps/);
  }
  const report = await runBenchmarks({ selection: {}, models: ['kimi_k3'], caps: { ...DEFAULT_CAPS, maximumCases: 1 },
    execute: async () => ({ ...valid, inputTokens: NaN }) });
  assert.equal(report.attempted, 1);
  assert.equal(report.succeeded, 0);
  assert.equal(Number.isFinite(report.actualCostUsd), true);
});

test('storage failure reports uncertain persistence without repeating provider execution or leaking errors', async () => {
  let calls = 0;
  const adapter = createBenchmarkAdapter({ models: () => ['kimi_k3'],
    executor: async () => { calls++; return valid; },
    store: { record: async () => { throw new Error('secret-db-token'); } } });
  const result = await adapter.execute('run_model_benchmark', { maximumCases: 2 });
  assert.equal(calls, 2);
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCategory, 'benchmark_persistence_unverified');
  assert.equal((result.observedState as { persisted: boolean }).persisted, false);
  assert.equal((result.observedState as { recordingFailures: number }).recordingFailures, 2);
  assert.match(result.safeSummary, /not fully persisted/);
  assert.equal(JSON.stringify(result).includes('secret-db-token'), false);
});
