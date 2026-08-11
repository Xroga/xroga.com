/**
 * Universal phases as canonical, persisted engineering tasks.
 *
 * `executeUniversalRun` sequences implementation, validation, repair, review and commit
 * correctly — but as a linear function, not as a task graph. Nothing about those phases was
 * persisted as an `ExecutableTaskNode`, so a run's canonical state recorded that work
 * happened somewhere else. That is the shape §18 rules out: create tasks, mark some
 * complete, do the important work outside the runtime.
 *
 * This migrates the phases into `ExecutionScheduler` one at a time. The rule each migrated
 * task follows is the one that makes the migration worth doing:
 *
 *   **A task earns its evidence by performing the real operation.**
 *
 * The implementation handler calls the same `adapters.implement` the phase machine called.
 * It does not summarise work done elsewhere, and it does not hash a plan and call that
 * implementation — a handler that describes someone else's work is worse than no handler,
 * because it makes the graph look complete while the guarantee is absent.
 *
 * What the scheduler adds over the direct call is not cosmetic:
 *
 *   - the task is persisted before, during and after execution, so a crash leaves a record
 *     of exactly which phase was in flight;
 *   - completion requires `validated && evidence.length > 0`, enforced by the scheduler
 *     rather than by this module, so a handler cannot mark its own work done;
 *   - a mutating task is never retried automatically, so a failed implementation cannot
 *     silently produce two file sets.
 */

import { createHash, randomUUID } from 'node:crypto';
import type { ProjectFile } from '../ai/patches.js';
import {
  ExecutionScheduler,
  InMemoryExecutionStateStore,
  createCanonicalExecutionState,
  type CanonicalExecutionState,
  type ExecutableTaskNode,
  type ExecutionEvidence,
  type ExecutionStateStore,
  type TaskHandler,
  type ValidationRecord,
} from '../ai/executionRuntime.js';
import type { ValidationReport } from './universalFlow.js';
import { ENGINEERING_ROLES } from '../ai/engineeringRoles.js';
import { assertCodingModel } from '../ai/providerPolicy.js';
import type { ModelId } from '../ai/models.js';

function contentHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Evidence bound to the artifact it describes.
 *
 * The identifier hashes the real object, so a record cannot claim something the artifact
 * does not contain. This is the same construction `engineeringTasks.ts` uses, and it is the
 * reason a decorative handler cannot be written accidentally: there is nothing to hash
 * unless real work produced something.
 */
export function evidenceFor(kind: string, summary: string, artifact: unknown): ExecutionEvidence {
  return {
    id: randomUUID(),
    kind,
    summary,
    identifier: `sha256:${contentHash(artifact)}`,
    timestamp: new Date().toISOString(),
  };
}

/** What the implementation task needs to do real work, all of it produced upstream. */
export interface ImplementationTaskInput {
  readonly objective: string;
  /** The coding model routing actually selected. Refused here if it is not one. */
  readonly selectedModel: ModelId | null;
  readonly provider: string | null;
  readonly fallbackModels: readonly ModelId[];
  readonly contextReferences: readonly string[];
  /** Repository scope the task may touch. Empty means a new project with no prior files. */
  readonly allowedFiles: readonly string[];
  readonly maximumTokens?: number;
  readonly timeoutMs?: number;
}

export const IMPLEMENTATION_TASK_ID = 'universal-implementation';

/**
 * The implementation task node.
 *
 * `operationType` is `multi_file_implementation` because that is what the role map already
 * routes to the implementation role — a new string would need a new mapping and would be a
 * second vocabulary for the same thing.
 *
 * `retryPolicy.maximumAttempts` is 1 deliberately. The scheduler refuses to retry a task it
 * recognises as mutating, and implementation is the definition of one: a second attempt
 * after a partial failure produces a second file set, and nothing downstream could tell
 * which one it received.
 */
