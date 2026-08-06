/**
 * Dependency-aware scheduling, durable checkpoints, and restart recovery.
 *
 * The recovery rule that matters: a task found in `running` at load time was interrupted,
 * not completed. Treating it as done is how a resumed run skipped work that never
 * finished; treating it as never-started is how a resumed run repeated work that had.
 * `recoverGraph` puts it back to `pending` and keeps its attempt count, so the retry
 * budget is spent honestly across restarts.
 */

import {
  TERMINAL_TASK_STATES,
  TaskGraphError,
  assertAcyclic,
  isTaskState,
  type GraphTask,
  type TaskEvidence,
  type TaskGraphSnapshot,
  type TaskState,
} from './taskGraph.js';

/** Writes a checkpoint. Any store that can persist a snapshot satisfies this. */
export interface CheckpointStore {
  save(snapshot: TaskGraphSnapshot): Promise<void>;
  load(runId: string): Promise<TaskGraphSnapshot | null>;
}

/** An in-memory store, for tests and for runs that do not outlive the process. */
export class MemoryCheckpointStore implements CheckpointStore {
  private readonly rows = new Map<string, string>();
  /** Every checkpoint written, in order. Lets a test assert what was durable when. */
  readonly writes: TaskGraphSnapshot[] = [];

  async save(snapshot: TaskGraphSnapshot): Promise<void> {
    // Stored as text so a caller holding the object cannot mutate what was "persisted".
    this.rows.set(snapshot.runId, JSON.stringify(snapshot));
    this.writes.push(JSON.parse(JSON.stringify(snapshot)) as TaskGraphSnapshot);
  }

  async load(runId: string): Promise<TaskGraphSnapshot | null> {
    const row = this.rows.get(runId);
    return row ? (JSON.parse(row) as TaskGraphSnapshot) : null;
  }
}

function findTask(snapshot: TaskGraphSnapshot, taskId: string): GraphTask {
  const task = snapshot.tasks.find((t) => t.id === taskId);
  if (!task) throw new TaskGraphError('unknown_task', `No task "${taskId}" in this run.`, taskId);
  return task;
}

/**
 * Whether a task may run now.
 *
 * A dependency that merely finished is not enough — it must have *succeeded*. A task whose
 * dependency failed or was skipped is not runnable and never becomes runnable, which is
 * what `blocked` records.
 */
export function isRunnable(snapshot: TaskGraphSnapshot, task: GraphTask): boolean {
  if (task.state !== 'pending' && task.state !== 'failed') return false;
  if (task.attempts >= task.maxAttempts && task.state === 'failed') return false;
  return task.dependsOn.every((dep) => findTask(snapshot, dep).state === 'succeeded');
}

/**
 * The tasks that may run now, in a deterministic order.
 *
 * Ordered by graph depth then id so the same graph always schedules the same way. A run
 * that reorders itself between attempts is a run whose failures cannot be reproduced.
 */
