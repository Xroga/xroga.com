/**
 * Benchmarks that produce routing evidence.
 *
 * §21 asks for benchmark definitions over real coding tasks. The important design decision
 * is what counts as a result: every measure here is something that either happened or did
 * not — a build exited 0, a patch applied, a test passed. None of it is a model's opinion
 * of its own output, because a benchmark scored by the thing being benchmarked measures
 * confidence rather than capability.
 *
 * The other constraint is §21's last line: do not run the whole suite on normal user
 * requests. A user waiting for a build must not be paying for twenty-two benchmark tasks,
 * so `sampleBenchmarks` exists to pick a bounded subset and every caller goes through it.
 */

import type { ModelCapability } from './modelCapabilityRegistry.js';
import type { ModelId } from './models.js';
import type { TaskOutcome } from './modelCapabilityProfile.js';

export const BENCHMARK_SCHEMA_VERSION = '1.0.0' as const;

export interface BenchmarkDefinition {
  readonly id: string;
  readonly title: string;
  readonly capability: ModelCapability;
  readonly language: string | null;
  /** What the model is asked to do. */
  readonly objective: string;
  /** How the result is settled, without asking the model. */
  readonly successCriterion: string;
  readonly evidenceKind: TaskOutcome['evidence'];
  /** Rough cost class, used to keep sampling affordable. */
  readonly weight: 'light' | 'medium' | 'heavy';
}

const b = (
  id: string,
  title: string,
  capability: ModelCapability,
  language: string | null,
  objective: string,
  successCriterion: string,
  evidenceKind: TaskOutcome['evidence'],
  weight: BenchmarkDefinition['weight'] = 'medium',
): BenchmarkDefinition => ({ id, title, capability, language, objective, successCriterion, evidenceKind, weight });

/**
 * The suite, covering §21's listed tasks.
 *
 * Each is a real piece of work with an executable outcome. Nothing here asks a model to
 * rate itself, and nothing is scored by another model — a reviewer model's approval is
 * evidence about the reviewer, not about the code.
 */