export function implementationTaskNode(input: ImplementationTaskInput): ExecutableTaskNode {
  if (input.selectedModel) assertCodingModel(input.selectedModel, 'universal implementation task');
  for (const fallback of input.fallbackModels) {
    assertCodingModel(fallback, 'universal implementation fallback');
  }

  return {
    id: IMPLEMENTATION_TASK_ID,
    objective: input.objective,
    operationType: 'multi_file_implementation',
    requiredCapabilities: ['coding'],
    selectedRuntime: input.selectedModel ? 'model_provider' : null,
    selectedProvider: input.provider,
    selectedModel: input.selectedModel,
    requiredContextReferences: [...input.contextReferences],
    allowedFiles: [...input.allowedFiles],
    expectedOutputSchema: { description: 'the generated file set' },
    dependencies: [],
    riskLevel: 'high',
    timeoutMs: input.timeoutMs ?? 600_000,
    retryPolicy: { maximumAttempts: 1, initialBackoffMs: 0, maximumBackoffMs: 0 },
    budget: input.maximumTokens ? { maximumTokens: input.maximumTokens } : {},
    validationMethod: ['file set is non-empty', 'every file has a path and content'],
    evidenceRequirements: [...ENGINEERING_ROLES.implementation.completionEvidence],
    fallbackRoutes: input.fallbackModels.map((model) => ({ provider: null, model })),
    status: 'ready',
    attempts: 0,
    evidence: [],
  };
}

/** The real implementation step, as the phase machine calls it. */
export type ImplementFn = () => Promise<readonly ProjectFile[]>;

/**
 * Whether a generated file set may complete the task.
 *
 * Separate from the handler so the rule is testable without a model, and so the reasons are
 * enumerable rather than a single boolean. Each one has cost a real build:
 *
 *   - an empty set is the failure that produced "success with no commit";
 *   - a file with no path cannot be written and would be dropped silently at commit time;
 *   - a set where *every* file is empty is a generation that ran and produced nothing usable.
 *
 * An individually empty file is deliberately allowed. The first version of this rejected
 * them and broke a real Python follow-up fixture on `app/__init__.py`: empty package
 * markers, `py.typed` and `.gitkeep` are supposed to be empty, and refusing them would make
 * the canonical task unable to build a correct Python package.
 *
 * Truncation — the failure an empty-file check is reaching for — is already caught upstream
 * in `implementIncrementally`, which disqualifies a reply whose `finishReason` is `length`
 * before it inspects the content at all. Re-checking it here would not add a guarantee, and
 * the version that tried cost a correct build.
 */
export function assessGeneratedFiles(files: readonly ProjectFile[]): {
  usable: boolean;
  reason: string;
} {
  if (!files.length) return { usable: false, reason: 'the implementation produced no files' };

  const unnamed = files.filter((file) => !file.path?.trim());
  if (unnamed.length) {
    return { usable: false, reason: `${unnamed.length} generated file(s) have no path` };
  }

  if (files.every((file) => !file.content?.trim())) {
    return {
      usable: false,
      reason: `all ${files.length} generated file(s) are empty`,
    };
  }

  return { usable: true, reason: `${files.length} file(s) generated` };
}

/**
 * Handlers for the phases migrated so far.
 *
 * Keyed by `operationType`, which is how the scheduler dispatches. A phase with no entry
 * here is not in the graph yet; the scheduler would block it with `no handler for <class>`,
 * which is the truthful record rather than a gap to paper over.
 */
