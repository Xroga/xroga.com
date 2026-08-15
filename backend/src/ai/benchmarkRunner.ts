/**
 * Executing the benchmark suite against real providers.
 *
 * Everything around this already existed: `modelBenchmarks` defines and scores the suite,
 * `benchmarkLedger` aggregates results into per-model evidence, `chooseCostAware` consumes
 * that evidence, `capabilityMaturity` gates what may be offered, and `model_benchmark_runs`
 * has been sitting in the database since Command 3 Part A. The table has zero rows, because
 * nothing ever wrote one. A suite that is defined, scored, aggregated and consumed but never
 * *run* produces exactly the situation §13 describes: routing falls back to hand-written
 * priors forever, because no measurement can ever arrive to outrank them.
 *
 * This is the missing execution step, and it is deliberately not a framework. It selects,
 * caps, runs, records and stops. It defines no benchmarks — `modelBenchmarks` owns those —
 * and it decides no maturity, because `capabilityMaturity` does.
 *
 * The design constraint that shapes every decision here is that **this spends real money**.
 * A benchmark run is a sequence of paid provider calls, and the failure mode is not a bad
 * measurement, it is a bill. So:
 *
 *   - every cap is checked *before* the call it would prevent, never after. A runner that
 *     notices it overspent is not a budget cap, it is an invoice;
 *   - `heavy` benchmarks are excluded unless asked for by name, because the cost of
 *     measuring must stay below the cost of the work being measured;
 *   - there is no "run everything" entry point. `plan()` returns what *would* run and what
 *     it would approximately cost, and callers are expected to look at it first.
 *
 * The second constraint is that a benchmark must measure the production path. A runner with
 * its own generation and its own validation measures the runner. So execution is injected:
 * the caller supplies the same implementation and validation functions production uses, and
 * this module never calls a provider directly.
 */

import { BENCHMARK_SCHEMA_VERSION, BENCHMARKS, type BenchmarkDefinition, type BenchmarkResult } from './modelBenchmarks.js';
import { roleForBenchmark } from './benchmarkLedger.js';
import { isCodingModel, isResearchModel } from './providerPolicy.js';
import { MODELS, type ModelId } from './models.js';

/** How a case is selected. Every field narrows; an omitted field does not filter. */
export interface BenchmarkSelection {
  readonly benchmarkIds?: readonly string[];
  readonly roles?: readonly string[];
  readonly models?: readonly ModelId[];
  readonly languages?: readonly string[];
  readonly capabilities?: readonly string[];
  /** Heavy benchmarks are excluded unless this is true. Cost, not capability. */
  readonly includeHeavy?: boolean;
}

/**
 * Hard limits on a run.
 *
 * Every one of these is a spend control, and every one is checked before the call it would
 * prevent. `maximumCases` alone is not enough: a single heavy case can cost more than twenty
 * light ones, which is why the budget is denominated in dollars as well as in cases.
 */
export interface BenchmarkCaps {
  readonly maximumCases: number;
  readonly maximumCostUsd: number;
  readonly perCaseTimeoutMs: number;
  /** Stops after this many consecutive failures. A broken provider is not worth 20 calls. */
  readonly consecutiveFailureLimit?: number;
}

export const DEFAULT_CAPS: BenchmarkCaps = {
  maximumCases: 6,
  maximumCostUsd: 2,
  perCaseTimeoutMs: 600_000,
  consecutiveFailureLimit: 3,
};

/** One selected benchmark against one model. */
export interface BenchmarkCase {
  readonly benchmark: BenchmarkDefinition;
  readonly modelId: ModelId;
  readonly role: string;
}

/**
 * What one case's execution reports.
 *
 * The caller performs the work; this is the shape it must report it in. Note there is no
 * `succeeded` field — success is derived from the executable outcomes below, so a caller
 * cannot report a pass for a case whose build and tests both failed.
 */
