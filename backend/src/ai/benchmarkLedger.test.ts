import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BETA_SUCCESS_RATE,
  MIN_LEDGER_SAMPLES,
  VERIFIED_SUCCESS_RATE,
  assessWithBenchmarks,
  benchmarkGates,
  buildLedger,
  maturityFromRate,
  roleForBenchmark,
} from './benchmarkLedger.js';
import { chooseCostAware } from './providerCostTiers.js';
import { BENCHMARKS, type BenchmarkResult } from './modelBenchmarks.js';

/**
 * Command 3 §12, §13, §21, §23, §29C — measurement must actually reach routing.
 *
 * The gap these close: benchmarks scored results, routing needed evidence, and nothing
 * carried one to the other, so measurement could accumulate without ever changing a
 * decision.
 */

let counter = 0;
function result(over: Partial<BenchmarkResult> & { modelId: string; benchmarkId: string }): BenchmarkResult {
  counter += 1;
  return {
    schemaVersion: '1.0.0',
    succeeded: true,
    buildPassed: true,
    testsPassed: true,
    patchApplied: null,
    regressionCount: 0,
    securityFindings: 0,
    repairAttempts: 0,
    latencyMs: 1000,
    inputTokens: 100,
    outputTokens: 200,
    estimatedCostUsd: 0.01,
    at: new Date(1_700_000_000_000 + counter * 1000).toISOString(),
    ...over,
  } as BenchmarkResult;
}

const CODING_BENCHMARK = BENCHMARKS.find((b) => b.capability === 'coding')!.id;

test('a benchmark maps to the role its evidence is filed under', () => {
  assert.equal(roleForBenchmark(CODING_BENCHMARK), 'implementation');
  assert.equal(roleForBenchmark('does-not-exist'), null);
});

test('evidence is aggregated per model and per role', () => {
  const ledger = buildLedger([
    result({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK }),
    result({ modelId: 'deepseek_v4_flash', benchmarkId: CODING_BENCHMARK }),
  ]);
  assert.equal(ledger.length, 2);
  assert.deepEqual([...ledger.map((e) => e.modelId)].sort(), ['deepseek_v4_flash', 'kimi_k3']);
  for (const entry of ledger) assert.equal(entry.role, 'implementation');
});

test('one model never inherits another model evidence', () => {
  // §12 forbids family-level evidence by name: Kimi K3 and Kimi K2.7 are different products.
  const ledger = buildLedger(
    Array.from({ length: 10 }, () => result({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK })),
  );
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0]!.modelId, 'kimi_k3');
  assert.equal(ledger.some((entry) => entry.modelId === 'kimi_k2_7'), false);
});

test('failures stay in the denominator', () => {
  // A rate computed over successes alone is a count of successes wearing a percentage sign.
  const ledger = buildLedger([
    ...Array.from({ length: 6 }, () => result({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK })),
    ...Array.from({ length: 4 }, () =>
      result({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK, succeeded: false }),
    ),
  ]);
  assert.equal(ledger[0]!.samples, 10);
  assert.equal(ledger[0]!.validationSuccessRate, 0.6);
});

test('a research model never acquires a coding score', () => {
  // §7: the cheapest place to hold this line is where a score would be created.
  const ledger = buildLedger([
    result({ modelId: 'grok_4_5', benchmarkId: CODING_BENCHMARK }),
    result({ modelId: 'grok_4_3', benchmarkId: CODING_BENCHMARK }),
  ]);
  assert.deepEqual(ledger, []);
});

test('one passing run is experimental, not verified', () => {
  // A single success is 100%, and calling that verified is how an unmeasured model
  // acquires a reputation.
  assert.equal(maturityFromRate(1, 1), 'experimental');
  assert.equal(maturityFromRate(1, MIN_LEDGER_SAMPLES - 1), 'experimental');
  assert.equal(maturityFromRate(1, MIN_LEDGER_SAMPLES), 'verified');
});

