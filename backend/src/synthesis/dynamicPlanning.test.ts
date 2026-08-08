/**
 * Tests for dynamic replanning.
 *
 * Mutating a running graph is dangerous in specific ways, and each test here names one:
 * a cycle is a scheduler that never terminates, a rewritten completed task is evidence
 * that lies, and a replayed mutation is a migration task added twice.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ExecutableTaskNode, ExecutionTaskStatus } from '../ai/executionRuntime.js';
import {
  addDependency,
  addTask,
  createGraph,
  isAcyclic,
  markBlocked,
  removeInvalidDependency,
  replayMutations,
  splitTask,
  supersededTaskIds,
  supersedeTask,
  wouldCreateCycle,
} from './dynamicPlanning.js';

const task = (
  id: string,
  dependencies: string[] = [],
  status: ExecutionTaskStatus = 'pending',
): ExecutableTaskNode => ({
  id, objective: id, operationType: 'implement', requiredCapabilities: [],
  selectedRuntime: null, selectedProvider: null, selectedModel: null,
  requiredContextReferences: [], allowedFiles: [], expectedOutputSchema: {},
  dependencies, riskLevel: 'low', timeoutMs: 60_000,
  retryPolicy: { maximumAttempts: 1, initialBackoffMs: 0, maximumBackoffMs: 0 },
  budget: {}, validationMethod: [], evidenceRequirements: [], fallbackRoutes: [],
  status, attempts: 0, evidence: [],
});

const RUN = 'run-1';

describe('a task discovered mid-run', () => {
  // The scenario from §16: implementing an endpoint reveals a migration is needed first.
  it('inserts a migration and makes the endpoint wait for it', () => {
    const graph = createGraph([task('endpoint'), task('tests', ['endpoint'])]);
    const result = addTask(graph, {
      runId: RUN, kind: 'create_migration_task', task: task('migration'),
      blocks: ['endpoint'], triggeredByTaskId: 'endpoint',
      reason: 'the endpoint writes a column that does not exist yet',
      evidence: ['relation "due_date" does not exist'],
    });

    assert.equal(result.applied, true);
    const endpoint = result.graph.tasks.find((t) => t.id === 'endpoint')!;
    assert.ok(
      endpoint.dependencies.includes('migration'),
      'the endpoint must wait for the migration, not the other way round',
    );
    assert.equal(result.graph.mutations[0].kind, 'create_migration_task');
    assert.deepEqual(result.graph.mutations[0].evidence, ['relation "due_date" does not exist']);
  });

  it('records the triggering task and a reason for every mutation', () => {
    // A graph that grew during a run has to be readable afterwards.
    const graph = createGraph([task('a')]);
    const result = addTask(graph, {
      runId: RUN, kind: 'create_integration_task', task: task('integration'),
      blocks: ['a'], triggeredByTaskId: 'a', reason: 'an external provider is required',
    });
    const mutation = result.graph.mutations[0];
    assert.equal(mutation.triggeredByTaskId, 'a');
    assert.ok(mutation.reason.length > 0);
    assert.ok(mutation.at);
  });

  it('refuses a duplicate task id', () => {
    const graph = createGraph([task('a')]);
    const result = addTask(graph, { runId: RUN, kind: 'add_task', task: task('a'), reason: 'x' });
    assert.equal(result.applied, false);
    assert.match(result.reason, /already exists/);
  });
});

describe('the graph stays acyclic', () => {
  // A cycle is not a slow run — it is a scheduler that never terminates, found in
  // production. Every edit is checked before it applies.
  it('detects a direct and an indirect cycle', () => {
    const tasks = [task('a', ['c']), task('b', ['a']), task('c', ['b'])];
    assert.equal(wouldCreateCycle(tasks, 'a', 'a'), true, 'self-dependency');
    assert.equal(wouldCreateCycle(tasks, 'b', 'c'), true, 'b→c closes b→a→c→b');
  });

  it('refuses a dependency that would close a loop', () => {
    const graph = createGraph([task('a'), task('b', ['a'])]);
    const result = addDependency(graph, { runId: RUN, dependentId: 'a', dependencyId: 'b', reason: 'x' });
    assert.equal(result.applied, false);
    assert.match(result.reason, /cycle/);
    assert.equal(isAcyclic(result.graph.tasks), true);
  });

  it('refuses an inserted task that would close a loop', () => {
    const graph = createGraph([task('a'), task('b', ['a'])]);
    const inserted = { ...task('c'), dependencies: ['b'] };
    const result = addTask(graph, { runId: RUN, kind: 'add_task', task: inserted, blocks: ['a'], reason: 'x' });
    assert.equal(result.applied, false);
    assert.match(result.reason, /cycle/);
  });

  it('allows an edge that does not close a loop', () => {
    const graph = createGraph([task('a'), task('b')]);
    const result = addDependency(graph, { runId: RUN, dependentId: 'b', dependencyId: 'a', reason: 'ordering' });
    assert.equal(result.applied, true);
    assert.equal(isAcyclic(result.graph.tasks), true);
  });
});

describe('completed work is immutable', () => {
  // A completed task carries evidence — a commit, a test result — and evidence describing
  // work that was later altered is worse than none, because it is trusted.
  it('refuses to split a completed task', () => {
    const graph = createGraph([task('done', [], 'completed')]);
    const result = splitTask(graph, { runId: RUN, taskId: 'done', parts: [task('p1')], reason: 'x' });
    assert.equal(result.applied, false);
    assert.match(result.reason, /must not change/);
  });

  it('refuses to block a failed task, whose diagnostics feed the repair', () => {
    const graph = createGraph([task('broken', [], 'failed')]);
    const result = markBlocked(graph, { runId: RUN, taskId: 'broken', blocker: 'x' });
    assert.equal(result.applied, false);
    assert.match(result.reason, /rewrite a finished record/);
  });

  it('refuses to add a dependency to a completed task', () => {
    const graph = createGraph([task('done', [], 'completed'), task('other')]);
    const result = addDependency(graph, { runId: RUN, dependentId: 'done', dependencyId: 'other', reason: 'x' });
    assert.equal(result.applied, false);
    assert.match(result.reason, /would not change what already ran/);
  });

  it('supersedes without touching the original record', () => {
    const original = task('v1', [], 'completed');
    const graph = createGraph([original, task('v2')]);
    const result = supersedeTask(graph, {
      runId: RUN, taskId: 'v1', replacementTaskId: 'v2',
      reason: 'requirements changed after v1 shipped',
    });

    assert.equal(result.applied, true);
    assert.deepEqual(
      result.graph.tasks.find((t) => t.id === 'v1'),
      original,
      'the superseded task must be byte-identical to what it was',
    );
    assert.deepEqual(supersededTaskIds(result.graph), ['v1']);
  });

  it('refuses to split a running task, which would race with its replacements', () => {
    const graph = createGraph([task('running', [], 'running')]);
    const result = splitTask(graph, { runId: RUN, taskId: 'running', parts: [task('p1')], reason: 'x' });
    assert.equal(result.applied, false);
    assert.match(result.reason, /race with its own replacements/);
  });
});

describe('splitting a task', () => {
  it('moves dependents onto every part so nothing is dropped', () => {
    const graph = createGraph([task('big', ['setup']), task('after', ['big']), task('setup')]);
    const result = splitTask(graph, {
      runId: RUN, taskId: 'big', parts: [task('part1'), task('part2')],
      reason: 'the task covered two independent files',
    });

    assert.equal(result.applied, true);
    const after = result.graph.tasks.find((t) => t.id === 'after')!;
    assert.deepEqual(after.dependencies.sort(), ['part1', 'part2']);

    // Both parts inherit what the original waited for.
    for (const id of ['part1', 'part2']) {
      assert.ok(result.graph.tasks.find((t) => t.id === id)!.dependencies.includes('setup'));
    }
    assert.equal(result.graph.tasks.some((t) => t.id === 'big'), false);
  });

  it('refuses an empty split', () => {
    const graph = createGraph([task('big')]);
    assert.equal(splitTask(graph, { runId: RUN, taskId: 'big', parts: [], reason: 'x' }).applied, false);
  });
});

describe('blocking propagates downstream', () => {
  // A task waiting on a blocked one cannot run either. Leaving it pending makes the
  // scheduler look busy while nothing can progress.
  it('blocks the whole dependent subtree', () => {
    const graph = createGraph([
      task('credentials'), task('integration', ['credentials']),
      task('feature', ['integration']), task('unrelated'),
    ]);
    const result = markBlocked(graph, {
      runId: RUN, taskId: 'credentials', blocker: 'the owner must connect the provider account',
    });

    const status = Object.fromEntries(result.graph.tasks.map((t) => [t.id, t.status]));
    assert.equal(status.credentials, 'blocked');
    assert.equal(status.integration, 'blocked');
    assert.equal(status.feature, 'blocked');
    assert.equal(status.unrelated, 'pending', 'an unrelated task must keep running');
  });

  it('does not block completed tasks in the subtree', () => {
    const graph = createGraph([task('root'), task('done', ['root'], 'completed')]);
    const result = markBlocked(graph, { runId: RUN, taskId: 'root', blocker: 'x' });
    assert.equal(result.graph.tasks.find((t) => t.id === 'done')!.status, 'completed');
  });
});

describe('resume does not duplicate dynamic work', () => {
  // Restart recovery replays a run. A replan that ran before the interruption would
  // otherwise add the same migration task twice.
  it('treats a repeated mutation as a no-op rather than an error', () => {
    const graph = createGraph([task('endpoint')]);
    const first = addTask(graph, {
      runId: RUN, kind: 'create_migration_task', task: task('migration'),
      blocks: ['endpoint'], triggeredByTaskId: 'endpoint', reason: 'schema change required',
    });
    const second = addTask(first.graph, {
      runId: RUN, kind: 'create_migration_task', task: task('migration'),
      blocks: ['endpoint'], triggeredByTaskId: 'endpoint', reason: 'schema change required',
    });

    assert.equal(second.applied, false);
    assert.match(second.reason, /resume did not duplicate it/);
    assert.equal(second.graph.tasks.filter((t) => t.id === 'migration').length, 1);
    assert.equal(second.graph.mutations.length, 1);
  });

  it('produces the same key for the same decision', () => {
    const a = addTask(createGraph([task('x')]), {
      runId: RUN, kind: 'create_repair_task', task: task('repair'), triggeredByTaskId: 'x', reason: 'r',
    });
    const b = addTask(createGraph([task('x')]), {
      runId: RUN, kind: 'create_repair_task', task: task('repair'), triggeredByTaskId: 'x', reason: 'r',
    });
    assert.equal(a.graph.mutations[0].mutationKey, b.graph.mutations[0].mutationKey);
  });

  it('gives different runs different keys', () => {
    const a = addTask(createGraph([task('x')]), { runId: 'run-a', kind: 'add_task', task: task('t'), reason: 'r' });
    const b = addTask(createGraph([task('x')]), { runId: 'run-b', kind: 'add_task', task: task('t'), reason: 'r' });
    assert.notEqual(a.graph.mutations[0].mutationKey, b.graph.mutations[0].mutationKey);
  });
});

describe('restart recovery rebuilds the mutated graph', () => {
  it('replays a log to the same wiring', () => {
    const base = [task('endpoint'), task('tests', ['endpoint'])];
    const live = addTask(createGraph(base), {
      runId: RUN, kind: 'create_migration_task', task: task('migration'),
      blocks: ['endpoint'], triggeredByTaskId: 'endpoint', reason: 'schema change required',
    }).graph;

    // What persistence would hold after a crash: the task list including the added one,
    // plus the mutation log.
    const persistedTasks = [...base, task('migration')];
    const replayed = replayMutations(persistedTasks, live.mutations);

    assert.ok(replayed.tasks.find((t) => t.id === 'endpoint')!.dependencies.includes('migration'));
    assert.equal(replayed.tasks.filter((t) => t.id === 'migration').length, 1);
    assert.equal(replayed.mutations.length, 1);
  });

  it('replays a partly applied log without doubling anything', () => {
    const base = [task('a'), task('b')];
    const withDependency = addDependency(createGraph(base), {
      runId: RUN, dependentId: 'b', dependencyId: 'a', reason: 'ordering',
    }).graph;

    const replayed = replayMutations(withDependency.tasks, withDependency.mutations);
    assert.deepEqual(replayed.tasks.find((t) => t.id === 'b')!.dependencies, ['a']);
    assert.equal(replayed.mutations.length, 1);
  });

  it('restores blocked status from the log', () => {
    const base = [task('root'), task('child', ['root'])];
    const blocked = markBlocked(createGraph(base), { runId: RUN, taskId: 'root', blocker: 'credentials' }).graph;
    const replayed = replayMutations(base, blocked.mutations);

    assert.equal(replayed.tasks.find((t) => t.id === 'child')!.status, 'blocked');
  });

  it('restores a removed dependency', () => {
    const base = [task('a'), task('b', ['a'])];
    const removed = removeInvalidDependency(createGraph(base), {
      runId: RUN, dependentId: 'b', dependencyId: 'a', reason: 'the assumption did not hold',
    }).graph;
    const replayed = replayMutations(base, removed.mutations);

    assert.deepEqual(replayed.tasks.find((t) => t.id === 'b')!.dependencies, []);
  });
});