export interface CaseOutcome {
  readonly buildPassed: boolean | null;
  readonly testsPassed: boolean | null;
  readonly patchApplied: boolean | null;
  readonly regressionCount: number;
  readonly securityFindings: number;
  readonly repairAttempts: number;
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export type CaseExecutor = (
  benchmarkCase: BenchmarkCase,
  signal: AbortSignal,
) => Promise<CaseOutcome>;

/** Where results are recorded. Implemented over `model_benchmark_runs`. */
export interface BenchmarkResultStore {
  record(result: BenchmarkResult): Promise<void>;
}

/**
 * Whether a model may be measured against a benchmark.
 *
 * The same symmetric rule the ledger enforces, applied one step earlier so a forbidden pair
 * is never *run* rather than run and then discarded. Discarding after the fact would mean
 * paying for a measurement that §7 says must not exist.
 */
export function modelMayRun(modelId: string, role: string): boolean {
  return role === 'research' ? isResearchModel(modelId) : isCodingModel(modelId);
}

/**
 * Whether a case's outcome counts as a success.
 *
 * Derived from executable results, never reported by a caller. A case with no executable
 * outcome at all is a failure: it means nothing was checked, and "nothing was checked"
 * recorded as a pass is how an unmeasured model acquires a reputation.
 */
export function succeeded(outcome: CaseOutcome): boolean {
  const checks = [outcome.buildPassed, outcome.testsPassed, outcome.patchApplied].filter(
    (value): value is boolean => typeof value === 'boolean',
  );
  if (!checks.length) return false;
  return checks.every(Boolean) && outcome.regressionCount === 0;
}

/**
 * Approximate cost of a case before it runs.
 *
 * Deliberately an over-estimate: it prices the model's full output ceiling rather than what
 * the case is likely to use. A budget cap that assumes the cheap outcome stops one case too
 * late, and one case too late is exactly the case that blew the budget.
 */
export function estimateCaseCostUsd(benchmarkCase: BenchmarkCase): number {
  const model = MODELS[benchmarkCase.modelId];
  if (!model) return 0;
  const weightFactor = benchmarkCase.benchmark.weight === 'heavy' ? 4 : benchmarkCase.benchmark.weight === 'light' ? 0.5 : 1;
  const inputTokens = 20_000 * weightFactor;
  const outputTokens = 16_000 * weightFactor;
  return (
    (inputTokens / 1_000_000) * (model.inputUsdPer1M ?? 0) + (outputTokens / 1_000_000) * (model.outputUsdPer1M ?? 0)
  );
}

/**
 * The cases a selection resolves to, cheapest first.
 *
 * Ordering by estimated cost is what makes a budget cap produce a useful partial run rather
 * than an arbitrary one: when the budget runs out, the cases that were skipped are the
 * expensive ones, and the measurement that was bought is the broadest available.
 */
export function selectCases(
  selection: BenchmarkSelection,
  models: readonly ModelId[],
): readonly BenchmarkCase[] {
  const cases: BenchmarkCase[] = [];

  for (const benchmark of BENCHMARKS) {
    if (selection.benchmarkIds?.length && !selection.benchmarkIds.includes(benchmark.id)) continue;
    if (selection.capabilities?.length && !selection.capabilities.includes(benchmark.capability)) continue;
    if (selection.languages?.length) {
      // A language-agnostic benchmark is not excluded by a language filter: dropping it
      // would remove review, debugging and refactor coverage the moment a language is named.
      if (benchmark.language && !selection.languages.includes(benchmark.language)) continue;
    }
    if (!selection.includeHeavy && benchmark.weight === 'heavy') continue;

    const role = roleForBenchmark(benchmark.id);
    if (!role) continue;
    if (selection.roles?.length && !selection.roles.includes(role)) continue;

    for (const modelId of models) {
      if (selection.models?.length && !selection.models.includes(modelId)) continue;
      if (!modelMayRun(modelId, role)) continue;
      cases.push({ benchmark, modelId, role });
    }
  }

  return cases.sort((a, b) => estimateCaseCostUsd(a) - estimateCaseCostUsd(b));
}

export interface BenchmarkPlan {
  readonly cases: readonly BenchmarkCase[];
  readonly skipped: readonly { readonly benchmarkCase: BenchmarkCase; readonly reason: string }[];
  readonly estimatedCostUsd: number;
}

/**
 * What a run would do, without doing any of it.
 *
 * The entry point a caller should reach for first. There is deliberately no way to run the
 * whole suite without having seen this: `run` applies the same caps, so a plan that says
 * six cases and $1.80 is what six cases and $1.80 will actually be attempted.
 */
export function plan(
  selection: BenchmarkSelection,
  models: readonly ModelId[],
  caps: BenchmarkCaps = DEFAULT_CAPS,
): BenchmarkPlan {
  const candidates = selectCases(selection, models);
  const cases: BenchmarkCase[] = [];
  const skipped: { benchmarkCase: BenchmarkCase; reason: string }[] = [];
  let estimatedCostUsd = 0;

  for (const benchmarkCase of candidates) {
    const cost = estimateCaseCostUsd(benchmarkCase);
    if (cases.length >= caps.maximumCases) {
      skipped.push({ benchmarkCase, reason: `case cap of ${caps.maximumCases} reached` });
      continue;
    }
    if (estimatedCostUsd + cost > caps.maximumCostUsd) {
      skipped.push({
        benchmarkCase,
        reason: `would exceed the $${caps.maximumCostUsd} budget (estimated $${cost.toFixed(2)})`,
      });
      continue;
    }
    cases.push(benchmarkCase);
    estimatedCostUsd += cost;
  }

  return { cases, skipped, estimatedCostUsd };
}

export interface BenchmarkRunReport {
  readonly results: readonly BenchmarkResult[];
  readonly attempted: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly actualCostUsd: number;
  readonly stoppedEarly: string | null;
}

/**
 * Runs the planned cases.
 *
 * Stops for three reasons, all of them before a call rather than after: the case cap, the
 * budget, and a run of consecutive failures. The last one matters because a provider with an
 * expired key fails identically every time, and discovering that on the twentieth call costs
 * twenty calls to learn what the third one already said.
 *
 * A thrown executor is recorded as a failed result rather than aborting the run. One
 * benchmark timing out says something about that model on that task, which is a measurement;
 * losing the other five results because of it is not.
 */
export async function runBenchmarks(input: {
  selection: BenchmarkSelection;
  models: readonly ModelId[];
  execute: CaseExecutor;
  store?: BenchmarkResultStore;
  caps?: BenchmarkCaps;
  signal?: AbortSignal;
  onCase?: (benchmarkCase: BenchmarkCase, result: BenchmarkResult) => void;
}): Promise<BenchmarkRunReport> {
  const caps = input.caps ?? DEFAULT_CAPS;
  const planned = plan(input.selection, input.models, caps);

  const results: BenchmarkResult[] = [];
  let actualCostUsd = 0;
  let consecutiveFailures = 0;
  let stoppedEarly: string | null = null;

  for (const benchmarkCase of planned.cases) {
    if (input.signal?.aborted) {
      stoppedEarly = 'cancelled';
      break;
    }
    // Checked before the call, using the estimate. Using the actual spend alone would let
    // the final case overshoot by its own full cost.
    if (actualCostUsd + estimateCaseCostUsd(benchmarkCase) > caps.maximumCostUsd) {
      stoppedEarly = `budget of $${caps.maximumCostUsd} would be exceeded`;
      break;
    }
    if (
      caps.consecutiveFailureLimit &&
      consecutiveFailures >= caps.consecutiveFailureLimit
    ) {
      stoppedEarly = `${consecutiveFailures} consecutive failures`;
      break;
    }

    const controller = new AbortController();
    const onAbort = () => controller.abort();
    input.signal?.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), caps.perCaseTimeoutMs);
    const startedAt = Date.now();

