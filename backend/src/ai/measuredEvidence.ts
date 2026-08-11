/**
 * Measured benchmark evidence, loaded and handed to routing.
 *
 * This closes a gap that made the whole measurement path inert. Tracing it on `ff177ee`:
 *
 *   - `model_benchmark_runs` was written by `SupabaseBenchmarkResultStore` and read by
 *     nothing;
 *   - `buildLedger` was called by no production code, only by tests;
 *   - `chooseCostAware` was called by no production code, only by tests.
 *
 * So the sequence the command asks for — database → ledger → evidence → routing decision —
 * was three disconnected halves. Running real benchmarks would have populated a table that
 * nothing consulted, and routing would have gone on using hand-written priors while the
 * ledger filled up beside it. Proving `benchmarkRunner → database` would have looked like
 * success and changed no decision.
 *
 * Two design points are worth stating because they are the difference between this being
 * useful and being a second inert layer.
 *
 * **Absence of evidence is reported, never inferred.** When no measurement covers a role,
 * this returns nothing and the caller keeps its existing prior-based routing — and the run
 * records that the choice was made on a prior. §13 wants measurement to outrank priors, not
 * to silently replace the decision with a worse one when there is nothing to measure with.
 *
 * **The load is cached and never blocks a build on the database.** A benchmark ledger is
 * slow-moving; refetching per run would put a query in front of every build to read rows
 * that change a few times a week. A failure to load is not a failure to build: it degrades
 * to priors and says so.
 */

import type { BenchmarkResult } from './modelBenchmarks.js';
import { buildLedger, type LedgerEntry } from './benchmarkLedger.js';
import { getSupabaseAdmin } from '../config/supabase.js';

/** How long a loaded ledger is reused before the next load. */
export const EVIDENCE_CACHE_MS = 10 * 60 * 1000;

/** Rows read per load. A ledger is aggregate; the whole history is not needed to compute it. */
export const EVIDENCE_ROW_LIMIT = 2_000;

export interface MeasuredEvidence {
  readonly entries: readonly LedgerEntry[];
  /** Where it came from, so a run can say whether a choice was measured or assumed. */
  readonly source: 'measured' | 'unavailable';
  readonly loadedAt: string;
  /** Present when the load failed, so degradation to priors is explainable. */
  readonly reason?: string;
}

const EMPTY: MeasuredEvidence = {
  entries: [],
  source: 'unavailable',
  loadedAt: new Date(0).toISOString(),
  reason: 'no benchmark evidence has been loaded',
};

let cache: { at: number; value: MeasuredEvidence } | null = null;

/** Clears the cache. For tests, and for an operator forcing a reload after a benchmark run. */
export function resetMeasuredEvidenceCache(): void {
  cache = null;
}

/**
 * Reads benchmark results from storage.
 *
 * Separated from `loadMeasuredEvidence` so the aggregation and caching can be tested without
 * a database, and so a caller with its own store can supply one.
 */
export type BenchmarkResultLoader = () => Promise<readonly BenchmarkResult[]>;

export async function supabaseBenchmarkResults(): Promise<readonly BenchmarkResult[]> {
  const { data, error } = await getSupabaseAdmin()
    .from('model_benchmark_runs')
    .select('*')
    .order('ran_at', { ascending: false })
    .limit(EVIDENCE_ROW_LIMIT);
  if (error) throw error;

  return (data ?? []).map((row: Record<string, unknown>) => ({
    schemaVersion: String(row.schema_version ?? '1.0.0'),
    benchmarkId: String(row.benchmark_id),
    modelId: String(row.model_id),
    succeeded: Boolean(row.succeeded),
    buildPassed: row.build_passed === null ? null : Boolean(row.build_passed),
    testsPassed: row.tests_passed === null ? null : Boolean(row.tests_passed),
    patchApplied: row.patch_applied === null ? null : Boolean(row.patch_applied),
    regressionCount: Number(row.regression_count ?? 0),
    securityFindings: Number(row.security_findings ?? 0),
    repairAttempts: Number(row.repair_attempts ?? 0),
    latencyMs: Number(row.latency_ms ?? 0),
    inputTokens: Number(row.input_tokens ?? 0),
    outputTokens: Number(row.output_tokens ?? 0),
    estimatedCostUsd: Number(row.estimated_cost_usd ?? 0),
    at: String(row.ran_at ?? new Date().toISOString()),
  })) as readonly BenchmarkResult[];
}