export function readyTasks(snapshot: TaskGraphSnapshot): GraphTask[] {
  const depth = new Map<string, number>();
  const depthOf = (task: GraphTask, seen = new Set<string>()): number => {
    if (depth.has(task.id)) return depth.get(task.id)!;
    if (seen.has(task.id)) return 0; // Guarded by assertAcyclic; belt and braces.
    seen.add(task.id);
    const value = task.dependsOn.length
      ? 1 + Math.max(...task.dependsOn.map((dep) => depthOf(findTask(snapshot, dep), seen)))
      : 0;
    depth.set(task.id, value);
    return value;
  };

  return snapshot.tasks
    .filter((task) => isRunnable(snapshot, task))
    .sort((a, b) => depthOf(a) - depthOf(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Marks every task that can no longer run as blocked, naming the dependency that stopped it.
 *
 * Without this a run with a failed task in the middle reported the downstream tasks as
 * `pending` forever, so the run looked like it was still making progress.
 */
export function propagateBlocked(snapshot: TaskGraphSnapshot): TaskGraphSnapshot {
  let changed = true;
  while (changed) {
    changed = false;
    for (const task of snapshot.tasks) {
      if (task.state !== 'pending' && task.state !== 'failed') continue;
      if (task.state === 'failed' && task.attempts < task.maxAttempts) continue;

      const stopper = task.dependsOn
        .map((dep) => findTask(snapshot, dep))
        .find((dep) => dep.state === 'blocked' || dep.state === 'skipped' || (dep.state === 'failed' && dep.attempts >= dep.maxAttempts));

      if (stopper) {
        task.state = 'blocked';
        task.detail = `Blocked: "${stopper.id}" ended as ${stopper.state}.`;
        changed = true;
      } else if (task.state === 'failed') {
        task.state = 'blocked';
        task.detail = task.detail ?? `Blocked: ${task.attempts} of ${task.maxAttempts} attempts used.`;
        changed = true;
      }
    }
  }
  return snapshot;
}

export interface RunProgress {
  total: number;
  succeeded: number;
  failed: number;
  blocked: number;
  skipped: number;
  pending: number;
  running: number;
  /** True when no task can run and none is running. */
  settled: boolean;
  /** True when every task succeeded or was deliberately skipped. */
  complete: boolean;
}

export function progressOf(snapshot: TaskGraphSnapshot): RunProgress {
  const count = (state: TaskState) => snapshot.tasks.filter((t) => t.state === state).length;
  const running = count('running');
  const progress: RunProgress = {
    total: snapshot.tasks.length,
    succeeded: count('succeeded'),
    failed: count('failed'),
    blocked: count('blocked'),
    skipped: count('skipped'),
    pending: count('pending'),
    running,
    settled: running === 0 && readyTasks(snapshot).length === 0,
    complete: snapshot.tasks.every((t) => t.state === 'succeeded' || t.state === 'skipped'),
  };
  return progress;
}

/**
 * Restores a snapshot to a state a new process can continue from.
 *
 * A `running` task is put back to `pending` with its attempt count intact — it was
 * interrupted, so it neither succeeded nor consumed a fresh attempt beyond the one it
 * already recorded. Anything terminal is left exactly as it was.
 */
export function recoverGraph(snapshot: TaskGraphSnapshot): {
  snapshot: TaskGraphSnapshot;
  interrupted: string[];
} {
  if (!snapshot || !Array.isArray(snapshot.tasks) || !snapshot.runId) {
    throw new TaskGraphError('malformed_snapshot', 'This is not a task graph snapshot.');
  }
  for (const task of snapshot.tasks) {
    if (!isTaskState(task.state)) {
      throw new TaskGraphError('malformed_snapshot', `Task "${task.id}" has state "${String(task.state)}".`, task.id);
    }
  }
  assertAcyclic(snapshot.tasks);

  const interrupted: string[] = [];
  for (const task of snapshot.tasks) {
    if (task.state === 'running') {
      task.state = 'pending';
      task.detail = 'Interrupted by a restart; will run again.';
      interrupted.push(task.id);
    }
  }
  return { snapshot, interrupted };
}

export interface TaskOutcome {
  state: Extract<TaskState, 'succeeded' | 'failed' | 'blocked' | 'skipped'>;
  detail?: string;
  evidence?: TaskEvidence[];
}

export interface RunGraphOptions {
  snapshot: TaskGraphSnapshot;
  store: CheckpointStore;
  /** Runs one task. Throwing is treated as a failure, not a crash. */
  execute: (task: GraphTask, snapshot: TaskGraphSnapshot) => Promise<TaskOutcome>;
  /** Stops the run after this many task executions. Tests use it to simulate a crash. */
  maxSteps?: number;
  signal?: AbortSignal;
}

/**
 * Executes the graph one task at a time, checkpointing before and after each.
 *
 * Two checkpoints per task, not one. The pre-checkpoint records `running` so a process that
 * dies mid-task leaves a trace that `recoverGraph` can see; without it an interrupted task
 * is indistinguishable from one that never started, and its attempt is never counted.
 */
export async function runTaskGraph(options: RunGraphOptions): Promise<{
  snapshot: TaskGraphSnapshot;
  progress: RunProgress;
  steps: number;
}> {
  let snapshot = options.snapshot;
  let steps = 0;

  for (;;) {
    if (options.signal?.aborted) break;
    if (options.maxSteps !== undefined && steps >= options.maxSteps) break;

    const ready = readyTasks(snapshot);
    if (!ready.length) break;

    const task = ready[0];
    task.state = 'running';
    task.attempts += 1;
    task.detail = undefined;
    snapshot.revision += 1;
    await options.store.save(snapshot);

    let outcome: TaskOutcome;
    try {
      outcome = await options.execute(task, snapshot);
    } catch (error) {
      // A thrown error is this task's failure. It does not abandon the run, because the
      // remaining tasks may not depend on it — and if they do, propagateBlocked says so.
      outcome = {
        state: 'failed',
        detail: error instanceof Error ? error.message : String(error),
      };
    }

    task.state = outcome.state;
    task.detail = outcome.detail;
    if (outcome.evidence?.length) task.evidence.push(...outcome.evidence);

    // A task cannot claim success with nothing to show for it.
    if (task.state === 'succeeded' && task.evidence.length === 0) {
      task.state = 'failed';
      task.detail = 'Reported success with no evidence; treated as a failure.';
    }

    if (task.state === 'failed' && task.attempts >= task.maxAttempts) {
      task.detail = `${task.detail ?? 'Failed.'} (${task.attempts} of ${task.maxAttempts} attempts used.)`;
    }

    steps += 1;
    snapshot.revision += 1;
    await options.store.save(snapshot);
  }

  snapshot = propagateBlocked(snapshot);
  snapshot.revision += 1;
  await options.store.save(snapshot);

  return { snapshot, progress: progressOf(snapshot), steps };
}

/**
 * Loads a run and continues it. The whole point of the persisted graph.
 *
 * Returns the tasks that were interrupted so the caller can say so, rather than resuming
 * silently and leaving the user to wonder why a step ran twice.
 */
export async function resumeTaskGraph(
  runId: string,
  options: Omit<RunGraphOptions, 'snapshot'>,
): Promise<{
  snapshot: TaskGraphSnapshot;
  progress: RunProgress;
  steps: number;
  interrupted: string[];
  resumedAt?: string;
}> {
  const stored = await options.store.load(runId);
  if (!stored) {
    throw new TaskGraphError('malformed_snapshot', `No persisted run "${runId}" to resume.`);
  }

  const { snapshot, interrupted } = recoverGraph(stored);
  const resumedAt = readyTasks(snapshot)[0]?.id;
  const result = await runTaskGraph({ ...options, snapshot });
  return { ...result, interrupted, resumedAt };
}

/** The tasks that did not succeed, for an honest final report. */
export function unfinishedTasks(snapshot: TaskGraphSnapshot): GraphTask[] {
  return snapshot.tasks.filter((t) => t.state !== 'succeeded' && t.state !== 'skipped');
}

/** True when every task reached a state it will not leave. */
export function isSettled(snapshot: TaskGraphSnapshot): boolean {
  return snapshot.tasks.every(
    (t) => TERMINAL_TASK_STATES.includes(t.state) || (t.state === 'failed' && t.attempts >= t.maxAttempts),
  );
}