export function universalTaskHandlers(input: {
  implement: ImplementFn;
  validate?: ValidateFn;
  repair?: RepairFn;
  review?: ReviewFn;
  publish?: PublishFn;
}): Record<string, TaskHandler> {
  return {
    ...(input.repair
      ? {
          validation_repair: (async (task, state) => {
            const repaired = await input.repair!();

            // A repair that produced nothing is not a failure of the run — the phase machine
            // proceeds to report the original validation failure. But it is not a completed
            // repair either, so the task records `failed` and the record says which.
            if (!repaired?.length) {
              return {
                output: { repaired: false, fileCount: 0 },
                evidence: [evidenceFor('repair_diff', 'repair produced no changes', { repaired: null })],
                validated: false,
              };
            }

            const assessment = assessGeneratedFiles(repaired);
            if (assessment.usable) {
              state.currentWorkingSnapshot = repaired.map((file) => ({ ...file }));
              state.repairHistory.push({
                taskId: task.id,
                failureClass: 'validation_failure',
                files: repaired.map((file) => file.path),
                timestamp: new Date().toISOString(),
              });
            }

            return {
              output: { repaired: assessment.usable, files: repaired, fileCount: repaired.length },
              evidence: [
                evidenceFor('repair_diff', `repair rewrote ${repaired.length} file(s): ${assessment.reason}`, repaired),
              ],
              // §9: a repair is not successful because a model says it is fixed. This task
              // completing means a usable file set came back; revalidation, which runs after
              // it, is what decides whether the failure was actually repaired.
              validated: assessment.usable,
            };
          }) satisfies TaskHandler,
        }
      : {}),

    ...(input.review
      ? {
          code_review: (async (_task, state) => {
            const result = await input.review!();

            state.reviewFindings.push(
              ...result.findings.map((finding, index) => ({
                id: `${REVIEW_TASK_ID}-${index + 1}`,
                severity: 'high' as const,
                title: finding.slice(0, 120),
                evidence: finding,
                affectedFiles: [],
                resolved: result.approved,
              })),
            );

            return {
              output: { approved: result.approved, findings: result.findings },
              evidence: [
                evidenceFor(
                  'review_findings',
                  result.approved
                    ? `review approved with ${result.findings.length} non-blocking finding(s)`
                    : `review blocked: ${result.findings.join('; ') || 'no reason given'}`,
                  result,
                ),
              ],
              // The review adapter already fails closed — a reviewer that throws or returns
              // nothing parseable becomes `approved: false` upstream. This carries that
              // verdict through unchanged rather than re-deriving it.
              validated: result.approved,
            };
          }) satisfies TaskHandler,
        }
      : {}),

    ...(input.publish
      ? {
          github_publishing: (async (_task, state) => {
            // The Command 1 atomic writer, through the caller's commit function. No second
            // GitHub writer exists and none is created here.
            const { commitSha } = await input.publish!();
            const produced = Boolean(commitSha?.trim());

            return {
              output: { commitSha },
              evidence: [
                evidenceFor(
                  'resulting_commit_sha',
                  produced
                    ? `published ${state.generatedFiles.length} file(s) as ${commitSha}`
                    : 'the writer returned no commit sha',
                  { commitSha, startingCommitSha: state.startingCommitSha, branch: state.selectedBranch },
                ),
              ],
              // A publish with no sha is not a publish. Recording one would be the exact
              // fabricated-commit failure the command forbids by name.
              validated: produced,
            };
          }) satisfies TaskHandler,
        }
      : {}),

    ...(input.validate
      ? {
          validation: (async (task, state) => {
            // The real sandbox run. `validated` comes from exit codes, never from a model.
            const report = await input.validate!();
            const records = validationRecordsFrom(report);
            state.validationResults.push(...records);

            return {
              output: {
                passed: report.passed,
                tierReached: report.tierReached,
                blocker: report.blocker,
                executed: records.length,
              },
              evidence: [
                evidenceFor(
                  'validation_result',
                  `tier ${report.tierReached}: ${records.length} command(s) executed, ` +
                    `${report.failures.length} failed${report.blocker ? ` — ${report.blocker}` : ''}`,
                  records,
                ),
              ],
              // §19: a coding model cannot override a deterministic validation failure,
              // and neither can this handler. `passed` is the sandbox's verdict verbatim.
              validated: report.passed,
            };
          }) satisfies TaskHandler,
        }
      : {}),
    multi_file_implementation: async (task, state) => {
      // The real operation. Not a summary of one performed elsewhere.
      const files = await input.implement();
      const assessment = assessGeneratedFiles(files);

      // Recorded on canonical state so the run's own record names what was produced,
      // rather than the file set living only in the phase machine's local variable.
      if (assessment.usable) {
        state.generatedFiles = files.map((file) => file.path);
        state.currentWorkingSnapshot = files.map((file) => ({ ...file }));
      }

      return {
        output: { files, fileCount: files.length, paths: files.map((file) => file.path) },
        // Evidence is produced even when the assessment fails, because "the task ran and
        // produced an unusable result" is a different and more useful record than silence.
        // The scheduler still refuses to complete it, since `validated` is false.
        evidence: [
          evidenceFor(
            'file_mutation',
            `${task.selectedModel ?? 'unrouted'} generated ${files.length} file(s): ${assessment.reason}`,
            files,
          ),
        ],
        validated: assessment.usable,
      };
    },
  };
}

