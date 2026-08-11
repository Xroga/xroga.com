import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_CAPS,
  InMemoryBenchmarkResultStore,
  estimateCaseCostUsd,
  modelMayRun,
  plan,
  runBenchmarks,
  selectCases,
  succeeded,
  type BenchmarkCase,
  type CaseOutcome,
} from './benchmarkRunner.js';
import { BENCHMARKS } from './modelBenchmarks.js';
import { buildLedger } from './benchmarkLedger.js';
import { chooseCostAware } from './providerCostTiers.js';
import type { ModelId } from './models.js';

/**
 * Command 3 §21 — the runner that was missing.
 *
 * Everything else existed: definitions, scoring, aggregation, cost-aware consumption, and a
 * `model_benchmark_runs` table with zero rows. The tests that matter here are not that a
 * runner runs — they are that it **cannot spend more than it was told to**, and that it
 * cannot record a success nobody earned.
 */

const CODING: readonly ModelId[] = ['kimi_k3', 'glm_5_2', 'deepseek_v4_pro', 'deepseek_v4_flash'];
const ALL: readonly ModelId[] = [...CODING, 'grok_4_5', 'grok_4_3'];

const pass: CaseOutcome = {
  buildPassed: true,
  testsPassed: true,
  patchApplied: null,
  regressionCount: 0,
  securityFindings: 0,
  repairAttempts: 0,
  latencyMs: 1_000,
  inputTokens: 1_000,
  outputTokens: 2_000,
};

test('a case with no executable outcome is a failure, not a pass', () => {
  // "Nothing was checked" recorded as a pass is how an unmeasured model acquires a
  // reputation. There is deliberately no `succeeded` field a caller could set.
  assert.equal(succeeded({ ...pass, buildPassed: null, testsPassed: null, patchApplied: null }), false);
  assert.equal(succeeded(pass), true);
});

test('a regression fails the case even when the build and tests passed', () => {
  assert.equal(succeeded({ ...pass, regressionCount: 1 }), false);
});

test('a research model is never run against a coding benchmark', () => {
  // §7, applied before the call rather than after. Discarding the result afterwards would
  // mean paying for a measurement that must not exist.
  const coding = BENCHMARKS.find((benchmark) => benchmark.capability === 'coding')!;
  const cases = selectCases({ benchmarkIds: [coding.id] }, ALL);
  assert.ok(cases.length > 0);
  for (const item of cases) assert.ok(CODING.includes(item.modelId), `${item.modelId} was selected`);
});

test('a coding model is never run against a research benchmark', () => {
  const research = BENCHMARKS.find((benchmark) => benchmark.capability === 'research')!;
  const cases = selectCases({ benchmarkIds: [research.id] }, ALL);
  assert.ok(cases.length > 0);
  for (const item of cases) {
    assert.ok(['grok_4_5', 'grok_4_3'].includes(item.modelId), `${item.modelId} was selected`);
  }
  assert.equal(modelMayRun('kimi_k3', 'research'), false);
});

test('heavy benchmarks are excluded unless asked for', () => {
  // The cost of measuring must stay below the cost of the work being measured.
  const light = selectCases({}, CODING);
  assert.equal(light.some((item) => item.benchmark.weight === 'heavy'), false);

  const heavy = selectCases({ includeHeavy: true }, CODING);
  assert.ok(heavy.some((item) => item.benchmark.weight === 'heavy'));
});

test('a language filter does not exclude language-agnostic benchmarks', () => {
  const rust = selectCases({ languages: ['rust'] }, CODING);
  for (const item of rust) {
    assert.ok(item.benchmark.language === null || item.benchmark.language === 'rust');
  }
  assert.ok(rust.some((item) => item.benchmark.language === null), 'agnostic benchmarks were dropped');
});

test('cases are ordered cheapest first', () => {
  // What makes a budget cap produce a useful partial run rather than an arbitrary one: the
  // cases skipped when the money runs out are the expensive ones.
  const cases = selectCases({ includeHeavy: true }, CODING);
  const costs = cases.map(estimateCaseCostUsd);
  assert.deepEqual(costs, [...costs].sort((a, b) => a - b));
});