/**
 * The measured evidence available to routing.
 *
 * Returns `source: 'unavailable'` with an empty ledger when nothing has been measured, when
 * no service-role key is configured, or when the load fails. All three mean the same thing
 * to a caller — route on priors and record that — and conflating them into a thrown error
 * would make a build fail because a measurement was missing.
 */
export async function loadMeasuredEvidence(input?: {
  loader?: BenchmarkResultLoader;
  now?: number;
  force?: boolean;
}): Promise<MeasuredEvidence> {
  const now = input?.now ?? Date.now();
  if (!input?.force && cache && now - cache.at < EVIDENCE_CACHE_MS) return cache.value;

  const loader =
    input?.loader ??
    (process.env.SUPABASE_SERVICE_ROLE_KEY ? supabaseBenchmarkResults : null);

  if (!loader) {
    const value: MeasuredEvidence = {
      ...EMPTY,
      loadedAt: new Date(now).toISOString(),
      reason: 'no service-role key is configured, so benchmark evidence cannot be read',
    };
    cache = { at: now, value };
    return value;
  }

  try {
    const results = await loader();
    // `buildLedger` owns the aggregation rules — per model and per role, failures in the
    // denominator, research/coding isolation. Re-deriving any of that here would create a
    // second definition of what a measurement means.
    const entries = buildLedger(results);
    const value: MeasuredEvidence = {
      entries,
      source: entries.length ? 'measured' : 'unavailable',
      loadedAt: new Date(now).toISOString(),
      ...(entries.length ? {} : { reason: 'no benchmark results have been recorded yet' }),
    };
    cache = { at: now, value };
    return value;
  } catch (error) {
    const value: MeasuredEvidence = {
      ...EMPTY,
      loadedAt: new Date(now).toISOString(),
      reason: `benchmark evidence could not be loaded: ${(error as Error).message}`,
    };
    cache = { at: now, value };
    return value;
  }
}

export interface EvidenceBackedChoice {
  readonly modelId: string | null;
  readonly reason: string;
  /** True when a measurement decided this, false when a hand-written prior did. */
  readonly measured: boolean;
  readonly escalation: readonly string[];
}

/**
 * Chooses a model for a role from measurement when there is any, and says which it used.
 *
 * The `measured` flag is the part that matters for honesty. Without it a run's record shows
 * a model and a plausible-sounding reason, and nobody can tell afterwards whether that
 * choice was earned or assumed — which is exactly the confusion §13 exists to remove.
 */
export function chooseFromMeasuredEvidence(input: {
  role: string;
  candidates: readonly string[];
  evidence: MeasuredEvidence;
  chooser: (choice: {
    role: string;
    candidates: readonly string[];
    evidence: readonly LedgerEntry[];
  }) => { modelId: string; reason: string; escalation: readonly string[]; measured: boolean } | null;
}): EvidenceBackedChoice {
  if (input.evidence.source !== 'measured') {
    return {
      modelId: null,
      reason: input.evidence.reason ?? 'no measured evidence is available for this role',
      measured: false,
      escalation: [],
    };
  }

  const forRole = input.evidence.entries.filter((entry) => entry.role === input.role);
  if (!forRole.length) {
    return {
      modelId: null,
      reason: `no benchmark evidence covers the ${input.role} role`,
      measured: false,
      escalation: [],
    };
  }

  const choice = input.chooser({
    role: input.role,
    candidates: input.candidates,
    evidence: forRole,
  });

  if (!choice) {
    return {
      modelId: null,
      reason: `evidence exists for ${input.role} but no candidate met the sufficiency threshold`,
      measured: false,
      escalation: [],
    };
  }

  // The chooser's own verdict, not "it returned something". `chooseCostAware` still returns
  // a model when nothing has earned the lead — the premium tier on a prior — and treating
  // that as measured would report an assumption as a measurement.
  if (!choice.measured) {
    return { modelId: null, reason: choice.reason, measured: false, escalation: [] };
  }
  return { modelId: choice.modelId, reason: choice.reason, measured: true, escalation: choice.escalation };
}