export const VALIDATION_TASK_ID = 'universal-validation';

/**
 * The validation task node.
 *
 * `providerCategory` for the validation role is `none`, and that is the point: no model
 * participates. §19 puts executable verification above model confidence, so this task's
 * outcome is decided by exit codes and nothing else. It carries no `selectedModel`, which
 * makes a model-driven pass structurally unavailable rather than merely discouraged.
 *
 * It is not treated as a mutating task — it reads and executes, it does not write — so the
 * scheduler may retry it on a thrown error. A sandbox that failed to start is worth a
 * second attempt; a test that failed is not, and that distinction is preserved because a
 * failing report returns normally rather than throwing.
 */
export function validationTaskNode(input: {
  objective: string;
  dependsOn?: readonly string[];
  timeoutMs?: number;
}): ExecutableTaskNode {
  return {
    id: VALIDATION_TASK_ID,
    objective: input.objective,
    operationType: 'validation',
    requiredCapabilities: ['validation'],
    selectedRuntime: 'sandbox',
    selectedProvider: null,
    selectedModel: null,
    requiredContextReferences: ['generated file set', 'validation plan'],
    allowedFiles: [],
    expectedOutputSchema: { description: 'the executed validation report' },
    dependencies: [...(input.dependsOn ?? [])],
    riskLevel: 'high',
    timeoutMs: input.timeoutMs ?? 900_000,
    retryPolicy: { maximumAttempts: 2, initialBackoffMs: 500, maximumBackoffMs: 4_000 },
    budget: {},
    validationMethod: ['every planned command executed', 'no required command failed'],
    evidenceRequirements: [...ENGINEERING_ROLES.validation_runtime.completionEvidence],
    fallbackRoutes: [],
    status: 'ready',
    attempts: 0,
    evidence: [],
  };
}

/** The real validation step: run the plan and report what the commands did. */
export type ValidateFn = () => Promise<ValidationReport>;

/**
 * Records every executed command on canonical state.
 *
 * §19 requires the command, exit code and bounded safe output to be persisted, not just a
 * pass/fail. Without the individual records a failed run says only that validation failed,
 * and the next question — which command, with what exit code — has no answer in the record.
 */
export function validationRecordsFrom(report: ValidationReport): ValidationRecord[] {
  const timestamp = new Date().toISOString();

  // Matched structurally rather than by object identity. `runValidationPlan` currently
  // pushes the same object into both `executed` and `failures`, so identity happens to
  // work — but it stops working the moment a report is persisted and reloaded, and a
  // reloaded report silently marking every failed command `ok: true` is the kind of defect
  // that only shows up in the record long after the run.
  const failureKeys = new Set(
    report.failures.map(
      (failure) =>
        `${failure.validation.componentRoot}|${failure.validation.phase}|` +
        `${failure.validation.command.command}|${failure.exitCode}`,
    ),
  );

  return report.executed.map((executed) => ({
    // The phase names what kind of check this was (compile, test, build); the adapter and
    // component root say where it ran. A polyglot repository runs the same phase per
    // component, so the root is what keeps two records distinguishable.
    class: `${executed.validation.phase}:${executed.validation.componentRoot || '.'}`,
    command: executed.validation.command.command,
    exitCode: executed.exitCode,
    ok: !failureKeys.has(
      `${executed.validation.componentRoot}|${executed.validation.phase}|` +
        `${executed.validation.command.command}|${executed.exitCode}`,
    ),
    // Bounded deliberately: sandbox output can be megabytes, and canonical state is
    // persisted on every transition. Truncation here is a storage decision, not a
    // reduction in what was checked — the exit code is the verdict.
    safeOutputSummary: `${executed.stdout}\n${executed.stderr}`.trim().slice(0, 2_000),
    timestamp,
    taskId: VALIDATION_TASK_ID,
  }));
}

export const REPAIR_TASK_ID = 'universal-repair';
export const REVIEW_TASK_ID = 'universal-review';
export const PUBLISH_TASK_ID = 'universal-publish';

