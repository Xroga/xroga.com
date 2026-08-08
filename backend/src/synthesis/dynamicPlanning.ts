/**
 * Changing the task graph while it is running.
 *
 * A plan made before any code was written is a hypothesis. Implementation is what tests
 * it, and it routinely discovers work nobody could have known about — an endpoint that
 * needs a migration first, an integration that needs credentials, a security check the
 * requirements implied but did not state.
 *
 * The Command 1 scheduler executes a fixed graph, which leaves two bad options when that
 * happens: restart the whole run, or press on and produce something that does not work.
 * This adds a third.
 *
 * Mutation is dangerous in specific ways, and each rule here exists because of one.
 *
 * **Completed work is immutable.** A completed task carries evidence — a commit, a test
 * result — and evidence describing work that was later altered is worse than no evidence,
 * because it is trusted. `supersede_task` marks a completed task as replaced *without*
 * touching what it recorded.
 *
 * **The graph stays acyclic.** A cycle is not a slow run; it is a scheduler that never
 * terminates, discovered in production. Every dependency edit is checked before it applies.
 *
 * **Resume must not duplicate.** Restart recovery replays a run, and a replan that ran
 * before the interruption would otherwise run again, adding the same migration task twice.
 * Every mutation carries a deterministic `mutationKey`, and applying one already present is
 * a no-op rather than an error — the same idempotency argument as a database migration.
 *
 * **Every mutation is attributable.** Reason, evidence and the triggering task, so a graph
 * that grew during a run can be read afterwards and understood.
 */

import type { ExecutableTaskNode } from '../ai/executionRuntime.js';

export const DYNAMIC_PLANNING_SCHEMA_VERSION = '1.0.0' as const;

export type PlanMutationKind =
  | 'add_task'
  | 'split_task'
  | 'add_dependency'
  | 'remove_invalid_dependency'
  | 'reorder_ready_tasks'
  | 'create_repair_task'
  | 'create_migration_task'
  | 'create_security_task'
  | 'create_integration_task'
  | 'create_deployment_preparation_task'
  | 'mark_task_blocked'
  | 'supersede_task';

export interface PlanMutation {
  readonly schemaVersion: string;
  /** Deterministic identity. Replaying a mutation with the same key is a no-op. */
  readonly mutationKey: string;
  readonly kind: PlanMutationKind;
  readonly runId: string;
  /** The task whose execution revealed the need for this change. */
  readonly triggeredByTaskId: string | null;
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly at: string;
  readonly payload: Record<string, unknown>;
}

export interface PlanGraph {
  readonly tasks: readonly ExecutableTaskNode[];
  readonly mutations: readonly PlanMutation[];
}

export interface MutationResult {
  readonly graph: PlanGraph;
  readonly applied: boolean;
  readonly reason: string;
}

/**
 * Statuses whose work is finished and whose record must not change.
 *
 * `failed` is included deliberately. A failed task's diagnostics are the input to a repair,
 * and rewriting them to look like something else destroys the reason the repair exists.
 */
const TERMINAL: ReadonlySet<string> = new Set(['completed', 'failed', 'cancelled']);

function isTerminal(task: ExecutableTaskNode): boolean {
  return TERMINAL.has(task.status as string);
}

/**
 * Whether adding `from → to` would create a cycle.
 *
 * Depth-first from the proposed dependency: if the graph can already walk back to the
 * dependent task, the edge closes a loop. Checked before every insertion rather than
 * detected later, because "later" means a scheduler that never terminates.
 */
