/**
 * Runs one benchmark case against one real model.
 *
 * `benchmarkRunner` decides *which* cases run and what they may cost; it deliberately never
 * calls a provider. This is the half that does, and until it existed the whole measurement
 * chain was inert: `runBenchmarks` required a `CaseExecutor` that no production code
 * supplied, so `model_benchmark_runs` could only ever be written by a test.
 *
 * Three rules shape everything here, and each one exists because breaking it would produce a
 * number that looks like a measurement and is not:
 *
 * 1. **One model, no fallback.** A case measures a named model. The production synthesis path
 *    passes a ranked candidate list so a failing model is silently replaced by the next one —
 *    correct for a user's build, fatal for a benchmark, because the row would carry model A's
 *    id and model B's work. A case here gets exactly one candidate, and a model that cannot
 *    complete the work fails its own case.
 *
 * 2. **Nothing is committed.** A benchmark writes no repository. The generated files exist
 *    for as long as it takes to validate them. This is also what keeps the suite away from
 *    customer repositories entirely.
 *
 * 3. **Outcomes come from exit codes.** `buildPassed` is whether the build phase exited 0,
 *    not whether the model said it would. Phases that never ran report `null` rather than
 *    `false`, because "not measured" and "measured and failed" are different facts and
 *    `succeeded()` in the runner already refuses to treat an all-null outcome as a pass.
 */

import { chatCompletion } from './openaiCompat.js';
import { scanProjectFiles } from './securityScan.js';
import type { BenchmarkCase, CaseExecutor, CaseOutcome } from './benchmarkRunner.js';
import type { ModelId } from './models.js';
import type { ProjectFile } from './patches.js';
import { implementIncrementally, type CompletionFn } from '../synthesis/incrementalImplementation.js';
import {
  planUniversalRun,
  runValidationPlan,
  type ValidationReport,
  type ValidationRunner,
} from '../synthesis/universalFlow.js';

/**
 * The request put to the model.
 *
 * The benchmark's own `objective` and `successCriterion` are used verbatim. Rewriting them
 * per model — or per run — would mean two rows recorded under the same benchmark id had been
 * asked different questions, and the ledger aggregates by that id.
 */
export function benchmarkBrief(benchmarkCase: BenchmarkCase): string {
  const { benchmark } = benchmarkCase;
  const language = benchmark.language ? `Language: ${benchmark.language}.` : '';
  return [
    `Task: ${benchmark.title}.`,
    benchmark.objective,
    language,
    `This is complete when ${benchmark.successCriterion}.`,
    'Produce a complete, self-contained project that can be installed, built and tested from a clean checkout.',
    'Include the dependency manifest and test files the toolchain needs; a project that cannot run its own tests cannot satisfy the criterion.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Whether a validation phase passed, or `null` when it never ran.
 *
 * Optional commands are excluded: the plan marks a formatter optional precisely so its
 * absence cannot fail a run, and letting it decide `buildPassed` would reintroduce that
 * through the back door.
 */
export function phaseOutcome(report: ValidationReport, phase: string): boolean | null {
  const relevant = report.executed.filter(
    (record) => record.validation.phase === phase && !record.skipped && !record.validation.command.optional,
  );
  if (!relevant.length) return null;
  return relevant.every((record) => record.exitCode === 0);
}

/** Everything the executor needs from the outside world, so the logic can be tested without one. */
export interface BenchmarkExecutorDeps {
  /** Generates the file set for one model. Must not fall back to another model. */
  readonly implement: (input: {
    brief: string;
    modelId: ModelId;
    signal: AbortSignal;
  }) => Promise<{ files: readonly ProjectFile[]; inputTokens: number; outputTokens: number }>;
  /** Runs one validation command under isolation. */
  readonly runValidation: ValidationRunner;
}

/**
 * Builds the executor `runBenchmarks` calls.
 *
 * A thrown implementation is not caught here. The runner records a thrown case as a failed
 * measurement for that model, which is the honest reading: a model that cannot return usable
 * files for the task did not pass it.
 */
export function createBenchmarkCaseExecutor(deps: BenchmarkExecutorDeps): CaseExecutor {
  return async (benchmarkCase, signal) => {
    const startedAt = Date.now();
    const brief = benchmarkBrief(benchmarkCase);

    const generated = await deps.implement({ brief, modelId: benchmarkCase.modelId, signal });
    const files = [...generated.files];

    // No files means nothing to validate and nothing to claim. Reported as an unapplied patch
    // with both executable checks unmeasured, which `succeeded()` scores as a failure.
    if (!files.length) {
      return unvalidatedOutcome(startedAt, generated, false);
    }

    // The same planner the product uses. Planning from the generated files rather than from
    // the prompt is what makes the commands real: the adapters detect the components that
    // actually exist, so a Rust submission is validated with cargo and a Node one with npm,
    // without the benchmark hard-coding either.
    const plan = planUniversalRun({ prompt: brief, files });
    if (!plan.validations.length) {
      // A model that produced files no adapter recognises has not demonstrated anything
      // executable. Recorded as measured-and-unverifiable, never as a pass.
      return unvalidatedOutcome(startedAt, generated, true);
    }

    const report = await runValidationPlan(plan, deps.runValidation);
    const security = scanProjectFiles(files);

    return {
      buildPassed: phaseOutcome(report, 'build'),
      testsPassed: phaseOutcome(report, 'test'),
      patchApplied: true,
      // Every non-optional command that failed. `runValidationPlan` stops at the first real
      // failure, so this is at most one — which is the point: the count reflects what was
      // observed, not an estimate of what else might have broken.
      regressionCount: report.failures.length,
      securityFindings: security.findings.length,
      // No repair loop runs inside a benchmark. Measuring a model's first answer is the
      // comparable quantity; a repaired result measures the repair path instead.
      repairAttempts: 0,
      latencyMs: Date.now() - startedAt,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
    };
  };
}

function unvalidatedOutcome(
  startedAt: number,
  generated: { inputTokens: number; outputTokens: number },
  patchApplied: boolean,
): CaseOutcome {
  return {
    buildPassed: null,
    testsPassed: null,
    patchApplied,
    regressionCount: 0,
    securityFindings: 0,
    repairAttempts: 0,
    latencyMs: Date.now() - startedAt,
    inputTokens: generated.inputTokens,
    outputTokens: generated.outputTokens,
  };
}

/**
 * The real implementation dependency: one model, counted honestly.
 *
 * Token counts come from the provider's own usage field via `chatCompletion`, accumulated
 * across the manifest call and every per-file call. They are what the case actually cost,
 * which is the number the ledger needs — an estimate would make cost-aware routing rank
 * models by a guess about their own price.
 */
export function singleModelImplementation(): BenchmarkExecutorDeps['implement'] {
  return async ({ brief, modelId, signal }) => {
    let inputTokens = 0;
    let outputTokens = 0;

    const complete: CompletionFn = async (candidateId, messages, opts) => {
      if (candidateId !== modelId) {
        // Unreachable through `candidates` below, and asserted anyway: a substitution here
        // would silently attribute another model's work to this case's row.
        throw new Error(
          `benchmark case is pinned to ${modelId} but the implementation attempted ${candidateId}`,
        );
      }
      const reply = await chatCompletion(candidateId as ModelId, messages, { ...opts, signal });
      inputTokens += reply.inputTokens;
      outputTokens += reply.outputTokens;
      return reply;
    };

    const files = await implementIncrementally({
      brief,
      // Exactly one candidate. This is rule 1, enforced structurally rather than by comment.
      candidates: [{ modelId }],
      complete,
    });

    return { files, inputTokens, outputTokens };
  };
}