/**
 * The repair task node.
 *
 * Bounded by construction, not by a loop counter someone has to remember to increment.
 * §9 caps repair attempts, and the cap lives on the node so the scheduler enforces it: a
 * repair that keeps failing stops rather than burning provider budget on a model that is
 * not converging.
 *
 * It is a mutating task — it rewrites generated files — so `maximumAttempts` is 1 for the
 * same reason implementation's is. A second automatic attempt would produce a second
 * repaired file set with nothing able to say which one validation then saw.
 */
export function repairTaskNode(input: {
  objective: string;
  selectedModel: ModelId | null;
  provider: string | null;
  failureCount: number;
  timeoutMs?: number;
}): ExecutableTaskNode {
  if (input.selectedModel) assertCodingModel(input.selectedModel, 'universal repair task');
  return {
    id: REPAIR_TASK_ID,
    objective: input.objective,
    operationType: 'validation_repair',
    requiredCapabilities: ['coding'],
    selectedRuntime: input.selectedModel ? 'model_provider' : null,
    selectedProvider: input.provider,
    selectedModel: input.selectedModel,
    requiredContextReferences: [
      'exact validation failures',
      'current generated file set',
      `${input.failureCount} failing command(s)`,
    ],
    allowedFiles: [],
    expectedOutputSchema: { description: 'the repaired file set' },
    dependencies: [VALIDATION_TASK_ID],
    riskLevel: 'high',
    timeoutMs: input.timeoutMs ?? 600_000,
    retryPolicy: { maximumAttempts: 1, initialBackoffMs: 0, maximumBackoffMs: 0 },
    budget: {},
    validationMethod: ['a repaired file set was produced', 'revalidation decides the outcome'],
    evidenceRequirements: [...ENGINEERING_ROLES.repair.completionEvidence],
    fallbackRoutes: [],
    status: 'ready',
    attempts: 0,
    evidence: [],
  };
}

/**
 * The review task node.
 *
 * Reads the diff and never edits it — the `independent_review` role holds no mutation tool,
 * and a reviewer that can rewrite the code it reviews is not independent of it.
 *
 * Depends on validation rather than on repair, because review must read the file set that
 * actually passed. Reviewing a set that was subsequently repaired would review code the run
 * is not going to publish.
 */
export function reviewTaskNode(input: {
  objective: string;
  selectedModel: ModelId | null;
  provider: string | null;
  timeoutMs?: number;
}): ExecutableTaskNode {
  if (input.selectedModel) assertCodingModel(input.selectedModel, 'universal review task');
  return {
    id: REVIEW_TASK_ID,
    objective: input.objective,
    operationType: 'code_review',
    requiredCapabilities: ['review'],
    selectedRuntime: input.selectedModel ? 'model_provider' : null,
    selectedProvider: input.provider,
    selectedModel: input.selectedModel,
    requiredContextReferences: ['complete generated diff', 'product specification', 'validation results'],
    allowedFiles: [],
    expectedOutputSchema: { description: 'structured review findings' },
    dependencies: [VALIDATION_TASK_ID],
    riskLevel: 'high',
    timeoutMs: input.timeoutMs ?? 300_000,
    retryPolicy: { maximumAttempts: 2, initialBackoffMs: 500, maximumBackoffMs: 4_000 },
    budget: {},
    validationMethod: ['review completed', 'no unresolved blocking finding'],
    evidenceRequirements: [...ENGINEERING_ROLES.independent_review.completionEvidence],
    fallbackRoutes: [],
    status: 'ready',
    attempts: 0,
    evidence: [],
  };
}

/**
 * The publish task node.
 *
 * Deterministic: `github_publishing`'s provider category is `none`, so no model participates
 * in the write. §13 allows a model to prepare prose and requires deterministic tools to
 * perform the mutation, and the node carrying no model is how that is enforced rather than
 * described.
 *
 * Depends on review, which depends on validation, so the graph itself states the rule that
 * nothing is published before it has been validated and reviewed.
 */
