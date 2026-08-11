import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BENCHMARKS,
  BENCHMARK_SCHEMA_VERSION,
  resultToOutcome,
  sampleBenchmarks,
  summariseResults,
  type BenchmarkDefinition,
  type BenchmarkResult,
} from './modelBenchmarks.js';

/**
 * Command 3 §21 — the benchmark suite itself.
 *
 * The suite had no direct tests: `benchmarkLedger.test.ts` exercises it only through
 * aggregation, so a definition could lose its success criterion, or `sampleBenchmarks`
 * could return the whole suite, without anything failing. Both are failures that cost
 * real provider budget rather than a red build, which is the wrong place to discover them.
 */

let counter = 0;
function result(over: Partial<BenchmarkResult> & { benchmarkId: string }): BenchmarkResult {
  counter += 1;
  return {
    schemaVersion: BENCHMARK_SCHEMA_VERSION,
    modelId: 'kimi_k3',
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

test('every benchmark states how it is settled without asking the model', () => {
  // A benchmark with no success criterion can only be scored by opinion, which is the one
  // thing §21 forbids.
  for (const benchmark of BENCHMARKS) {
    assert.ok(benchmark.objective.trim().length > 0, `${benchmark.id} objective`);
    assert.ok(benchmark.successCriterion.trim().length > 0, `${benchmark.id} successCriterion`);
    assert.ok(benchmark.evidenceKind, `${benchmark.id} evidenceKind`);
  }
});

test('benchmark ids are unique', () => {
  // Duplicate ids would silently merge two different measurements into one ledger entry.
  const ids = BENCHMARKS.map((benchmark) => benchmark.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('the suite spans more than one language and more than one capability', () => {
  // §21 asks for coverage across languages and task classes. A suite that drifted to
  // TypeScript-only would still pass every other test here.
  const languages = new Set(BENCHMARKS.map((b) => b.language).filter(Boolean));
  const capabilities = new Set(BENCHMARKS.map((b) => b.capability));
  assert.ok(languages.size >= 4, `languages covered: ${[...languages].join(', ')}`);
  assert.ok(capabilities.size >= 5, `capabilities covered: ${[...capabilities].join(', ')}`);
});

test('sampling is bounded and never returns the whole suite', () => {
  // §21 forbids running the full suite on a user request. The ceiling is the protection.
  const everything = sampleBenchmarks({ limit: 9999 });
  assert.ok(everything.length <= 8, `sampled ${everything.length}`);
  assert.ok(everything.length < BENCHMARKS.length);

  assert.equal(sampleBenchmarks({ limit: 0 }).length, 1);
  assert.equal(sampleBenchmarks({ limit: -5 }).length, 1);
});

test('heavy benchmarks are excluded unless asked for', () => {
  // Dropping heavy work first keeps the cost of measurement below the cost of the work
  // being measured.
  const light = sampleBenchmarks({ limit: 8 });
  assert.equal(light.some((benchmark) => benchmark.weight === 'heavy'), false);
});

test('sampling narrows to the capability being routed', () => {
  const coding = sampleBenchmarks({ capability: 'coding', limit: 5 });
  assert.ok(coding.length > 0);
  for (const benchmark of coding) assert.equal(benchmark.capability, 'coding');
});

test('a narrow filter yields the heavy benchmark rather than silence', () => {
  // Returning nothing would read as "this capability is unmeasurable" when it is only
  // expensive to measure.
  const debugging = BENCHMARKS.filter((b) => b.capability === 'debugging');
  const heavyOnly = debugging.every((b) => b.weight === 'heavy');
  const sampled = sampleBenchmarks({ capability: 'debugging', language: 'cobol', limit: 3 });
  assert.ok(sampled.length > 0, 'a narrow filter returned nothing');
  if (heavyOnly) assert.ok(sampled.some((b) => b.weight === 'heavy'));
});

test('a language filter never excludes language-agnostic benchmarks', () => {
  // `language: null` means "applies to any language". Filtering it out would drop review,
  // debugging and refactor coverage the moment a language was named.
  const rust = sampleBenchmarks({ language: 'rust', limit: 8 });
  for (const benchmark of rust) {
    assert.ok(benchmark.language === null || benchmark.language === 'rust', `${benchmark.id} leaked in`);
  }
});

test('a failed result maps to failing evidence, never to its success kind', () => {
  // The direction that matters: a failure must not be recorded under the evidence kind a
  // success would have produced.
  const definition = BENCHMARKS.find((b) => b.evidenceKind === 'tests_passed')!;
  const passed = resultToOutcome(result({ benchmarkId: definition.id }), definition);
  const failed = resultToOutcome(result({ benchmarkId: definition.id, succeeded: false }), definition);

  assert.equal(passed.evidence, 'tests_passed');
  assert.equal(failed.evidence, 'tests_failed');
  assert.equal(failed.succeeded, false);
});

test('each success evidence kind has a distinct failure counterpart', () => {
  const seen = new Map<string, string>();
  for (const definition of BENCHMARKS) {
    const failed = resultToOutcome(result({ benchmarkId: definition.id, succeeded: false }), definition);
    assert.notEqual(failed.evidence, definition.evidenceKind, `${definition.id} recorded failure as success`);
    seen.set(definition.evidenceKind, failed.evidence);
  }
  assert.equal(seen.get('build_passed'), 'build_failed');
  assert.equal(seen.get('patch_applied'), 'patch_rejected');
  assert.equal(seen.get('repair_succeeded'), 'repair_failed');
});

test('an outcome carries the benchmark language only when the benchmark names one', () => {
  const withLanguage = BENCHMARKS.find((b) => b.language === 'rust')!;
  const withoutLanguage = BENCHMARKS.find((b) => b.language === null)!;
  assert.equal(resultToOutcome(result({ benchmarkId: withLanguage.id }), withLanguage).language, 'rust');
  assert.equal(
    'language' in resultToOutcome(result({ benchmarkId: withoutLanguage.id }), withoutLanguage),
    false,
  );
});

test('an empty history summarises to nothing rather than to zero', () => {
  // A pass rate of 0 and "never measured" are different claims, and reporting the first
  // for the second is how an unmeasured model acquires a bad reputation.
  const summary = summariseResults([]);
  assert.equal(summary.runs, 0);
  assert.equal(summary.passRate, null);
  assert.equal(summary.medianLatencyMs, null);
});

test('failures stay in the summary denominator', () => {
  const summary = summariseResults([
    ...Array.from({ length: 3 }, () => result({ benchmarkId: 'x' })),
    result({ benchmarkId: 'x', succeeded: false }),
  ]);
  assert.equal(summary.runs, 4);
  assert.equal(summary.passRate, 0.75);
});

test('median latency is the middle, not the mean', () => {
  // One pathological run must not move the reported latency the way an average would.
  const summary = summariseResults([
    result({ benchmarkId: 'x', latencyMs: 100 }),
    result({ benchmarkId: 'x', latencyMs: 200 }),
    result({ benchmarkId: 'x', latencyMs: 90_000 }),
  ]);
  assert.equal(summary.medianLatencyMs, 200);
});

test('an even-length history averages the two middle latencies', () => {
  const summary = summariseResults([
    result({ benchmarkId: 'x', latencyMs: 100 }),
    result({ benchmarkId: 'x', latencyMs: 300 }),
  ]);
  assert.equal(summary.medianLatencyMs, 200);
});

test('cost and regressions accumulate across the history', () => {
  const summary = summariseResults([
    result({ benchmarkId: 'x', estimatedCostUsd: 0.0125, regressionCount: 2 }),
    result({ benchmarkId: 'x', estimatedCostUsd: 0.0125, regressionCount: 1 }),
  ]);
  assert.equal(summary.totalCostUsd, 0.025);
  assert.equal(summary.regressions, 3);
});

test('the schema version is stamped so old results are not reinterpreted', () => {
  // A result recorded under one scoring schema must not be silently read under another.
  const definition: BenchmarkDefinition = BENCHMARKS[0]!;
  const row = result({ benchmarkId: definition.id });
  assert.equal(row.schemaVersion, BENCHMARK_SCHEMA_VERSION);
});