test('the plan never exceeds its case cap', () => {
  const result = plan({ includeHeavy: true }, CODING, { ...DEFAULT_CAPS, maximumCases: 3 });
  assert.equal(result.cases.length, 3);
  assert.ok(result.skipped.length > 0);
  assert.match(result.skipped[0]!.reason, /case cap of 3/);
});

test('the plan never exceeds its budget', () => {
  const result = plan({ includeHeavy: true }, CODING, { ...DEFAULT_CAPS, maximumCases: 999, maximumCostUsd: 0.05 });
  assert.ok(result.estimatedCostUsd <= 0.05, `estimated $${result.estimatedCostUsd}`);
  assert.ok(result.skipped.some((item) => /budget/.test(item.reason)));
});

test('a zero budget plans nothing at all', () => {
  const result = plan({}, CODING, { ...DEFAULT_CAPS, maximumCostUsd: 0 });
  assert.deepEqual(result.cases, []);
});

test('the run attempts exactly what the plan said', async () => {
  // The property that makes `plan` worth reading first: it is not an estimate of a different
  // thing than the one that will run.
  const caps = { ...DEFAULT_CAPS, maximumCases: 4 };
  const planned = plan({}, CODING, caps);
  const seen: string[] = [];

  const report = await runBenchmarks({
    selection: {},
    models: CODING,
    caps,
    execute: async (benchmarkCase) => {
      seen.push(`${benchmarkCase.benchmark.id}:${benchmarkCase.modelId}`);
      return pass;
    },
  });

  assert.equal(report.attempted, planned.cases.length);
  assert.deepEqual(seen, planned.cases.map((item) => `${item.benchmark.id}:${item.modelId}`));
});

test('a throwing case is recorded as a failure rather than ending the run', async () => {
  // One benchmark timing out says something about that model on that task. Losing the other
  // results because of it does not.
  let calls = 0;
  const report = await runBenchmarks({
    selection: {},
    models: CODING,
    caps: { ...DEFAULT_CAPS, maximumCases: 3, consecutiveFailureLimit: 99 },
    execute: async () => {
      calls += 1;
      if (calls === 1) throw new Error('provider timed out');
      return pass;
    },
  });

  assert.equal(report.attempted, 3);
  assert.equal(report.failed, 1);
  assert.equal(report.succeeded, 2);
  assert.equal(report.results[0]!.succeeded, false);
});

test('a run of consecutive failures stops the run', async () => {
  // A provider with an expired key fails identically every time. Discovering that on the
  // twentieth call costs twenty calls to learn what the third already said.
  let calls = 0;
  const report = await runBenchmarks({
    selection: {},
    models: CODING,
    caps: { ...DEFAULT_CAPS, maximumCases: 20, consecutiveFailureLimit: 2 },
    execute: async () => {
      calls += 1;
      throw new Error('401 unauthorized');
    },
  });

  assert.equal(calls, 2, `ran ${calls} cases before stopping`);
  assert.match(report.stoppedEarly!, /consecutive failures/);
});

test('cancellation stops before the next call', async () => {
  const controller = new AbortController();
  let calls = 0;
  const report = await runBenchmarks({
    selection: {},
    models: CODING,
    caps: { ...DEFAULT_CAPS, maximumCases: 10 },
    signal: controller.signal,
    execute: async () => {
      calls += 1;
      if (calls === 2) controller.abort();
      return pass;
    },
  });

  assert.equal(calls, 2);
  assert.equal(report.stoppedEarly, 'cancelled');
});