export function publishTaskNode(input: {
  objective: string;
  repository: string | null;
  baseBranch: string;
  startingCommitSha: string | null;
  timeoutMs?: number;
}): ExecutableTaskNode {
  return {
    id: PUBLISH_TASK_ID,
    objective: input.objective,
    operationType: 'github_publishing',
    requiredCapabilities: ['repository_mutation'],
    selectedRuntime: 'github_atomic_writer',
    selectedProvider: null,
    selectedModel: null,
    requiredContextReferences: [
      `repository ${input.repository ?? 'unresolved'}`,
      `base branch ${input.baseBranch}`,
      `starting sha ${input.startingCommitSha ?? 'unresolved'}`,
      'verified mutation set',
    ],
    allowedFiles: [],
    expectedOutputSchema: { description: 'the resulting commit sha' },
    dependencies: [REVIEW_TASK_ID],
    riskLevel: 'critical',
    timeoutMs: input.timeoutMs ?? 300_000,
    // A publish that failed must never be retried blindly: the first attempt may have moved
    // the ref, and a second would either duplicate the commit or write over it.
    retryPolicy: { maximumAttempts: 1, initialBackoffMs: 0, maximumBackoffMs: 0 },
    budget: {},
    validationMethod: ['a commit sha was returned'],
    evidenceRequirements: [...ENGINEERING_ROLES.github_publishing.completionEvidence],
    fallbackRoutes: [],
    status: 'ready',
    attempts: 0,
    evidence: [],
  };
}

export type RepairFn = () => Promise<readonly ProjectFile[] | null>;
export type ReviewFn = () => Promise<{ approved: boolean; findings: readonly string[] }>;
export type PublishFn = () => Promise<{ commitSha: string }>;

export interface CanonicalImplementationResult {
  readonly files: readonly ProjectFile[];
  readonly task: ExecutableTaskNode;
  readonly state: CanonicalExecutionState;
}

export class CanonicalTaskFailure extends Error {
  readonly code = 'CANONICAL_TASK_FAILED' as const;
  readonly taskId: string;
  readonly taskStatus: string;
  constructor(message: string, taskId: string, taskStatus: string) {
    super(message);
    this.name = 'CanonicalTaskFailure';
    this.taskId = taskId;
    this.taskStatus = taskStatus;
  }
}

/**
 * Runs implementation as a canonical task and returns what it produced.
 *
 * Throws on failure rather than returning a partial result, because the caller's existing
 * contract is a thrown implementation error — it already decides between a legacy fallback
 * and an outright failure from that. Preserving the throw keeps this a migration of *where*
 * the work runs rather than a change to what the run does when it fails.
 */
export async function runImplementationAsCanonicalTask(input: {
  projectId: string;
  runId: string;
  repository?: CanonicalExecutionState['repository'];
  selectedBranch?: string;
  startingCommitSha?: string | null;
  existingFiles?: readonly ProjectFile[];
  task: ImplementationTaskInput;
  implement: ImplementFn;
  store?: ExecutionStateStore;
  signal?: AbortSignal;
}): Promise<CanonicalImplementationResult> {
  const node = implementationTaskNode(input.task);
  const state = createCanonicalExecutionState({
    projectId: input.projectId,
    runId: input.runId,
    repository: input.repository ?? null,
    selectedBranch: input.selectedBranch ?? 'main',
    startingCommitSha: input.startingCommitSha ?? null,
    files: [...(input.existingFiles ?? [])],
    requiredCapabilities: ['coding'],
    tasks: [node],
  });

  const store = input.store ?? new InMemoryExecutionStateStore();
  const finished = await new ExecutionScheduler(store).run(
    state,
    universalTaskHandlers({ implement: input.implement }),
    input.signal,
  );

  const executed = finished.tasks.find((candidate) => candidate.id === IMPLEMENTATION_TASK_ID)!;
  if (executed.status !== 'completed') {
    // The scheduler's blocker states *which* rule failed, not why. For a rejected file set
    // that reads "produced evidence but did not pass its validation rule", which sends
    // whoever is debugging to the scheduler rather than to the generation. The handler's
    // evidence summary carries the actual reason, so both are reported.
    const detail = executed.evidence.at(-1)?.summary;
    const blocker = executed.blocker ?? `implementation task ended ${executed.status}`;
    throw new CanonicalTaskFailure(
      detail ? `${blocker} — ${detail}` : blocker,
      executed.id,
      executed.status,
    );
  }

  const output = executed.output as { files?: readonly ProjectFile[] } | undefined;
  return { files: output?.files ?? [], task: executed, state: finished };
}

