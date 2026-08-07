/**
 * Tests for the persisted task graph and restart recovery.
 *
 * The facts these pin, each of which was unreachable before the graph existed: a run that
 * died lost every completed step; work could not be ordered by what it depended on; and a
 * partially-finished run had no status distinguishing "never started" from "ran and failed".
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTaskGraph,
  TaskGraphError,
  TASK_STATES,
  isTaskState,
  assertAcyclic,
  type GraphTask,
  type TaskGraphSnapshot,
} from './taskGraph.js';
import {
  MemoryCheckpointStore,
  isRunnable,
  progressOf,
  propagateBlocked,
  readyTasks,
  recoverGraph,
  resumeTaskGraph,
  runTaskGraph,
  unfinishedTasks,
  type TaskOutcome,
} from './taskGraphRunner.js';

const RUN = 'run-7f3a91c2';
const COMMIT = '4d1f2a9c8b7e6d5f4a3b2c1d0e9f8a7b6c5d4e3f';

/** Succeeds with evidence, which the runner requires. */
const ok = (detail = 'done'): TaskOutcome => ({
  state: 'succeeded',
  detail,
  evidence: [{ kind: 'test', detail, commitSha: COMMIT }],
});

function graphOf(specs: Parameters<typeof buildTaskGraph>[1]): TaskGraphSnapshot {
  return buildTaskGraph(RUN, specs, { baseCommitSha: COMMIT });
}

/**
 * Runs `fn`, requires it to throw a TaskGraphError, and hands the error back so the test can
 * assert on which rejection it was. `assert.throws` returns undefined, so it cannot be used
 * to inspect the error — and a test that only checks *that* it threw would pass on the wrong
 * rejection.
 */
function rejectionOf(fn: () => unknown): TaskGraphError {
  try {
    fn();
  } catch (error) {
    assert.ok(error instanceof TaskGraphError, `expected a TaskGraphError, got ${String(error)}`);
    return error;
  }
  assert.fail('expected a TaskGraphError; nothing was thrown');
}

describe('building the graph', () => {
  it('refuses a dependency on a task that does not exist', () => {
    const error = rejectionOf(() => graphOf([{ id: 'a', title: 'A', dependsOn: ['ghost'] }]));
    assert.equal(error.rejection, 'unknown_dependency');
    assert.match(error.message, /ghost/);
  });

  it('refuses two tasks sharing an id', () => {
    const error = rejectionOf(() => graphOf([{ id: 'a', title: 'A' }, { id: 'a', title: 'Also A' }]));
    assert.equal(error.rejection, 'duplicate_task_id');
  });

  it('refuses a cycle and names every task in it', () => {
    const error = rejectionOf(() =>
      graphOf([
        { id: 'a', title: 'A', dependsOn: ['c'] },
        { id: 'b', title: 'B', dependsOn: ['a'] },
        { id: 'c', title: 'C', dependsOn: ['b'] },
      ]),
    );
    assert.equal(error.rejection, 'cycle');
    for (const id of ['a', 'b', 'c']) assert.match(error.message, new RegExp(id));
  });

  it('refuses a self-dependency', () => {
    const error = rejectionOf(() => graphOf([{ id: 'a', title: 'A', dependsOn: ['a'] }]));
    assert.equal(error.rejection, 'cycle');
  });

  it('refuses an empty graph rather than reporting an instantly complete run', () => {
    const error = rejectionOf(() => graphOf([]));
    assert.equal(error.rejection, 'empty_graph');
  });

  it('starts every task pending with no evidence', () => {
    const snapshot = graphOf([{ id: 'a', title: 'A' }, { id: 'b', title: 'B', dependsOn: ['a'] }]);
    assert.equal(snapshot.revision, 1);
    assert.equal(snapshot.baseCommitSha, COMMIT);
    for (const task of snapshot.tasks) {
      assert.equal(task.state, 'pending');
      assert.deepEqual(task.evidence, []);
      assert.equal(task.attempts, 0);
    }
  });
});