    let outcome: CaseOutcome | null = null;
    try {
      outcome = await input.execute(benchmarkCase, controller.signal);
    } catch {
      // A failed case is a measurement about that model on that task. Recorded, not thrown.
      outcome = null;
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener('abort', onAbort);
    }

    const model = MODELS[benchmarkCase.modelId];
    const costUsd = outcome
      ? (outcome.inputTokens / 1_000_000) * (model.inputUsdPer1M ?? 0) +
        (outcome.outputTokens / 1_000_000) * (model.outputUsdPer1M ?? 0)
      : estimateCaseCostUsd(benchmarkCase);

    const result: BenchmarkResult = {
      schemaVersion: BENCHMARK_SCHEMA_VERSION,
      benchmarkId: benchmarkCase.benchmark.id,
      modelId: benchmarkCase.modelId,
      succeeded: outcome ? succeeded(outcome) : false,
      buildPassed: outcome?.buildPassed ?? null,
      testsPassed: outcome?.testsPassed ?? null,
      patchApplied: outcome?.patchApplied ?? null,
      regressionCount: outcome?.regressionCount ?? 0,
      securityFindings: outcome?.securityFindings ?? 0,
      repairAttempts: outcome?.repairAttempts ?? 0,
      latencyMs: outcome?.latencyMs ?? Date.now() - startedAt,
      inputTokens: outcome?.inputTokens ?? 0,
      outputTokens: outcome?.outputTokens ?? 0,
      estimatedCostUsd: costUsd,
      at: new Date().toISOString(),
    };