export const BENCHMARKS: readonly BenchmarkDefinition[] = [
  b('ts-frontend-feature', 'TypeScript frontend feature', 'ui_generation', 'typescript',
    'Add a filterable list component with the project\'s existing patterns',
    'the production build exits 0 and the component test passes', 'build_passed'),
  b('ts-backend-feature', 'TypeScript backend feature', 'coding', 'typescript',
    'Add a validated API route with error handling',
    'the route test suite passes', 'tests_passed'),
  b('py-api-endpoint', 'Python API endpoint', 'coding', 'python',
    'Add an endpoint with request validation and a persistence call',
    'pytest passes including the validation failure path', 'tests_passed'),
  b('py-data-task', 'Python data-processing task', 'coding', 'python',
    'Transform a fixture dataset to a recorded expectation',
    'the output matches the recorded expectation exactly', 'tests_passed'),
  b('rust-cli-feature', 'Rust CLI feature', 'coding', 'rust',
    'Add a flag that changes output format, with an error path',
    'cargo test passes and the binary builds', 'build_passed'),
  b('go-service-feature', 'Go service feature', 'coding', 'go',
    'Add a handler with a table-driven test',
    'go test ./... passes', 'tests_passed'),
  b('existing-bug-fix', 'Existing repository bug fix', 'debugging', null,
    'Find and fix a failing test in an unfamiliar repository',
    'the previously failing test passes and no other test breaks', 'tests_passed', 'heavy'),
  b('multi-file-refactor', 'Multi-file refactor', 'coding', null,
    'Rename a concept across several files without changing behaviour',
    'the full suite passes unchanged', 'tests_passed', 'heavy'),
  b('repo-comprehension', 'Repository comprehension', 'repository_analysis', null,
    'Answer where a behaviour is implemented and why',
    'the named files contain the behaviour', 'review_accepted'),
  b('sql-migration', 'SQL migration', 'coding', 'sql',
    'Write a migration adding a column with a backfill',
    'the migration applies to an empty database and is reversible', 'tests_passed'),
  b('auth-feature', 'Authentication feature', 'coding', null,
    'Add session handling with expiry',
    'authenticated and unauthenticated paths both behave as specified', 'tests_passed'),
  b('authz-change', 'Authorization change', 'security_review', null,
    'Restrict an endpoint to resource owners',
    'a request from a non-owner is refused and the owner still succeeds', 'tests_passed'),
  b('browser-feature', 'Browser feature', 'ui_generation', 'typescript',
    'Add an interaction that persists across reload',
    'the browser test walks the journey', 'tests_passed', 'heavy'),
  b('unit-test-repair', 'Unit-test repair', 'debugging', null,
    'Repair a test broken by an intentional behaviour change',
    'the repaired test passes and still asserts the behaviour', 'repair_succeeded', 'light'),
  b('build-repair', 'Build-system repair', 'debugging', null,
    'Fix a build that fails on a misconfigured path',
    'the build exits 0', 'repair_succeeded', 'light'),
  b('dependency-upgrade', 'Dependency upgrade', 'coding', null,
    'Upgrade a dependency across a breaking change',
    'the suite passes on the new version', 'tests_passed', 'heavy'),
  b('long-context-task', 'Long-context repository task', 'repository_analysis', null,
    'Make a change requiring evidence from files far apart',
    'the change is correct and touches only the necessary files', 'tests_passed', 'heavy'),
  b('structured-patch', 'Structured patch task', 'structured_output', null,
    'Emit a patch in the required structure',
    'the patch applies cleanly to the stated source commit', 'patch_applied', 'light'),
  b('code-review', 'Code review', 'review', null,
    'Review a diff containing one real defect',
    'the defect is identified and no false positive is raised', 'review_accepted'),
  b('security-review', 'Security review', 'security_review', null,
    'Review a diff containing one injection flaw',
    'the flaw is identified with its mechanism', 'review_accepted'),
  b('documentation-task', 'Documentation task', 'coding', null,
    'Document a module from its source',
    'every documented symbol exists', 'review_accepted', 'light'),
  b('devops-task', 'DevOps task', 'coding', null,
    'Add a CI job that runs the test suite',
    'the workflow parses and its steps execute', 'build_passed'),

  // Architecture had no benchmark at all, which meant `roleForBenchmark` mapped the
  // capability to the architecture role and no result could ever arrive there. The role
  // could not accumulate a ledger entry, so cost-aware routing for it fell back to
  // hand-written priors permanently — measurement that cannot reach a decision, which is
  // the gap §13 exists to close.
  //
  // Settling architecture without asking a model is the hard part. Both of these resolve
  // to a fact about the resulting code rather than a judgement about the plan: a chosen
  // adapter either has a runtime that runs, or it does not.
  b('architecture-adapter-selection', 'Architecture: runtime adapter selection', 'architecture', null,
    'Choose a runtime adapter and framework for a stated product and constraints',
    'the chosen adapter exists, its build and test commands run in the sandbox, and a scaffold using it builds',
    'build_passed', 'heavy'),
  b('architecture-constraint-fit', 'Architecture: constraint fit', 'architecture', null,
    'Propose a design under a stated constraint the obvious choice violates',
    'the proposal satisfies the constraint under an executable check, and the obvious choice is shown to fail it',
    'tests_passed', 'heavy'),

  // §22's research evaluation. Research models never write code, so their suite settles on
  // retrieval facts — does the source exist, does it say what was claimed — not on builds.
  // Without these, a research provider carries no measured evidence at all and research
  // routing is forever on priors, the same defect as architecture above.
  b('research-source-retrieval', 'Research: source retrieval', 'research', null,
    'Answer a question about a current external fact, with sources',
    'every cited URL resolves and contains the claim attributed to it', 'review_accepted', 'light'),
  b('research-citation-accuracy', 'Research: citation accuracy', 'research', null,
    'Answer a question whose obvious source is outdated',
    'the answer reflects the current source and does not cite the superseded one', 'review_accepted'),
  b('research-refusal-on-absence', 'Research: refusal when no source exists', 'research', null,
    'Answer a question for which no authoritative source exists',
    'no source is fabricated and the absence is stated', 'review_accepted', 'light'),
];