describe('scheduling', () => {
  it('offers only tasks whose dependencies have succeeded', () => {
    const snapshot = graphOf([
      { id: 'schema', title: 'Schema' },
      { id: 'api', title: 'API', dependsOn: ['schema'] },
      { id: 'ui', title: 'UI', dependsOn: ['api'] },
    ]);
    assert.deepEqual(readyTasks(snapshot).map((t) => t.id), ['schema']);

    snapshot.tasks[0].state = 'succeeded';
    assert.deepEqual(readyTasks(snapshot).map((t) => t.id), ['api']);
  });

  it('does not treat a failed dependency as satisfied', () => {
    const snapshot = graphOf([
      { id: 'schema', title: 'Schema' },
      { id: 'api', title: 'API', dependsOn: ['schema'] },
    ]);
    snapshot.tasks[0].state = 'failed';
    snapshot.tasks[0].attempts = 2;
    assert.equal(isRunnable(snapshot, snapshot.tasks[1]), false, 'a failed dependency is not a satisfied one');
  });

  it('schedules deterministically, so a rerun reproduces the order', () => {
    const specs = [
      { id: 'z', title: 'Z' },
      { id: 'a', title: 'A' },
      { id: 'm', title: 'M' },
    ];
    assert.deepEqual(
      readyTasks(graphOf(specs)).map((t) => t.id),
      readyTasks(graphOf(specs)).map((t) => t.id),
    );
    assert.deepEqual(readyTasks(graphOf(specs)).map((t) => t.id), ['a', 'm', 'z']);
  });

  it('orders shallow tasks before the ones that depend on them', () => {
    const snapshot = graphOf([
      { id: 'deep', title: 'Deep', dependsOn: ['mid'] },
      { id: 'mid', title: 'Mid', dependsOn: ['root'] },
      { id: 'root', title: 'Root' },
      { id: 'other', title: 'Other' },
    ]);
    assert.deepEqual(readyTasks(snapshot).map((t) => t.id), ['other', 'root']);
  });
});

describe('running the graph', () => {
  it('executes tasks in dependency order and checkpoints each one', async () => {
    const store = new MemoryCheckpointStore();
    const order: string[] = [];
    const snapshot = graphOf([
      { id: 'ui', title: 'UI', dependsOn: ['api'] },
      { id: 'api', title: 'API', dependsOn: ['schema'] },
      { id: 'schema', title: 'Schema' },
    ]);

    const result = await runTaskGraph({
      snapshot,
      store,
      execute: async (task) => {
        order.push(task.id);
        return ok(`${task.id} finished`);
      },
    });

    assert.deepEqual(order, ['schema', 'api', 'ui']);
    assert.equal(result.progress.complete, true);
    assert.equal(result.progress.succeeded, 3);
    // Two per task plus the final settle write.
    assert.ok(store.writes.length >= 7, `expected a checkpoint before and after each task, saw ${store.writes.length}`);
  });

  it('records a task as running before it executes, so a crash leaves a trace', async () => {
    const store = new MemoryCheckpointStore();
    const snapshot = graphOf([{ id: 'only', title: 'Only' }]);

    await runTaskGraph({
      snapshot,
      store,
      execute: async () => ok(),
    });

    const sawRunning = store.writes.some((write) => write.tasks.some((t) => t.id === 'only' && t.state === 'running'));
    assert.ok(sawRunning, 'a checkpoint must record the task as running before it executes');
  });

  it('treats a thrown error as that task failing, not the run crashing', async () => {
    const store = new MemoryCheckpointStore();
    const snapshot = graphOf([
      { id: 'boom', title: 'Boom', maxAttempts: 1 },
      { id: 'fine', title: 'Fine' },
    ]);

    const result = await runTaskGraph({
      snapshot,
      store,
      execute: async (task) => {
        if (task.id === 'boom') throw new Error('the executor exploded');
        return ok();
      },
    });

    const boom = result.snapshot.tasks.find((t) => t.id === 'boom')!;
    assert.equal(boom.state, 'blocked', 'a task out of attempts settles as blocked');
    assert.match(boom.detail ?? '', /exploded/);
    assert.equal(result.snapshot.tasks.find((t) => t.id === 'fine')!.state, 'succeeded');
  });

  it('retries a failed task while attempts remain', async () => {
    const store = new MemoryCheckpointStore();
    const snapshot = graphOf([{ id: 'flaky', title: 'Flaky', maxAttempts: 3 }]);
    let calls = 0;

    const result = await runTaskGraph({
      snapshot,
      store,
      execute: async () => {
        calls += 1;
        return calls < 3 ? { state: 'failed' as const, detail: 'not yet' } : ok('third time');
      },
    });

    assert.equal(calls, 3);
    assert.equal(result.snapshot.tasks[0].state, 'succeeded');
    assert.equal(result.snapshot.tasks[0].attempts, 3);
  });

  it('refuses a success claimed with no evidence', async () => {
    const store = new MemoryCheckpointStore();
    const snapshot = graphOf([{ id: 'hollow', title: 'Hollow', maxAttempts: 1 }]);

    const result = await runTaskGraph({
      snapshot,
      store,
      execute: async () => ({ state: 'succeeded' as const, detail: 'trust me' }),
    });

    assert.notEqual(result.snapshot.tasks[0].state, 'succeeded');
    assert.match(result.snapshot.tasks[0].detail ?? '', /no evidence/i);
  });

  it('blocks the tasks downstream of a failure and names what stopped them', async () => {
    const store = new MemoryCheckpointStore();
    const snapshot = graphOf([
      { id: 'schema', title: 'Schema', maxAttempts: 1 },
      { id: 'api', title: 'API', dependsOn: ['schema'] },
      { id: 'ui', title: 'UI', dependsOn: ['api'] },
      { id: 'docs', title: 'Docs' },
    ]);

    const result = await runTaskGraph({
      snapshot,
      store,
      execute: async (task) => (task.id === 'schema' ? { state: 'failed' as const, detail: 'bad schema' } : ok()),
    });

    const byId = new Map(result.snapshot.tasks.map((t) => [t.id, t]));
    assert.equal(byId.get('api')!.state, 'blocked');
    assert.match(byId.get('api')!.detail ?? '', /schema/);
    assert.equal(byId.get('ui')!.state, 'blocked', 'blocking is transitive');
    assert.equal(byId.get('docs')!.state, 'succeeded', 'an unrelated task still runs');
    assert.equal(result.progress.complete, false);
  });

  it('reports an unfinished run as unfinished rather than complete', async () => {
    const store = new MemoryCheckpointStore();
    const snapshot = graphOf([
      { id: 'a', title: 'A', maxAttempts: 1 },
      { id: 'b', title: 'B', dependsOn: ['a'] },
    ]);

    const result = await runTaskGraph({
      snapshot,
      store,
      execute: async () => ({ state: 'failed' as const, detail: 'nope' }),
    });

    assert.equal(result.progress.complete, false);
    assert.deepEqual(unfinishedTasks(result.snapshot).map((t) => t.id).sort(), ['a', 'b']);
  });
});