test('a case that costs far more than estimated stops the run immediately after', async () => {
  // The estimate is an over-estimate, but a model can still exceed it. The guarantee is
  // bounded overshoot, not zero overshoot: the cap is checked before each call, so at most
  // *one* case can blow past it and the next one is refused.
  //
  // Asserting a loose tolerance here would be vacuous — the number to pin is the case count.
  const cap = 0.4;
  const report = await runBenchmarks({
    selection: {},
    models: CODING,
    caps: { ...DEFAULT_CAPS, maximumCases: 10, maximumCostUsd: cap },
    execute: async () => ({ ...pass, inputTokens: 900_000, outputTokens: 900_000 }),
  });

  assert.match(report.stoppedEarly!, /budget/);
  assert.ok(report.attempted < 10, 'the run did not stop before the case cap');

  // The bound, stated exactly: total spend can exceed the cap by at most the actual cost of
  // the single case that crossed it, because the check runs before each call using the
  // estimate. Anything looser than this would pass even if the cap did nothing.
  const largestCase = Math.max(...report.results.map((result) => result.estimatedCostUsd));
  assert.ok(
    report.actualCostUsd <= cap + largestCase,
    `spent $${report.actualCostUsd.toFixed(2)} against a $${cap} cap with a largest case of $${largestCase.toFixed(2)}`,
  );
});

test('an unexpectedly cheap run still stops at the case cap', async () => {
  // The mirror of the above: spending less than estimated must not let extra cases run.
  const report = await runBenchmarks({
    selection: {},
    models: CODING,
    caps: { ...DEFAULT_CAPS, maximumCases: 2, maximumCostUsd: 1_000 },
    execute: async () => ({ ...pass, inputTokens: 1, outputTokens: 1 }),
  });
  assert.equal(report.attempted, 2);
  assert.equal(report.stoppedEarly, null);
});

test('each result is recorded as it happens, not batched at the end', async () => {
  // A run cancelled halfway has still bought the measurements it made. Losing them means
  // paying for them twice.
  const store = new InMemoryBenchmarkResultStore();
  const controller = new AbortController();
  let calls = 0;

  await runBenchmarks({
    selection: {},
    models: CODING,
    caps: { ...DEFAULT_CAPS, maximumCases: 10 },
    store,
    signal: controller.signal,
    execute: async () => {
      calls += 1;
      if (calls === 3) controller.abort();
      return pass;
    },
  });

  assert.equal(store.rows.length, 3, 'results were lost when the run was cancelled');
});

test('a store failure does not lose the remaining cases', async () => {
  const report = await runBenchmarks({
    selection: {},
    models: CODING,
    caps: { ...DEFAULT_CAPS, maximumCases: 3 },
    store: { record: async () => { throw new Error('insert failed'); } },
    execute: async () => pass,
  });
  assert.equal(report.attempted, 3);
});

test('recorded results carry the schema version', async () => {
  const report = await runBenchmarks({
    selection: {},
    models: CODING,
    caps: { ...DEFAULT_CAPS, maximumCases: 1 },
    execute: async () => pass,
  });
  assert.equal(report.results[0]!.schemaVersion, '1.0.0');
});

test('results from a run feed routing evidence end to end', async () => {
  // The whole point of building this: a real run must be able to change a routing decision.
  // Without the runner the ledger stays empty and priors win forever.
  const coding = BENCHMARKS.find((benchmark) => benchmark.capability === 'coding')!;
  const report = await runBenchmarks({
    selection: { benchmarkIds: [coding.id], models: ['deepseek_v4_flash'] },
    models: ['deepseek_v4_flash'],
    caps: { ...DEFAULT_CAPS, maximumCases: 6, maximumCostUsd: 100 },
    execute: async () => pass,
  });

  const ledger = buildLedger([
    ...report.results,
    // Padded to the sample floor, since one run cannot reach it on its own.
    ...report.results,
  ]);
  assert.ok(ledger.length > 0, 'a completed run produced no routing evidence');
  assert.equal(ledger[0]!.modelId, 'deepseek_v4_flash');
  assert.equal(ledger[0]!.role, 'implementation');

  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['deepseek_v4_flash'],
    evidence: ledger,
  });
  assert.ok(choice, 'measured evidence did not reach routing');
});
