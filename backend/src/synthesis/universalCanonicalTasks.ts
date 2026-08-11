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
} from '../ai/executionRuntime.js';
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
}): Record<string, TaskHandler> {
  return {
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
