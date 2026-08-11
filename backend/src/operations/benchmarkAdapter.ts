/**
 * Runs a bounded model benchmark as an approved operations action.
 *
 * This is the credential-bearing path, and the shape of it is the point. Benchmarking calls
 * real providers with real keys and spends real money, so it cannot be a function anyone can
 * invoke; equally, it cannot require handing a key to whoever wants to run one.
 *
 * The existing operations machinery already resolves that tension and is reused wholesale
 * rather than reimplemented: a benchmark run is an `operations_actions` row that needs an
 * explicit confirmation, a second person's approval bound to the requested plan digest, and
 * a lease before it executes. What crosses the boundary is an *authorisation*, never a
 * secret. The provider key is read inside this process by `getSecret` at the moment of the
 * call, and never appears in the request, the action row, the evidence, or the summary.
 *
 * Every ceiling below is a spend control that cannot be raised from the request. A caller
 * may ask for less than the ceiling and is given less; a caller asking for more is clamped,
 * because a budget an untrusted caller can widen is not a budget.
 */

import { MODELS, type ModelId } from '../ai/models.js';
import { hasSecret } from '../config/envSecrets.js';
import {
  DEFAULT_CAPS,
  InMemoryBenchmarkResultStore,
  SupabaseBenchmarkResultStore,
  modelMayRun,
  plan as planBenchmarks,
  runBenchmarks,
  type BenchmarkCaps,
  type BenchmarkResultStore,
  type BenchmarkSelection,
  type CaseExecutor,
} from '../ai/benchmarkRunner.js';
import { createBenchmarkCaseExecutor, singleModelImplementation } from '../ai/benchmarkExecutor.js';
import { sandboxValidationRunner } from '../synthesis/productionAdapters.js';
import type { ProviderAdapter, ProviderResult } from './types.js';

/**
 * The hard ceilings. Not defaults — limits.
 *
 * `DEFAULT_CAPS` is the runner's own bound; these are the same numbers restated as the most
 * an operator may authorise in one action, so raising the runner's defaults later cannot
 * silently raise what a single approval buys.
 */
export const BENCHMARK_ACTION_CEILINGS: BenchmarkCaps = {
  maximumCases: DEFAULT_CAPS.maximumCases,
  maximumCostUsd: DEFAULT_CAPS.maximumCostUsd,
  perCaseTimeoutMs: DEFAULT_CAPS.perCaseTimeoutMs,
  consecutiveFailureLimit: DEFAULT_CAPS.consecutiveFailureLimit,
};

function positiveNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function stringList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const entries = value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  return entries.length ? entries : undefined;
}

/** Clamps a requested run to the ceilings. Anything absent or invalid falls back to the ceiling. */
export function capsFromParameters(parameters: Record<string, unknown>): BenchmarkCaps {
  const requestedCases = positiveNumber(parameters.maximumCases);
  const requestedCost = positiveNumber(parameters.maximumCostUsd);
  const requestedTimeout = positiveNumber(parameters.perCaseTimeoutMs);
  return {
    maximumCases: Math.min(requestedCases ?? BENCHMARK_ACTION_CEILINGS.maximumCases, BENCHMARK_ACTION_CEILINGS.maximumCases),
    maximumCostUsd: Math.min(requestedCost ?? BENCHMARK_ACTION_CEILINGS.maximumCostUsd, BENCHMARK_ACTION_CEILINGS.maximumCostUsd),
    perCaseTimeoutMs: Math.min(requestedTimeout ?? BENCHMARK_ACTION_CEILINGS.perCaseTimeoutMs, BENCHMARK_ACTION_CEILINGS.perCaseTimeoutMs),
    consecutiveFailureLimit: BENCHMARK_ACTION_CEILINGS.consecutiveFailureLimit,
  };
}

/**
 * The selection a request asks for.
 *
 * `includeHeavy` is deliberately not honoured from parameters. Heavy cases cost roughly four
 * times a light one, and the budget cap already decides how much may be spent — letting a
 * request opt into heavy cases would spend that budget on one measurement instead of six.
 */
export function selectionFromParameters(parameters: Record<string, unknown>): BenchmarkSelection {
  return {
    benchmarkIds: stringList(parameters.benchmarkIds),
    roles: stringList(parameters.roles),
    models: stringList(parameters.models) as readonly ModelId[] | undefined,
    languages: stringList(parameters.languages),
    capabilities: stringList(parameters.capabilities),
    includeHeavy: false,
  };
}

/**
 * The models this deployment can actually measure.
 *
 * A model whose key is unset is excluded here rather than attempted and failed. Attempting it
 * would burn the consecutive-failure limit on a configuration fact and record a row saying
 * the model failed the task, which is a false measurement — the model was never asked.
 */