export interface BenchmarkResult {
  readonly schemaVersion: string;
  readonly benchmarkId: string;
  readonly modelId: ModelId;
  readonly succeeded: boolean;
  readonly buildPassed: boolean | null;
  readonly testsPassed: boolean | null;
  readonly patchApplied: boolean | null;
  readonly regressionCount: number;
  readonly securityFindings: number;
  readonly repairAttempts: number;
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly estimatedCostUsd: number;
  readonly at: string;
}

/**
 * A bounded sample.
 *
 * §21 forbids running the full suite on a user request. Sampling by capability keeps a
 * run relevant to what is being routed, and dropping `heavy` benchmarks first keeps the
 * cost of measurement from exceeding the cost of the work being measured.
 */
export function sampleBenchmarks(input: {
  capability?: ModelCapability;
  language?: string | null;
  limit?: number;
  includeHeavy?: boolean;
}): readonly BenchmarkDefinition[] {
  const limit = Math.max(1, Math.min(input.limit ?? 3, 8));
  let pool = BENCHMARKS.filter((benchmark) => {
    if (input.capability && benchmark.capability !== input.capability) return false;
    if (input.language && benchmark.language && benchmark.language !== input.language) return false;
    if (!input.includeHeavy && benchmark.weight === 'heavy') return false;
    return true;
  });
  // Never return nothing just because the filter was narrow — a caller asking for a
  // capability with no light benchmark should get the heavy one rather than silence.
  if (!pool.length) {
    pool = BENCHMARKS.filter((benchmark) => !input.capability || benchmark.capability === input.capability);
  }
  return pool.slice(0, limit);
}

/**
 * Converts a benchmark result into the outcome the capability ledger accepts.
 *
 * The bridge between §21 and §20: a benchmark that ran is exactly the kind of evidence a
 * capability score is allowed to be built from.
 */
export function resultToOutcome(
  result: BenchmarkResult,
  definition: BenchmarkDefinition,
): TaskOutcome {
  return {
    modelId: result.modelId,
    capability: definition.capability,
    ...(definition.language ? { language: definition.language } : {}),
    succeeded: result.succeeded,
    evidence: result.succeeded
      ? definition.evidenceKind
      : definition.evidenceKind === 'build_passed' ? 'build_failed'
      : definition.evidenceKind === 'tests_passed' ? 'tests_failed'
      : definition.evidenceKind === 'patch_applied' ? 'patch_rejected'
      : definition.evidenceKind === 'repair_succeeded' ? 'repair_failed'
      : 'tests_failed',
    latencyMs: result.latencyMs,
    at: new Date(result.at),
  };
}

/** Aggregate view of a model's benchmark history. */
export function summariseResults(results: readonly BenchmarkResult[]): {
  runs: number;
  passRate: number | null;
  medianLatencyMs: number | null;
  totalCostUsd: number;
  regressions: number;
} {
  if (!results.length) {
    return { runs: 0, passRate: null, medianLatencyMs: null, totalCostUsd: 0, regressions: 0 };
  }
  const latencies = results.map((result) => result.latencyMs).sort((a, b) => a - b);
  const middle = Math.floor(latencies.length / 2);
  return {
    runs: results.length,
    passRate: Math.round((results.filter((result) => result.succeeded).length / results.length) * 100) / 100,
    medianLatencyMs: latencies.length % 2 ? latencies[middle] : Math.round((latencies[middle - 1] + latencies[middle]) / 2),
    totalCostUsd: Math.round(results.reduce((sum, result) => sum + result.estimatedCostUsd, 0) * 10000) / 10000,
    regressions: results.reduce((sum, result) => sum + result.regressionCount, 0),
  };
}
