import {
  isUninterruptibleOperation,
  type CanonicalExecutionState,
  type ExecutableTaskNode,
  type ExecutionTaskStatus,
} from '../../ai/executionRuntime.js';

export const UNCERTAIN_SIDE_EFFECT_PREFIX =
  'CANONICAL_RESUME_UNCERTAIN_SIDE_EFFECT:';

const RESUMABLE_STATUSES =
  new Set<ExecutionTaskStatus>([
    'running',
    'waiting_for_provider',
    'validating',
    'repairing',
    'cancelled',
  ]);

/**
 * These mutations are isolated/durable and have their own exact recovery
 * mechanism.
 *
 * Agent V2 implementation is checkpointed by runId, so resuming it is not
 * equivalent to blindly repeating an external side effect.
 */
const CHECKPOINT_RESUMABLE_OPERATIONS =
  new Set([
    'multi_file_implementation',
    'validation_repair',
  ]);

function dependenciesCompleted(
  state:
    CanonicalExecutionState,

  task:
    ExecutableTaskNode,
): boolean {
  return task.dependencies
    .every(
      (
        dependencyId,
      ) =>
        state.tasks
          .find(
            (
              candidate,
            ) =>
              candidate.id ===
              dependencyId,
          )
          ?.status ===
        'completed',
    );
}

function hasTerminalDependency(
  state:
    CanonicalExecutionState,

  task:
    ExecutableTaskNode,
): boolean {
  return task.dependencies
    .some(
      (
        dependencyId,
      ) => {
        const dependency =
          state.tasks.find(
            (
              candidate,
            ) =>
              candidate.id ===
              dependencyId,
          );

        return Boolean(
          dependency &&
          [
            'failed',
            'blocked',
            'cancelled',
          ].includes(
            dependency.status,
          ),
        );
      },
    );
}

function resetTaskForResume(
  state:
    CanonicalExecutionState,

  task:
    ExecutableTaskNode,
): void {
  task.status =
    dependenciesCompleted(
      state,
      task,
    )
      ? 'ready'
      : 'pending';

  task.blocker =
    undefined;

  task.startedAt =
    undefined;

  task.completedAt =
    undefined;
}

export interface CanonicalResumeResult {
  readonly state:
    CanonicalExecutionState;

  readonly resumedTaskIds:
    readonly string[];

  /**
   * External/uncertain side effects are intentionally NOT replayed.
   *
   * GitHub publication, deployment, or another non-idempotent mutation
   * must first be reconciled against external evidence.
   */
  readonly blockedUncertainTaskIds:
    readonly string[];
}

export function recoverCanonicalExecutionStateForResume(
  input:
    CanonicalExecutionState,
): CanonicalResumeResult {
  const state =
    structuredClone(
      input,
    );

  const resumedTaskIds:
    string[] =
    [];

  const blockedUncertainTaskIds:
    string[] =
    [];

  for (
    const task of
    state.tasks
  ) {
    if (
      !RESUMABLE_STATUSES.has(
        task.status,
      )
    ) {
      continue;
    }

    const hasStarted =
      Boolean(
        task.startedAt,
      );

    const isolatedCheckpointResume =
      CHECKPOINT_RESUMABLE_OPERATIONS.has(
        task.operationType,
      );

    const uncertainExternalSideEffect =
      hasStarted &&
      isUninterruptibleOperation(
        task,
      ) &&
      !isolatedCheckpointResume;

    if (
      uncertainExternalSideEffect
    ) {
      task.status =
        'blocked';

      task.blocker =
        `${UNCERTAIN_SIDE_EFFECT_PREFIX} ` +
        `${task.operationType} was interrupted after it started. ` +
        'Xroga will not replay this operation automatically. ' +
        'Inspect persisted or external evidence before continuing.';

      task.completedAt =
        new Date()
          .toISOString();

      blockedUncertainTaskIds
        .push(
          task.id,
        );

      continue;
    }

    /*
     * A process restart must not consume the attempt budget of work that
     * never reached a trustworthy terminal outcome.
     *
     * waiting_for_provider already represents a real failed attempt, so
     * its count remains intact.
     */
    if (
      (
        task.status ===
          'running' ||
        task.status ===
          'cancelled'
      ) &&
      task.attempts >
        0
    ) {
      task.attempts -=
        1;
    }

    resetTaskForResume(
      state,
      task,
    );

    resumedTaskIds.push(
      task.id,
    );
  }

  /*
   * A dependent task may have been marked "terminal upstream dependency"
   * only because its parent was cancelled/interrupted.
   *
   * Once that parent becomes resumable, unlock the child as well.
   */
  for (
    const task of
    state.tasks
  ) {
    if (
      task.status !==
        'blocked' ||
      task.blocker !==
        'terminal upstream dependency'
    ) {
      continue;
    }

    if (
      hasTerminalDependency(
        state,
        task,
      )
    ) {
      continue;
    }

    resetTaskForResume(
      state,
      task,
    );

    resumedTaskIds.push(
      task.id,
    );
  }

  state.updatedAt =
    new Date()
      .toISOString();

  return {
    state,

    resumedTaskIds: [
      ...new Set(
        resumedTaskIds,
      ),
    ],

    blockedUncertainTaskIds: [
      ...new Set(
        blockedUncertainTaskIds,
      ),
    ],
  };
}

/**
 * Resuming a run may regenerate the same route plan.
 *
 * Never append another task with the same canonical task ID.
 */
export function appendMissingExecutionTasks(
  state:
    CanonicalExecutionState,

  tasks:
    readonly ExecutableTaskNode[],
): number {
  const known =
    new Set(
      state.tasks.map(
        (
          task,
        ) =>
          task.id,
      ),
    );

  let added =
    0;

  for (
    const task of
    tasks
  ) {
    if (
      known.has(
        task.id,
      )
    ) {
      continue;
    }

    state.tasks.push(
      structuredClone(
        task,
      ),
    );

    known.add(
      task.id,
    );

    added +=
      1;
  }

  if (
    added >
    0
  ) {
    state.updatedAt =
      new Date()
        .toISOString();
  }

  return added;
}