export function measurableModels(): readonly ModelId[] {
  return (Object.keys(MODELS) as ModelId[]).filter((modelId) => {
    const definition = MODELS[modelId];
    return Boolean(definition && hasSecret(definition.secretKey));
  });
}

export interface BenchmarkAdapterDeps {
  /** Where rows are recorded. Absent means in-memory, and the summary says so. */
  readonly store?: BenchmarkResultStore;
  /** Overridable for tests; production runs real models through the real sandbox. */
  readonly executor?: CaseExecutor;
  readonly models?: () => readonly ModelId[];
}

export function createBenchmarkAdapter(deps: BenchmarkAdapterDeps = {}): ProviderAdapter {
  return {
    id: 'model_benchmark',
    supportedCapabilities: ['run_model_benchmark'],
    authenticationRequirements: ['server-side provider credentials, read in-process and never returned'],
    environmentSupport: ['local', 'test', 'development', 'staging', 'production'],
    readOperations: ['select'],
    mutationOperations: ['insert'],
    verificationMethod: 'executable build and test outcomes recorded per case in model_benchmark_runs',
    retryPolicy: { maxAttempts: 1, retryableCategories: [] },
    rateLimitHandling: 'bounded case count, dollar budget and consecutive-failure stop, all checked before each call',
    idempotencySupport: true,
    redactionPolicy: 'record identifiers, exit-code-derived outcomes, token counts and cost only; never provider keys, prompts or model output',

    async execute(capability, input): Promise<ProviderResult> {
      if (!this.supportedCapabilities.includes(capability)) {
        return { status: 'unsupported', safeSummary: `${capability} is unsupported by ${this.id}` };
      }

      const parameters = (input.parameters && typeof input.parameters === 'object' ? input.parameters : input) as Record<string, unknown>;
      const caps = capsFromParameters(parameters);
      const selection = selectionFromParameters(parameters);
      const models = (deps.models ?? measurableModels)();

      // No configured provider is a setup fact, not a failure. Saying so plainly is what
      // stops an empty result being read as "the models were measured and scored nothing".
      if (!models.length) {
        return {
          status: 'external_setup_required',
          safeSummary: 'No model has a configured provider credential in this environment, so nothing could be measured.',
          errorCategory: 'provider_credentials_unavailable',
        };
      }

      const planned = planBenchmarks(selection, models, caps);
      if (!planned.cases.length) {
        return {
          status: 'blocked',
          safeSummary: `The requested selection resolved to no runnable case within ${caps.maximumCases} cases and $${caps.maximumCostUsd}.`,
          errorCategory: 'empty_selection',
          observedState: { skipped: planned.skipped.length },
        };
      }

      const store = deps.store ?? new InMemoryBenchmarkResultStore();
      const executor = deps.executor ?? createBenchmarkCaseExecutor({
        implement: singleModelImplementation(),
        runValidation: sandboxValidationRunner(),
      });

      const report = await runBenchmarks({ selection, models, execute: executor, store, caps });

      // `verified` means the run happened and produced measurements, not that the models
      // passed. A suite where every model fails is a valid, useful measurement.
      return {
        status: report.attempted > 0 ? 'verified' : 'failed',
        safeSummary:
          `Measured ${report.attempted} case${report.attempted === 1 ? '' : 's'}: ` +
          `${report.succeeded} passed, ${report.failed} failed, $${report.actualCostUsd.toFixed(2)} of the ` +
          `$${caps.maximumCostUsd} budget spent` +
          (report.stoppedEarly ? `; stopped early because ${report.stoppedEarly}` : '') +
          (deps.store ? '' : ' (results not persisted: no durable store was configured)'),
        observedState: {
          attempted: report.attempted,
          succeeded: report.succeeded,
          failed: report.failed,
          actualCostUsd: report.actualCostUsd,
          stoppedEarly: report.stoppedEarly,
          plannedCases: planned.cases.length,
          skippedCases: planned.skipped.length,
          modelsMeasured: [...new Set(planned.cases.map((entry) => entry.modelId))].length,
          persisted: Boolean(deps.store),
        },
      };
    },
  };
}

/** The durable store, when the caller has an admin client. */
export function benchmarkStore(client: ConstructorParameters<typeof SupabaseBenchmarkResultStore>[0] | null): BenchmarkResultStore | undefined {
  return client ? new SupabaseBenchmarkResultStore(client) : undefined;
}

/** Re-exported so callers assembling a selection can respect the same symmetry rule. */
export { modelMayRun };