/**
 * Runs one already-constructed task on an existing run state.
 *
 * The shared path behind repair, review and publish. Each of those differs only in the node
 * it contributes and the handler that performs it, so a per-phase runner would be three
 * copies of the same scheduler wiring — and the copies would drift on exactly the details
 * that matter, like which stub is supplied for the phases that already completed.
 *
 * Completed tasks are not re-run by the scheduler, and every phase not being executed here
 * is given a throwing stub so an accidental re-execution is loud rather than silently
 * producing a second file set or a second commit.
 */
async function runTaskOnState(input: {
  state: CanonicalExecutionState;
  node: ExecutableTaskNode;
  handlers: Omit<Parameters<typeof universalTaskHandlers>[0], 'implement'>;
  store?: ExecutionStateStore;
  signal?: AbortSignal;
}): Promise<ExecutableTaskNode> {
  input.state.tasks = [...input.state.tasks.filter((task) => task.id !== input.node.id), input.node];

  const finished = await new ExecutionScheduler(input.store ?? new InMemoryExecutionStateStore()).run(
    input.state,
    universalTaskHandlers({
      ...input.handlers,
      implement: async () => {
        throw new Error('implementation already completed for this run');
      },
    }),
    input.signal,
  );

  return finished.tasks.find((task) => task.id === input.node.id)!;
}

/**
 * Runs bounded repair as a canonical task.
 *
 * Returns the repaired file set, or null when repair produced nothing. Null is an ordinary
 * outcome — the phase machine then reports the original validation failure — so it is not
 * an error, and the task records `failed` to keep the canonical record honest about it.
 */
export async function runRepairAsCanonicalTask(input: {
  state: CanonicalExecutionState;
  objective: string;
  selectedModel: ModelId | null;
  provider: string | null;
  failureCount: number;
  repair: RepairFn;
  store?: ExecutionStateStore;
  signal?: AbortSignal;
}): Promise<{ files: readonly ProjectFile[] | null; task: ExecutableTaskNode }> {
  const node = repairTaskNode({
    objective: input.objective,
    selectedModel: input.selectedModel,
    provider: input.provider,
    failureCount: input.failureCount,
  });
  // Repair depends on validation, which has already run and failed. A `failed` dependency
  // would make the scheduler block this task, so the dependency is dropped for execution
  // while the node still records what it followed.
  const executed = await runTaskOnState({
    state: input.state,
    node: { ...node, dependencies: [] },
    handlers: { repair: input.repair },
    store: input.store,
    signal: input.signal,
  });

  const output = executed.output as { files?: readonly ProjectFile[]; repaired?: boolean } | undefined;
  return { files: output?.repaired ? (output.files ?? null) : null, task: executed };
}

/** Runs independent review as a canonical task. */
export async function runReviewAsCanonicalTask(input: {
  state: CanonicalExecutionState;
  objective: string;
  selectedModel: ModelId | null;
  provider: string | null;
  review: ReviewFn;
  store?: ExecutionStateStore;
  signal?: AbortSignal;
}): Promise<{ approved: boolean; findings: readonly string[]; task: ExecutableTaskNode }> {
  const node = reviewTaskNode({
    objective: input.objective,
    selectedModel: input.selectedModel,
    provider: input.provider,
  });
  const executed = await runTaskOnState({
    state: input.state,
    node: { ...node, dependencies: [] },
    handlers: { review: input.review },
    store: input.store,
    signal: input.signal,
  });

  const output = executed.output as { approved?: boolean; findings?: readonly string[] } | undefined;
  if (output === undefined) {
    // The reviewer did not complete at all. §46 requires that to be a rejection, not an
    // approval by default.
    return {
      approved: false,
      findings: [executed.blocker ?? 'the review task did not complete'],
      task: executed,
    };
  }
  return { approved: Boolean(output.approved), findings: output.findings ?? [], task: executed };
}