    results.push(result);
    actualCostUsd += costUsd;
    consecutiveFailures = result.succeeded ? 0 : consecutiveFailures + 1;

    // Recorded per case rather than in a batch at the end. A run that is cancelled or
    // crashes halfway has still bought the measurements it made, and losing them means
    // paying for them twice.
    if (input.store) {
      await input.store.record(result).catch(() => {
        // A recording failure must not lose the remaining cases. The result stays in the
        // returned report either way, so the caller can still see what was measured.
      });
    }
    input.onCase?.(benchmarkCase, result);
  }

  return {
    results,
    attempted: results.length,
    succeeded: results.filter((result) => result.succeeded).length,
    failed: results.filter((result) => !result.succeeded).length,
    actualCostUsd,
    stoppedEarly,
  };
}

/**
 * Records results into `model_benchmark_runs`.
 *
 * The table has existed since Command 3 Part A and has never had a row written to it. This
 * is the writer it was waiting for; the schema is unchanged.
 */
export class SupabaseBenchmarkResultStore implements BenchmarkResultStore {
  constructor(private readonly client: { from: (table: string) => { insert: (row: unknown) => Promise<{ error: unknown }> } }) {}

  async record(result: BenchmarkResult): Promise<void> {
    const { error } = await this.client.from('model_benchmark_runs').insert({
      benchmark_id: result.benchmarkId,
      model_id: result.modelId,
      schema_version: result.schemaVersion,
      succeeded: result.succeeded,
      build_passed: result.buildPassed,
      tests_passed: result.testsPassed,
      patch_applied: result.patchApplied,
      regression_count: result.regressionCount,
      security_findings: result.securityFindings,
      repair_attempts: result.repairAttempts,
      latency_ms: Math.round(result.latencyMs),
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      estimated_cost_usd: result.estimatedCostUsd,
      ran_at: result.at,
    });
    if (error) throw error;
  }
}

/** Collects results in memory. For tests and for a caller that wants the report only. */
export class InMemoryBenchmarkResultStore implements BenchmarkResultStore {
  readonly rows: BenchmarkResult[] = [];
  async record(result: BenchmarkResult): Promise<void> {
    this.rows.push(result);
  }
}