test('maturity follows the measured rate once there are enough samples', () => {
  assert.equal(maturityFromRate(VERIFIED_SUCCESS_RATE, 20), 'verified');
  assert.equal(maturityFromRate(VERIFIED_SUCCESS_RATE - 0.01, 20), 'beta');
  assert.equal(maturityFromRate(BETA_SUCCESS_RATE, 20), 'beta');
  assert.equal(maturityFromRate(BETA_SUCCESS_RATE - 0.01, 20), 'degraded');
});

test('measured evidence changes which model routing picks', () => {
  // The whole point of the bridge: without it, a cheaper model could never earn the lead.
  const ledger = buildLedger([
    ...Array.from({ length: 10 }, () =>
      result({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK, estimatedCostUsd: 0.5 }),
    ),
    ...Array.from({ length: 10 }, () =>
      result({ modelId: 'deepseek_v4_flash', benchmarkId: CODING_BENCHMARK, estimatedCostUsd: 0.01 }),
    ),
  ]);

  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['kimi_k3', 'deepseek_v4_flash'],
    evidence: ledger,
  })!;
  assert.equal(choice.modelId, 'deepseek_v4_flash');
  assert.match(choice.reason, /least-expensive candidate with sufficient evidence/);
});

test('a cheap model that measures badly does not take the lead', () => {
  const ledger = buildLedger([
    ...Array.from({ length: 10 }, () =>
      result({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK, estimatedCostUsd: 0.5 }),
    ),
    ...Array.from({ length: 10 }, (_, i) =>
      result({
        modelId: 'deepseek_v4_flash',
        benchmarkId: CODING_BENCHMARK,
        estimatedCostUsd: 0.01,
        succeeded: i < 3,
      }),
    ),
  ]);
  const choice = chooseCostAware({
    role: 'implementation',
    candidates: ['kimi_k3', 'deepseek_v4_flash'],
    evidence: ledger,
  })!;
  assert.equal(choice.modelId, 'kimi_k3');
});

test('benchmark evidence alone cannot make a capability verified', () => {
  // Benchmarks contribute two of eight gates. The rest are facts about the system, not
  // about a model, and this deliberately cannot assert them.
  const ledger = buildLedger(
    Array.from({ length: 20 }, () => result({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK })),
  );
  const record = assessWithBenchmarks({
    kind: 'coding_role',
    identifier: 'implementation',
    role: 'implementation',
    entries: ledger,
  });
  assert.notEqual(record.state, 'verified');
  assert.ok(record.unmetGates.includes('sandboxCanExecute'));
  assert.ok(record.unmetGates.includes('rollbackExists'));
});

test('benchmark gates plus system gates can reach verified', () => {
  const ledger = buildLedger(
    Array.from({ length: 20 }, () => result({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK })),
  );
  const record = assessWithBenchmarks({
    kind: 'coding_role',
    identifier: 'implementation',
    role: 'implementation',
    entries: ledger,
    systemGates: {
      runtimeAdapterExists: true,
      sandboxCanExecute: true,
      buildAndTestCommandsKnown: true,
      securityTestsPass: true,
      productionMonitoringExists: true,
      rollbackExists: true,
    },
  });
  assert.equal(record.state, 'verified', record.reason);
});

test('failing benchmarks do not satisfy the threshold gate', () => {
  const ledger = buildLedger(
    Array.from({ length: 20 }, () =>
      result({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK, succeeded: false }),
    ),
  );
  const gates = benchmarkGates(ledger, 'implementation');
  assert.equal(gates.requiredBenchmarksExist, true);
  assert.equal(gates.benchmarkThresholdsPass, false);
});

test('no results yields no gates satisfied', () => {
  const gates = benchmarkGates([], 'implementation');
  assert.equal(gates.requiredBenchmarksExist, false);
  assert.equal(gates.benchmarkThresholdsPass, false);
});

test('entries trace back to the benchmarks behind them', () => {
  const ledger = buildLedger([
    result({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK }),
    result({ modelId: 'kimi_k3', benchmarkId: CODING_BENCHMARK }),
  ]);
  assert.deepEqual(ledger[0]!.benchmarkIds, [CODING_BENCHMARK]);
  assert.ok(ledger[0]!.lastObservedAt);
});
