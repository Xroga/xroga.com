/**
 * Benchmark results become routing evidence.
 *
 * Three systems already exist and did not touch each other: `modelBenchmarks` defines and
 * scores the suite, `providerCostTiers.chooseCostAware` needs per-model evidence to prefer
 * a cheaper model, and `capabilityMaturity` needs gate facts to decide what may be offered.
 * Nothing carried a result from the first to the other two, so measurement could accumulate
 * without ever changing a routing decision — the exact gap §13 describes when it says
 * verified routing must prioritise measured evidence over hard-coded scores.
 *
 * This is the bridge, and it is deliberately narrow: aggregate, derive, and refuse. It does
 * not run benchmarks, score them or decide maturity. Each of those already has an owner.
 *
 * Two rules are enforced here rather than assumed by callers:
 *
 *   - **Evidence is per model and per role.** A `BenchmarkResult` names a model and a
 *     benchmark; the benchmark's capability supplies the role. Aggregating across a family
 *     would let Kimi K3's record justify routing to Kimi K2.7, which §12 forbids by name.
 *
 *   - **A failed benchmark never improves anything.** It counts toward the denominator, so
 *     failures lower a success rate rather than vanishing from it. Dropping failures is the
 *     most natural-looking way to manufacture a good score.
 */

import { BENCHMARKS, type BenchmarkResult } from './modelBenchmarks.js';
import type { ModelEvidence } from './providerCostTiers.js';
import { assessMaturity, type MaturityGates, type MaturityRecord } from './capabilityMaturity.js';
import { isCodingModel } from './providerPolicy.js';

/** Below this many samples, a rate is not yet a measurement. Matches the routing floor. */
export const MIN_LEDGER_SAMPLES = 5;

/** Success rate a model must sustain before its evidence counts as `verified`. */
export const VERIFIED_SUCCESS_RATE = 0.85;

/** Success rate below which measured evidence is `beta` rather than nothing. */
export const BETA_SUCCESS_RATE = 0.6;

const BENCHMARK_BY_ID = new Map(BENCHMARKS.map((benchmark) => [benchmark.id, benchmark]));

/**
 * The role a benchmark measures.
 *
 * Derived from the benchmark's capability rather than stored separately, so a benchmark
 * cannot drift from the role its evidence is filed under.
 */
export function roleForBenchmark(benchmarkId: string): string | null {
  const benchmark = BENCHMARK_BY_ID.get(benchmarkId);
  if (!benchmark) return null;
  switch (benchmark.capability) {
    case 'coding':
    case 'ui_generation':
      return 'implementation';
    case 'repository_analysis':
      return 'repository_analyst';
    case 'architecture':
      return 'architecture';
    case 'debugging':
      return 'repair';
    case 'review':
      return 'independent_review';
    case 'security_review':
      return 'security_review';
    default:
      return null;
  }
}

export interface LedgerEntry extends ModelEvidence {
  /** Benchmarks that contributed, so a rate can be traced to the runs behind it. */
  readonly benchmarkIds: readonly string[];
  readonly lastObservedAt: string;
}

/**
 * Aggregates results into per-model, per-role evidence.
 *
 * Results whose model is not a coding model are dropped rather than recorded. §7 forbids a
 * research provider holding coding capability scores at all, and the cheapest place to hold
 * that line is where a score would otherwise be created.
 */
export function buildLedger(results: readonly BenchmarkResult[]): readonly LedgerEntry[] {
  const groups = new Map<string, BenchmarkResult[]>();

  for (const result of results) {
    if (!isCodingModel(result.modelId)) continue;
    const role = roleForBenchmark(result.benchmarkId);
    if (!role) continue;
    const key = `${result.modelId}::${role}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(result);
    groups.set(key, bucket);
  }

  return [...groups.entries()].map(([key, bucket]) => {
    const [modelId, role] = key.split('::') as [string, string];
    // Failures stay in the denominator. A rate computed over successes alone is not a
    // success rate, it is a count of successes wearing a percentage sign.
    const passed = bucket.filter((result) => result.succeeded).length;
    const validationSuccessRate = passed / bucket.length;
    const costUsdPerTask =
      bucket.reduce((total, result) => total + result.estimatedCostUsd, 0) / bucket.length;

    return {
      modelId,
      role,
      samples: bucket.length,
      validationSuccessRate,
      costUsdPerTask,
      maturity: maturityFromRate(validationSuccessRate, bucket.length),
      benchmarkIds: [...new Set(bucket.map((result) => result.benchmarkId))].sort(),
      lastObservedAt: bucket
        .map((result) => result.at)
        .sort()
        .at(-1)!,
    };
  });
}

/**
 * Maturity implied by a measured rate.
 *
 * Sample count gates the label before the rate does: a single passing run is 100%, and
 * calling that `verified` is how an unmeasured model acquires a reputation. Below the floor
 * everything is `experimental` regardless of how good the rate looks.
 */
export function maturityFromRate(rate: number, samples: number): ModelEvidence['maturity'] {
  if (samples < MIN_LEDGER_SAMPLES) return 'experimental';
  if (rate >= VERIFIED_SUCCESS_RATE) return 'verified';
  if (rate >= BETA_SUCCESS_RATE) return 'beta';
  return 'degraded';
}

/**
 * Whether benchmark evidence satisfies the two maturity gates it can speak to.
 *
 * `capabilityMaturity` owns the decision; this only reports what the benchmark record
 * proves. The other six gates — sandbox execution, security tests, monitoring, rollback —
 * are facts about the system, not about a model, and this deliberately cannot assert them.
 * A capability cannot reach `verified` on benchmark evidence alone, which is the point.
 */
export function benchmarkGates(entries: readonly LedgerEntry[], role: string): Partial<MaturityGates> {
  const forRole = entries.filter((entry) => entry.role === role);
  const measured = forRole.filter((entry) => entry.samples >= MIN_LEDGER_SAMPLES);
  return {
    requiredBenchmarksExist: forRole.length > 0,
    benchmarkThresholdsPass:
      measured.length > 0 && measured.some((entry) => entry.validationSuccessRate >= VERIFIED_SUCCESS_RATE),
  };
}

/**
 * Maturity for a capability, combining benchmark evidence with system gates.
 *
 * The caller supplies the gates only it can know. Benchmark evidence contributes two of
 * eight, so a caller that passes nothing else gets `experimental` — the honest answer for a
 * capability that has been measured but not operationalised.
 */
export function assessWithBenchmarks(input: {
  kind: Parameters<typeof assessMaturity>[0]['kind'];
  identifier: string;
  role: string;
  entries: readonly LedgerEntry[];
  systemGates?: Partial<MaturityGates>;
}): MaturityRecord {
  const forRole = input.entries.filter((entry) => entry.role === input.role);
  const best = forRole.reduce<LedgerEntry | null>(
    (winner, entry) => (!winner || entry.validationSuccessRate > winner.validationSuccessRate ? entry : winner),
    null,
  );

  return assessMaturity({
    kind: input.kind,
    identifier: input.identifier,
    gates: { ...(input.systemGates ?? {}), ...benchmarkGates(input.entries, input.role) },
    observations: best ? { samples: best.samples, validationSuccessRate: best.validationSuccessRate } : null,
  });
}