export function wouldCreateCycle(
  tasks: readonly ExecutableTaskNode[],
  dependentId: string,
  dependencyId: string,
): boolean {
  if (dependentId === dependencyId) return true;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  const stack = [dependencyId];

  while (stack.length) {
    const current = stack.pop()!;
    if (current === dependentId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const task = byId.get(current);
    if (!task) continue;
    for (const next of task.dependencies ?? []) stack.push(next);
  }
  return false;
}

/** A stable key, so the same replan decision produces the same key on every replay. */
export function mutationKeyFor(input: {
  runId: string;
  kind: PlanMutationKind;
  triggeredByTaskId: string | null;
  subject: string;
}): string {
  return [input.runId, input.kind, input.triggeredByTaskId ?? 'root', input.subject].join('::');
}

export function createGraph(tasks: readonly ExecutableTaskNode[]): PlanGraph {
  return { tasks: [...tasks], mutations: [] };
}

function alreadyApplied(graph: PlanGraph, mutationKey: string): boolean {
  return graph.mutations.some((mutation) => mutation.mutationKey === mutationKey);
}

function record(
  graph: PlanGraph,
  tasks: readonly ExecutableTaskNode[],
  mutation: PlanMutation,
): MutationResult {
  return {
    graph: { tasks, mutations: [...graph.mutations, mutation] },
    applied: true,
    reason: mutation.reason,
  };
}

/**
 * Inserts a task discovered mid-run.
 *
 * The dependency direction is the part worth getting right. A migration discovered while
 * implementing an endpoint must run *before* it, which means the endpoint gains a
 * dependency on the migration — not the other way round. Reversed, the scheduler would run
 * the endpoint first against a schema that does not exist yet.
 */
export function addTask(
  graph: PlanGraph,
  input: {
    runId: string;
    kind: Extract<PlanMutationKind, 'add_task' | 'create_repair_task' | 'create_migration_task' | 'create_security_task' | 'create_integration_task' | 'create_deployment_preparation_task'>;
    task: ExecutableTaskNode;
    /** Tasks that must now wait for the new one. */
    blocks?: readonly string[];
    triggeredByTaskId?: string | null;
    reason: string;
    evidence?: readonly string[];
    now?: Date;
  },
): MutationResult {
  const mutationKey = mutationKeyFor({
    runId: input.runId, kind: input.kind,
    triggeredByTaskId: input.triggeredByTaskId ?? null, subject: input.task.id,
  });

  // Idempotent by design: restart recovery replays a run, and a replan that ran before the
  // interruption must not add the same task twice.
  if (alreadyApplied(graph, mutationKey)) {
    return { graph, applied: false, reason: `mutation ${mutationKey} was already applied; resume did not duplicate it` };
  }
  if (graph.tasks.some((task) => task.id === input.task.id)) {
    return { graph, applied: false, reason: `a task with id ${input.task.id} already exists` };
  }

  for (const blockedId of input.blocks ?? []) {
    if (wouldCreateCycle([...graph.tasks, input.task], blockedId, input.task.id)) {
      return { graph, applied: false, reason: `adding ${input.task.id} before ${blockedId} would create a dependency cycle` };
    }
  }

  const blocks = new Set(input.blocks ?? []);
  const tasks = [
    ...graph.tasks.map((task) =>
      blocks.has(task.id)
        ? { ...task, dependencies: [...new Set([...(task.dependencies ?? []), input.task.id])] }
        : task,
    ),
    input.task,
  ];

  return record(graph, tasks, {
    schemaVersion: DYNAMIC_PLANNING_SCHEMA_VERSION,
    mutationKey, kind: input.kind, runId: input.runId,
    triggeredByTaskId: input.triggeredByTaskId ?? null,
    reason: input.reason, evidence: input.evidence ?? [],
    at: (input.now ?? new Date()).toISOString(),
    payload: { taskId: input.task.id, blocks: [...blocks] },
  });
}

/**
 * Splits a pending task into parts.
 *
 * Refused once the task has started. Splitting running work would leave the original
 * executing while its replacements are also scheduled, and the two would race over the
 * same files.
 */
export function splitTask(
  graph: PlanGraph,
  input: {
    runId: string;
    taskId: string;
    parts: readonly ExecutableTaskNode[];
    reason: string;
    evidence?: readonly string[];
    now?: Date;
  },
): MutationResult {
  const mutationKey = mutationKeyFor({
    runId: input.runId, kind: 'split_task', triggeredByTaskId: input.taskId,
    subject: input.parts.map((part) => part.id).join(','),
  });
  if (alreadyApplied(graph, mutationKey)) {
    return { graph, applied: false, reason: `split ${mutationKey} was already applied` };
  }

  const original = graph.tasks.find((task) => task.id === input.taskId);
  if (!original) return { graph, applied: false, reason: `no task ${input.taskId}` };
  if (isTerminal(original)) {
    return { graph, applied: false, reason: `task ${input.taskId} is ${original.status} and its record must not change` };
  }
  if (original.status === 'running') {
    return { graph, applied: false, reason: `task ${input.taskId} is running; splitting it would race with its own replacements` };
  }
  if (!input.parts.length) return { graph, applied: false, reason: 'a split needs at least one part' };

  // Anything that depended on the original now depends on every part, so the original's
  // obligations are covered rather than silently dropped.
  const partIds = input.parts.map((part) => part.id);
  const tasks = [
    ...graph.tasks
      .filter((task) => task.id !== input.taskId)
      .map((task) =>
        (task.dependencies ?? []).includes(input.taskId)
          ? { ...task, dependencies: [...new Set([...(task.dependencies ?? []).filter((id) => id !== input.taskId), ...partIds])] }
          : task,
      ),
    ...input.parts.map((part) => ({
      ...part,
      dependencies: [...new Set([...(part.dependencies ?? []), ...(original.dependencies ?? [])])],
    })),
  ];

  return record(graph, tasks, {
    schemaVersion: DYNAMIC_PLANNING_SCHEMA_VERSION,
    mutationKey, kind: 'split_task', runId: input.runId, triggeredByTaskId: input.taskId,
    reason: input.reason, evidence: input.evidence ?? [],
    at: (input.now ?? new Date()).toISOString(),
    payload: { replaced: input.taskId, parts: partIds },
  });
}

/** Adds a dependency, refusing any edge that would close a cycle. */
export function addDependency(
  graph: PlanGraph,
  input: { runId: string; dependentId: string; dependencyId: string; reason: string; evidence?: readonly string[]; now?: Date },
): MutationResult {
  const mutationKey = mutationKeyFor({
    runId: input.runId, kind: 'add_dependency', triggeredByTaskId: input.dependentId, subject: input.dependencyId,
  });
  if (alreadyApplied(graph, mutationKey)) return { graph, applied: false, reason: 'already applied' };

  const dependent = graph.tasks.find((task) => task.id === input.dependentId);
  if (!dependent) return { graph, applied: false, reason: `no task ${input.dependentId}` };
  if (!graph.tasks.some((task) => task.id === input.dependencyId)) {
    return { graph, applied: false, reason: `no task ${input.dependencyId}` };
  }
  if (isTerminal(dependent)) {
    return { graph, applied: false, reason: `task ${input.dependentId} is ${dependent.status}; adding a dependency now would not change what already ran` };
  }
  if (wouldCreateCycle(graph.tasks, input.dependentId, input.dependencyId)) {
    return { graph, applied: false, reason: `${input.dependentId} depending on ${input.dependencyId} would create a cycle` };
  }

  const tasks = graph.tasks.map((task) =>
    task.id === input.dependentId
      ? { ...task, dependencies: [...new Set([...(task.dependencies ?? []), input.dependencyId])] }
      : task,
  );

  return record(graph, tasks, {
    schemaVersion: DYNAMIC_PLANNING_SCHEMA_VERSION,
    mutationKey, kind: 'add_dependency', runId: input.runId, triggeredByTaskId: input.dependentId,
    reason: input.reason, evidence: input.evidence ?? [],
    at: (input.now ?? new Date()).toISOString(),
    payload: { dependentId: input.dependentId, dependencyId: input.dependencyId },
  });
}

/** Removes a dependency that turned out not to hold. */
export function removeInvalidDependency(
  graph: PlanGraph,
  input: { runId: string; dependentId: string; dependencyId: string; reason: string; evidence?: readonly string[]; now?: Date },
): MutationResult {
  const mutationKey = mutationKeyFor({
    runId: input.runId, kind: 'remove_invalid_dependency', triggeredByTaskId: input.dependentId, subject: input.dependencyId,
  });
  if (alreadyApplied(graph, mutationKey)) return { graph, applied: false, reason: 'already applied' };

  const dependent = graph.tasks.find((task) => task.id === input.dependentId);
  if (!dependent) return { graph, applied: false, reason: `no task ${input.dependentId}` };
  if (isTerminal(dependent)) {
    return { graph, applied: false, reason: `task ${input.dependentId} is ${dependent.status} and its record must not change` };
  }

  const tasks = graph.tasks.map((task) =>
    task.id === input.dependentId
      ? { ...task, dependencies: (task.dependencies ?? []).filter((id) => id !== input.dependencyId) }
      : task,
  );

  return record(graph, tasks, {
    schemaVersion: DYNAMIC_PLANNING_SCHEMA_VERSION,
    mutationKey, kind: 'remove_invalid_dependency', runId: input.runId, triggeredByTaskId: input.dependentId,
    reason: input.reason, evidence: input.evidence ?? [],
    at: (input.now ?? new Date()).toISOString(),
    payload: { dependentId: input.dependentId, dependencyId: input.dependencyId },
  });
}

/**
 * Marks a task blocked, and everything downstream with it.
 *
 * Propagation matters: a task waiting on a blocked one cannot run either, and leaving it
 * `pending` makes the scheduler look busy while nothing can progress. Marking the whole
 * subtree means the run reports one blocker rather than a queue that mysteriously stalls.
 */
export function markBlocked(
  graph: PlanGraph,
  input: { runId: string; taskId: string; blocker: string; evidence?: readonly string[]; now?: Date },
): MutationResult {
  const mutationKey = mutationKeyFor({
    runId: input.runId, kind: 'mark_task_blocked', triggeredByTaskId: input.taskId, subject: input.blocker,
  });
  if (alreadyApplied(graph, mutationKey)) return { graph, applied: false, reason: 'already applied' };

  const target = graph.tasks.find((task) => task.id === input.taskId);
  if (!target) return { graph, applied: false, reason: `no task ${input.taskId}` };
  if (isTerminal(target)) {
    return { graph, applied: false, reason: `task ${input.taskId} is ${target.status}; blocking it now would rewrite a finished record` };
  }

  const blocked = new Set<string>([input.taskId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const task of graph.tasks) {
      if (blocked.has(task.id) || isTerminal(task)) continue;
      if ((task.dependencies ?? []).some((id) => blocked.has(id))) {
        blocked.add(task.id);
        grew = true;
      }
    }
  }

  const tasks = graph.tasks.map((task) =>
    blocked.has(task.id) ? { ...task, status: 'blocked' as ExecutableTaskNode['status'] } : task,
  );

  return record(graph, tasks, {
    schemaVersion: DYNAMIC_PLANNING_SCHEMA_VERSION,
    mutationKey, kind: 'mark_task_blocked', runId: input.runId, triggeredByTaskId: input.taskId,
    reason: input.blocker, evidence: input.evidence ?? [],
    at: (input.now ?? new Date()).toISOString(),
    payload: { blocked: [...blocked] },
  });
}

/**
 * Marks a completed task as superseded without altering what it recorded.
 *
 * The distinction is the whole point. Editing a completed task would rewrite evidence —
 * a commit, a test result — and evidence describing work that was later changed is worse
 * than none, because it is trusted. The original stays exactly as it was; a mutation
 * records that a replacement exists.
 */
export function supersedeTask(
  graph: PlanGraph,
  input: { runId: string; taskId: string; replacementTaskId: string; reason: string; evidence?: readonly string[]; now?: Date },
): MutationResult {
  const mutationKey = mutationKeyFor({
    runId: input.runId, kind: 'supersede_task', triggeredByTaskId: input.taskId, subject: input.replacementTaskId,
  });
  if (alreadyApplied(graph, mutationKey)) return { graph, applied: false, reason: 'already applied' };

  const original = graph.tasks.find((task) => task.id === input.taskId);
  if (!original) return { graph, applied: false, reason: `no task ${input.taskId}` };
  if (!graph.tasks.some((task) => task.id === input.replacementTaskId)) {
    return { graph, applied: false, reason: `replacement ${input.replacementTaskId} does not exist` };
  }

  // Tasks are returned untouched. Only the mutation log changes.
  return record(graph, graph.tasks, {
    schemaVersion: DYNAMIC_PLANNING_SCHEMA_VERSION,
    mutationKey, kind: 'supersede_task', runId: input.runId, triggeredByTaskId: input.taskId,
    reason: input.reason, evidence: input.evidence ?? [],
    at: (input.now ?? new Date()).toISOString(),
    payload: { superseded: input.taskId, replacedBy: input.replacementTaskId, originalStatus: original.status },
  });
}

/** Tasks a superseding mutation has replaced. */
export function supersededTaskIds(graph: PlanGraph): readonly string[] {
  return graph.mutations
    .filter((mutation) => mutation.kind === 'supersede_task')
    .map((mutation) => String(mutation.payload.superseded));
}

/**
 * Rebuilds a graph from its base tasks and mutation log.
 *
 * This is what makes restart recovery work. The log is the source of truth for everything
 * that happened after planning, so replaying it reconstructs the mutated graph exactly —
 * and because each mutation is keyed and idempotent, replaying a log that is partly
 * already applied is safe.
 */
export function replayMutations(
  baseTasks: readonly ExecutableTaskNode[],
  mutations: readonly PlanMutation[],
): PlanGraph {
  let graph = createGraph(baseTasks);

  for (const mutation of mutations) {
    if (alreadyApplied(graph, mutation.mutationKey)) continue;
    const payload = mutation.payload as Record<string, unknown>;

    switch (mutation.kind) {
      case 'add_task':
      case 'create_repair_task':
      case 'create_migration_task':
      case 'create_security_task':
      case 'create_integration_task':
      case 'create_deployment_preparation_task': {
        // The task body is not stored in the mutation; the caller supplies base tasks that
        // already include dynamically added ones when resuming from persistence. What the
        // log restores is the dependency wiring and the record of why.
        const taskId = String(payload.taskId);
        const blocks = (payload.blocks as string[] | undefined) ?? [];
        const tasks = graph.tasks.map((task) =>
          blocks.includes(task.id)
            ? { ...task, dependencies: [...new Set([...(task.dependencies ?? []), taskId])] }
            : task,
        );
        graph = { tasks, mutations: [...graph.mutations, mutation] };
        break;
      }
      case 'add_dependency': {
        const tasks = graph.tasks.map((task) =>
          task.id === payload.dependentId
            ? { ...task, dependencies: [...new Set([...(task.dependencies ?? []), String(payload.dependencyId)])] }
            : task,
        );
        graph = { tasks, mutations: [...graph.mutations, mutation] };
        break;
      }
      case 'remove_invalid_dependency': {
        const tasks = graph.tasks.map((task) =>
          task.id === payload.dependentId
            ? { ...task, dependencies: (task.dependencies ?? []).filter((id) => id !== payload.dependencyId) }
            : task,
        );
        graph = { tasks, mutations: [...graph.mutations, mutation] };
        break;
      }
      case 'mark_task_blocked': {
        const blocked = new Set((payload.blocked as string[] | undefined) ?? []);
        const tasks = graph.tasks.map((task) =>
          blocked.has(task.id) ? { ...task, status: 'blocked' as ExecutableTaskNode['status'] } : task,
        );
        graph = { tasks, mutations: [...graph.mutations, mutation] };
        break;
      }
      default:
        // split_task and supersede_task change no wiring that needs reconstructing here:
        // the parts arrive with the persisted task list, and superseding is log-only.
        graph = { tasks: graph.tasks, mutations: [...graph.mutations, mutation] };
    }
  }
  return graph;
}

/** Confirms the graph is still a DAG. Cheap, and the failure it catches is a hang. */
export function isAcyclic(tasks: readonly ExecutableTaskNode[]): boolean {
  for (const task of tasks) {
    for (const dependency of task.dependencies ?? []) {
      if (wouldCreateCycle(tasks.filter((other) => other.id !== task.id), task.id, dependency)) return false;
    }
  }
  return true;
}