describe('restart recovery', () => {
  it('resumes at the exact unfinished task and does not repeat finished work', async () => {
    const store = new MemoryCheckpointStore();
    const executed: string[] = [];
    const specs = [
      { id: 't1', title: 'One' },
      { id: 't2', title: 'Two', dependsOn: ['t1'] },
      { id: 't3', title: 'Three', dependsOn: ['t2'] },
      { id: 't4', title: 'Four', dependsOn: ['t3'] },
    ];

    // The first process gets two tasks in before it dies.
    await runTaskGraph({
      snapshot: graphOf(specs),
      store,
      maxSteps: 2,
      execute: async (task) => {
        executed.push(task.id);
        return ok();
      },
    });
    assert.deepEqual(executed, ['t1', 't2']);

    // A new process picks the run up from the store alone.
    const resumed = await resumeTaskGraph(RUN, {
      store,
      execute: async (task) => {
        executed.push(task.id);
        return ok();
      },
    });

    assert.equal(resumed.resumedAt, 't3', 'the resumed run must start at the first unfinished task');
    assert.deepEqual(executed, ['t1', 't2', 't3', 't4'], 't1 and t2 must not run twice');
    assert.equal(resumed.progress.complete, true);
  });

  it('puts an interrupted running task back to pending with its attempt intact', () => {
    const snapshot = graphOf([{ id: 'mid', title: 'Mid' }]);
    snapshot.tasks[0].state = 'running';
    snapshot.tasks[0].attempts = 1;

    const { snapshot: recovered, interrupted } = recoverGraph(snapshot);

    assert.deepEqual(interrupted, ['mid']);
    assert.equal(recovered.tasks[0].state, 'pending', 'an interrupted task must run again');
    assert.equal(recovered.tasks[0].attempts, 1, 'its spent attempt must still count');
    assert.match(recovered.tasks[0].detail ?? '', /restart/i);
  });

  it('does not resurrect a task that had already succeeded', () => {
    const snapshot = graphOf([{ id: 'done', title: 'Done' }]);
    snapshot.tasks[0].state = 'succeeded';
    snapshot.tasks[0].evidence = [{ kind: 'test', detail: 'passed' }];

    const { snapshot: recovered, interrupted } = recoverGraph(snapshot);
    assert.deepEqual(interrupted, []);
    assert.equal(recovered.tasks[0].state, 'succeeded');
  });

  it('reports which tasks were interrupted rather than resuming silently', async () => {
    const store = new MemoryCheckpointStore();
    const snapshot = graphOf([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
    snapshot.tasks[0].state = 'running';
    snapshot.tasks[0].attempts = 1;
    await store.save(snapshot);

    const resumed = await resumeTaskGraph(RUN, { store, execute: async () => ok() });
    assert.deepEqual(resumed.interrupted, ['a']);
  });

  it('refuses to resume a run that was never persisted', async () => {
    const store = new MemoryCheckpointStore();
    await assert.rejects(
      () => resumeTaskGraph('run-that-does-not-exist', { store, execute: async () => ok() }),
      TaskGraphError,
    );
  });

  it('refuses a snapshot carrying a state that is not a task state', () => {
    const snapshot = graphOf([{ id: 'a', title: 'A' }]);
    (snapshot.tasks[0] as unknown as { state: string }).state = 'almost_done';
    const error = rejectionOf(() => recoverGraph(snapshot));
    assert.equal(error.rejection, 'malformed_snapshot');
  });

  it('survives a restart in the middle of every task in turn', async () => {
    // Not one crash point but all of them: whichever task the process dies on, the run
    // must still finish with each task executed exactly once.
    const specs = Array.from({ length: 6 }, (_, i) => ({
      id: `s${i}`,
      title: `Step ${i}`,
      dependsOn: i ? [`s${i - 1}`] : [],
    }));

    for (let crashAfter = 1; crashAfter <= 5; crashAfter += 1) {
      const store = new MemoryCheckpointStore();
      const executed: string[] = [];
      const execute = async (task: GraphTask) => {
        executed.push(task.id);
        return ok();
      };

      await runTaskGraph({ snapshot: graphOf(specs), store, maxSteps: crashAfter, execute });
      await resumeTaskGraph(RUN, { store, execute });

      assert.deepEqual(
        executed,
        specs.map((s) => s.id),
        `crashing after ${crashAfter} step(s) must still run each task exactly once`,
      );
    }
  });
});

describe('a realistic multi-file run', () => {
  /**
   * A 40+ file black-box fixture: a build broken into per-area tasks with real
   * dependencies, run end to end, crashed halfway, and resumed. Nothing here inspects the
   * runner's internals — it asserts only on the persisted graph and the files produced.
   */
  const AREAS = [
    { id: 'schema', title: 'Database schema', files: 4, dependsOn: [] as string[] },
    { id: 'models', title: 'Domain models', files: 6, dependsOn: ['schema'] },
    { id: 'repos', title: 'Repositories', files: 6, dependsOn: ['models'] },
    { id: 'services', title: 'Services', files: 7, dependsOn: ['repos'] },
    { id: 'api', title: 'HTTP API', files: 8, dependsOn: ['services'] },
    { id: 'ui', title: 'UI', files: 9, dependsOn: ['api'] },
    { id: 'docs', title: 'Docs', files: 2, dependsOn: [] as string[] },
  ];

  const totalFiles = AREAS.reduce((n, a) => n + a.files, 0);

  function makeExecutor(written: Map<string, string>) {
    return async (task: GraphTask): Promise<TaskOutcome> => {
      const area = AREAS.find((a) => a.id === task.id)!;
      for (let i = 0; i < area.files; i += 1) {
        const path = `src/${area.id}/file${i}.ts`;
        if (written.has(path)) {
          return { state: 'failed', detail: `${path} was written twice — work was repeated.` };
        }
        written.set(path, `// ${area.title} ${i}\n`);
      }
      return {
        state: 'succeeded',
        detail: `${area.files} files`,
        evidence: [{ kind: 'files_written', detail: `${area.files} files under src/${area.id}/`, commitSha: COMMIT }],
      };
    };
  }

  it('completes a 40+ file build in dependency order', async () => {
    const store = new MemoryCheckpointStore();
    const written = new Map<string, string>();
    const snapshot = graphOf(AREAS.map((a) => ({ id: a.id, title: a.title, dependsOn: a.dependsOn })));

    const result = await runTaskGraph({ snapshot, store, execute: makeExecutor(written) });

    assert.equal(result.progress.complete, true);
    assert.equal(written.size, totalFiles);
    assert.ok(totalFiles > 40, `the fixture must exceed 40 files, it has ${totalFiles}`);
    assert.equal(result.snapshot.tasks.every((t) => t.evidence.length > 0), true, 'every task must carry evidence');
  });

  it('resumes a 40+ file build without rewriting a single finished file', async () => {
    const store = new MemoryCheckpointStore();
    const written = new Map<string, string>();
    const specs = AREAS.map((a) => ({ id: a.id, title: a.title, dependsOn: a.dependsOn }));

    // Die after three areas. The executor refuses to write a file twice, so a resumed run
    // that repeats an area fails the run rather than passing quietly.
    await runTaskGraph({ snapshot: graphOf(specs), store, maxSteps: 3, execute: makeExecutor(written) });
    const afterCrash = written.size;
    assert.ok(afterCrash > 0 && afterCrash < totalFiles, 'the crash must land mid-build');

    const resumed = await resumeTaskGraph(RUN, { store, execute: makeExecutor(written) });

    assert.equal(resumed.progress.complete, true, 'the resumed run must finish the build');
    assert.equal(written.size, totalFiles, 'every file exactly once across both processes');
  });

  it('leaves a durable record a third process can read without any in-memory state', async () => {
    const store = new MemoryCheckpointStore();
    const specs = AREAS.map((a) => ({ id: a.id, title: a.title, dependsOn: a.dependsOn }));
    await runTaskGraph({ snapshot: graphOf(specs), store, maxSteps: 2, execute: makeExecutor(new Map()) });

    const reloaded = await store.load(RUN);
    assert.ok(reloaded, 'the run must be readable from the store alone');
    const progress = progressOf(recoverGraph(reloaded).snapshot);
    assert.equal(progress.succeeded, 2);
    assert.equal(progress.complete, false);
    assert.ok(progress.pending > 0, 'the remaining work must still be pending');
  });
});

describe('the state vocabulary', () => {
  it('distinguishes blocked from failed', () => {
    assert.ok(TASK_STATES.includes('blocked'));
    assert.ok(TASK_STATES.includes('failed'));
    assert.notEqual('blocked', 'failed');
  });

  it('rejects a state that is not one of the canonical set', () => {
    for (const value of ['almost', 'done', '', null, undefined, 1]) {
      assert.equal(isTaskState(value), false, `${JSON.stringify(value)} must not be a task state`);
    }
    for (const state of TASK_STATES) assert.equal(isTaskState(state), true);
  });

  it('counts progress without treating pending as anything but pending', () => {
    const snapshot = graphOf([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
      { id: 'c', title: 'C' },
    ]);
    snapshot.tasks[0].state = 'succeeded';
    snapshot.tasks[1].state = 'skipped';

    const progress = progressOf(snapshot);
    assert.equal(progress.succeeded, 1);
    assert.equal(progress.skipped, 1);
    assert.equal(progress.pending, 1);
    assert.equal(progress.complete, false, 'a pending task means the run is not complete');
  });

  it('treats a skipped task as a recorded decision, not a hole', () => {
    const snapshot = graphOf([{ id: 'a', title: 'A' }, { id: 'b', title: 'B', dependsOn: ['a'] }]);
    snapshot.tasks[0].state = 'skipped';
    propagateBlocked(snapshot);
    assert.equal(snapshot.tasks[1].state, 'blocked', 'downstream of a skip is blocked, not pending forever');
  });

  it('keeps assertAcyclic honest on a graph that is fine', () => {
    const snapshot = graphOf([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B', dependsOn: ['a'] },
      { id: 'c', title: 'C', dependsOn: ['a', 'b'] },
    ]);
    assert.doesNotThrow(() => assertAcyclic(snapshot.tasks));
  });
});