/**
 * Runs publication as a canonical task.
 *
 * Throws when no commit was produced. Unlike validation and review, there is no downstream
 * step that would notice a missing commit, so a silent null here would end the run reporting
 * success with nothing written — the exact fabricated-commit outcome the command forbids.
 */
export async function runPublishAsCanonicalTask(input: {
  state: CanonicalExecutionState;
  objective: string;
  repository: string | null;
  baseBranch: string;
  startingCommitSha: string | null;
  publish: PublishFn;
  store?: ExecutionStateStore;
  signal?: AbortSignal;
}): Promise<{ commitSha: string; task: ExecutableTaskNode }> {
  const node = publishTaskNode({
    objective: input.objective,
    repository: input.repository,
    baseBranch: input.baseBranch,
    startingCommitSha: input.startingCommitSha,
  });
  const executed = await runTaskOnState({
    state: input.state,
    node: { ...node, dependencies: [] },
    handlers: { publish: input.publish },
    store: input.store,
    signal: input.signal,
  });

  const output = executed.output as { commitSha?: string } | undefined;
  if (executed.status !== 'completed' || !output?.commitSha) {
    const detail = executed.evidence.at(-1)?.summary;
    const blocker = executed.blocker ?? `publish task ended ${executed.status}`;
    throw new CanonicalTaskFailure(
      detail ? `${blocker} — ${detail}` : blocker,
      executed.id,
      executed.status,
    );
  }
  return { commitSha: output.commitSha, task: executed };
}

export interface CanonicalValidationResult {
  readonly report: ValidationReport;
  readonly task: ExecutableTaskNode;
  readonly records: readonly ValidationRecord[];
}

/**
 * Runs validation as a canonical task and returns the report.
 *
 * Unlike implementation this does **not** throw on a failing report. A failed validation is
 * an ordinary, expected outcome that the phase machine handles by attempting bounded repair
 * — throwing would convert a repairable failure into a dead run. The task is still recorded
 * `failed`, so the canonical record and the phase machine agree about what happened while
 * the caller keeps its existing control flow.
 *
 * A thrown error is different: the sandbox did not run, so there is no verdict at all. That
 * propagates, because reporting "validation failed" for a sandbox that never started would
 * send whoever is debugging to the generated code instead of the infrastructure.
 */
export async function runValidationAsCanonicalTask(input: {
  state: CanonicalExecutionState;
  objective: string;
  validate: ValidateFn;
  store?: ExecutionStateStore;
  signal?: AbortSignal;
}): Promise<CanonicalValidationResult> {
  const node = validationTaskNode({ objective: input.objective });
  // Appended to the run's existing state rather than a fresh one, so implementation and
  // validation appear in a single task graph. Two states would make the canonical record
  // claim two runs happened.
  input.state.tasks = [...input.state.tasks.filter((task) => task.id !== node.id), node];

  const store = input.store ?? new InMemoryExecutionStateStore();

  // The report is captured here rather than returned through `task.output`. Canonical state
  // is persisted on every transition, and a report carries the full stdout and stderr of
  // every command — which for a sandbox build is routinely megabytes. The task output keeps
  // the bounded summary; the caller gets the real object without it being written to the
  // database on each save.
  let report: ValidationReport | null = null;

  const finished = await new ExecutionScheduler(store).run(
    input.state,
    universalTaskHandlers({
      // Implementation is already complete in this state; the scheduler will not re-run a
      // completed task, and a throwing stub makes an accidental re-run loud rather than
      // silently generating a second file set.
      implement: async () => {
        throw new Error('implementation already completed for this run');
      },
      validate: async () => {
        report = await input.validate();
        return report;
      },
    }),
    input.signal,
  );

  const executed = finished.tasks.find((candidate) => candidate.id === VALIDATION_TASK_ID)!;
  if (!report) {
    // No verdict at all: the sandbox did not run. Distinct from a failing report, and
    // reported as such so debugging starts at the infrastructure rather than the code.
    throw new CanonicalTaskFailure(
      executed.blocker ?? 'validation did not run',
      executed.id,
      executed.status,
    );
  }

  return {
    report,
    task: executed,
    records: finished.validationResults.filter((record) => record.taskId === VALIDATION_TASK_ID),
  };
}
