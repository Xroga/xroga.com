/**
 * An executable task graph with durable checkpoints and exact restart recovery.
 *
 * What was here before: nothing. A run was a straight line of pipeline stages held in one
 * function's local variables. Three consequences, all of them observed:
 *
 * 1. A run that died — process restart, deploy, crash, timeout — lost everything. There
 *    was no record of which stages had finished, so the only recovery was to start over,
 *    re-running work that had already succeeded and re-spending its tokens.
 * 2. Work could not be ordered by what it actually depended on. Stages ran in the order
 *    they were written, so a step that needed a schema had no way to say so, and the only
 *    way to express "after" was to physically move code.
 * 3. A partially-finished run had no honest status. It was neither complete nor failed,
 *    and nothing distinguished "this task never started" from "this task ran and failed".
 *
 * The graph below is the unit of persistence. Tasks carry explicit `dependsOn` edges, the
 * scheduler hands back only tasks whose dependencies have actually succeeded, and every
 * state change is a checkpoint the store can write. Recovery is not a replay: a resumed
 * run reads the persisted graph and continues at the first task that is not yet done.
 */

/**
 * The canonical task states.
 *
 * `blocked` is not a synonym for `failed`. A blocked task stopped on something outside the
 * run — a dependency that failed, a credential, an approval. A failed task stopped on a
 * defect in its own work. Reporting one as the other is how a run that needed a human
 * looked like a run that was broken.
 */
export const TASK_STATES = [
  /** Persisted, dependencies not yet satisfied or scheduler has not reached it. */
  'pending',
  /** Claimed by a worker. A task in this state at load time was interrupted. */
  'running',
  /** Finished, with evidence. */
  'succeeded',
  /** Stopped on a defect in its own work. Retryable while attempts remain. */
  'failed',
  /** Stopped on something outside the task, including a failed dependency. */
  'blocked',
  /** Deliberately not run. Records the decision rather than leaving a hole. */
  'skipped',
] as const;

export type TaskState = (typeof TASK_STATES)[number];

/** States from which a task will not run again in this run. */
export const TERMINAL_TASK_STATES: readonly TaskState[] = ['succeeded', 'blocked', 'skipped'];

export function isTaskState(value: unknown): value is TaskState {
  return typeof value === 'string' && (TASK_STATES as readonly string[]).includes(value);
}

export interface TaskEvidence {
  kind: string;
  detail: string;
  /** Set when the evidence refers to repository content at a known commit. */
  commitSha?: string;
}

export interface GraphTask {
  id: string;
  /** What this task is for, in one line. Goes in the run transcript. */
  title: string;
  /** Task ids that must have succeeded before this one may run. */
  dependsOn: readonly string[];
  state: TaskState;
  /** How many times this task has been attempted. */
  attempts: number;
  /** Attempts allowed before a failure becomes final. */
  maxAttempts: number;
  /** Why the task is in its current state, when that needs saying. */
  detail?: string;
  evidence: TaskEvidence[];
  /** Paths this task is expected to touch. Used to detect two tasks racing one file. */
  touches?: readonly string[];
}

export interface TaskGraphSnapshot {
  runId: string;
  /** Bumped on every mutation so a stale writer cannot clobber a newer checkpoint. */
  revision: number;
  tasks: GraphTask[];
  /** The commit the whole graph is based on. */
  baseCommitSha?: string;
}

export type GraphRejection =
  | 'duplicate_task_id'
  | 'unknown_dependency'
  | 'cycle'
  | 'unknown_task'
  | 'not_runnable'
  | 'empty_graph'
  | 'malformed_snapshot';

export class TaskGraphError extends Error {
  readonly rejection: GraphRejection;
  readonly taskId?: string;

  constructor(rejection: GraphRejection, message: string, taskId?: string) {
    super(message);
    this.name = 'TaskGraphError';
    this.rejection = rejection;
    this.taskId = taskId;
  }
}

export interface TaskSpec {
  id: string;
  title: string;
  dependsOn?: readonly string[];
  maxAttempts?: number;
  touches?: readonly string[];
}

/**
 * Validates a task list and returns it as a graph snapshot.
 *
 * Every rejection here is a defect that would otherwise surface as a run that hangs or
 * silently drops work: a dependency on a task that does not exist can never be satisfied,
 * and a cycle means no task in it is ever runnable.
 */
export function buildTaskGraph(
  runId: string,
  specs: readonly TaskSpec[],
  options: { baseCommitSha?: string } = {},
): TaskGraphSnapshot {
  if (!specs.length) {
    throw new TaskGraphError('empty_graph', 'A run needs at least one task.');
  }

  const seen = new Set<string>();
  for (const spec of specs) {
    if (seen.has(spec.id)) {
      throw new TaskGraphError('duplicate_task_id', `Two tasks share the id "${spec.id}".`, spec.id);
    }
    seen.add(spec.id);
  }

  for (const spec of specs) {
    for (const dep of spec.dependsOn ?? []) {
      if (!seen.has(dep)) {
        throw new TaskGraphError(
          'unknown_dependency',
          `Task "${spec.id}" depends on "${dep}", which is not in the graph.`,
          spec.id,
        );
      }
      if (dep === spec.id) {
        throw new TaskGraphError('cycle', `Task "${spec.id}" depends on itself.`, spec.id);
      }
    }
  }

  const tasks: GraphTask[] = specs.map((spec) => ({
    id: spec.id,
    title: spec.title,
    dependsOn: [...(spec.dependsOn ?? [])],
    state: 'pending' as TaskState,
    attempts: 0,
    maxAttempts: spec.maxAttempts ?? 2,
    evidence: [],
    ...(spec.touches ? { touches: [...spec.touches] } : {}),
  }));

  assertAcyclic(tasks);
  return { runId, revision: 1, tasks, baseCommitSha: options.baseCommitSha };
}

/**
 * Refuses a graph containing a cycle, naming the tasks involved.
 *
 * Kahn's algorithm: repeatedly remove tasks with no unresolved dependencies. Whatever is
 * left when nothing can be removed is exactly the set of tasks in or downstream of a cycle.
 */
export function assertAcyclic(tasks: readonly GraphTask[]): void {
  const remaining = new Map(tasks.map((t) => [t.id, new Set(t.dependsOn)]));

  let progressed = true;
  while (progressed && remaining.size) {
    progressed = false;
    for (const [id, deps] of [...remaining]) {
      if ([...deps].every((dep) => !remaining.has(dep))) {
        remaining.delete(id);
        progressed = true;
      }
    }
  }

  if (remaining.size) {
    throw new TaskGraphError(
      'cycle',
      `These tasks form a dependency cycle and can never run: ${[...remaining.keys()].sort().join(', ')}.`,
    );
  }
}
