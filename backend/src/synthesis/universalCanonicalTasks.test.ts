import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CanonicalTaskFailure,
  IMPLEMENTATION_TASK_ID,
  assessGeneratedFiles,
  implementationTaskNode,
  runImplementationAsCanonicalTask,
  universalTaskHandlers,
} from './universalCanonicalTasks.js';
import { InMemoryExecutionStateStore } from '../ai/executionRuntime.js';
import { ProviderPolicyError } from '../ai/providerPolicy.js';
import type { ProjectFile } from '../ai/patches.js';

/**
 * Command 3 §18 — implementation runs as a canonical persisted task.
 *
 * The failure this migration exists to prevent is stated in the command by name: create
 * tasks, mark some complete, perform the important work outside the canonical runtime, and
 * then claim canonical execution is finished. So the assertions worth making are not that
 * a task object exists — they are that the task *did the work*, and that it cannot be
 * completed without having done it.
 */

const FILES: readonly ProjectFile[] = [
  { path: 'Cargo.toml', content: '[package]\nname = "demo"\n' },
  { path: 'src/main.rs', content: 'fn main() { println!("hi"); }\n' },
];

const base = {
  projectId: 'project-1',
  runId: 'run-1',
  task: {
    objective: 'Implement demo',
    selectedModel: 'kimi_k3' as const,
    provider: 'moonshot',
    fallbackModels: ['glm_5_2'] as const,
    contextReferences: ['product specification'],
    allowedFiles: [],
  },
};

test('the handler performs the implementation rather than describing it', async () => {
  // The distinction the whole migration turns on. If `implement` is never awaited, the
  // handler is decorative and this test is the only thing that would notice.
  let called = 0;
  const result = await runImplementationAsCanonicalTask({
    ...base,
    implement: async () => {
      called += 1;
      return FILES;
    },
  });

  assert.equal(called, 1, 'the real implementation step never ran');
  assert.deepEqual(result.files, FILES);
  assert.equal(result.task.status, 'completed');
});

test('evidence is bound to the files that were actually generated', async () => {
  // A summary a handler composed about work it did not inspect is the failure mode this
  // replaces. Hashing the real artifact means the record cannot drift from it.
  const a = await runImplementationAsCanonicalTask({ ...base, implement: async () => FILES });
  const b = await runImplementationAsCanonicalTask({
    ...base,
    implement: async () => [{ path: 'src/main.rs', content: 'fn main() {}\n' }],
  });

  const hashOf = (task: { evidence: Array<{ identifier?: string }> }) => task.evidence[0]!.identifier;
  assert.match(hashOf(a.task)!, /^sha256:[0-9a-f]{64}$/);
  assert.notEqual(hashOf(a.task), hashOf(b.task), 'different file sets produced the same evidence');
});

test('an implementation that produces nothing cannot complete', async () => {
  // Producing no files and reporting success is how a run "succeeds" with no commit.
  await assert.rejects(
    runImplementationAsCanonicalTask({ ...base, implement: async () => [] }),
    (error: unknown) => {
      assert.ok(error instanceof CanonicalTaskFailure);
      assert.equal(error.taskStatus, 'failed');
      return true;
    },
  );
});

test('an individually empty file is allowed', async () => {
  // The first version of this rule rejected any empty file and broke a real Python
  // follow-up on `app/__init__.py`. Empty package markers, `py.typed` and `.gitkeep` are
  // supposed to be empty; refusing them makes the task unable to build a correct package.
  const result = await runImplementationAsCanonicalTask({
    ...base,
    implement: async () => [
      { path: 'app/__init__.py', content: '' },
      { path: 'app/main.py', content: 'app = 1\n' },
    ],
  });
  assert.equal(result.task.status, 'completed');
  assert.deepEqual(result.state.generatedFiles, ['app/__init__.py', 'app/main.py']);
});

test('a set where every file is empty cannot complete the task', async () => {
  // The case the empty-file rule was actually reaching for: a generation that ran and
  // produced nothing usable. Truncation itself is caught upstream in
  // `implementIncrementally`, which disqualifies a reply whose finishReason is `length`.
  await assert.rejects(
    runImplementationAsCanonicalTask({
      ...base,
      implement: async () => [
        { path: 'src/main.rs', content: '   \n' },
        { path: 'src/lib.rs', content: '' },
      ],
    }),
    (error: unknown) => {
      assert.ok(error instanceof CanonicalTaskFailure);
      assert.match(error.message, /all 2 generated file\(s\) are empty/);
      return true;
    },
  );
});

test('a file with no path cannot complete the task', async () => {
  // It would be dropped silently at commit time, so the commit would be a subset of what
  // the run believes it published.
  const assessment = assessGeneratedFiles([{ path: '', content: 'x' }]);
  assert.equal(assessment.usable, false);
  assert.match(assessment.reason, /no path/);
});

test('a thrown implementation surfaces as a task failure, not a silent empty result', async () => {
  await assert.rejects(
    runImplementationAsCanonicalTask({
      ...base,
      implement: async () => {
        throw new Error('every candidate model refused');
      },
    }),
    (error: unknown) => {
      assert.ok(error instanceof CanonicalTaskFailure);
      assert.match(error.message, /every candidate model refused/);
      return true;
    },
  );
});

test('the task is persisted before it is known to have succeeded', async () => {
  // A crash mid-implementation must leave a record of which phase was in flight. Asserting
  // the store saw the task while it was still running is the only way to know that.
  const store = new InMemoryExecutionStateStore();
  const seen: string[] = [];
  const wrapped = {
    load: (runId: string) => store.load(runId),
    save: async (state: Parameters<typeof store.save>[0]) => {
      const task = state.tasks.find((candidate) => candidate.id === IMPLEMENTATION_TASK_ID);
      if (task) seen.push(task.status);
      return store.save(state);
    },
  };

  await runImplementationAsCanonicalTask({ ...base, implement: async () => FILES, store: wrapped });

  assert.ok(seen.includes('running'), `never persisted as running: ${seen.join(' → ')}`);
  assert.equal(seen.at(-1), 'completed');
});

test('canonical state records what was generated', async () => {
  const result = await runImplementationAsCanonicalTask({ ...base, implement: async () => FILES });
  assert.deepEqual(result.state.generatedFiles, ['Cargo.toml', 'src/main.rs']);
  assert.equal(result.state.currentWorkingSnapshot.length, 2);
});

test('implementation is never retried automatically', async () => {
  // A second attempt after a partial failure produces a second file set, and nothing
  // downstream could tell which one it received.
  const node = implementationTaskNode(base.task);
  assert.equal(node.retryPolicy.maximumAttempts, 1);

  let attempts = 0;
  await assert.rejects(
    runImplementationAsCanonicalTask({
      ...base,
      implement: async () => {
        attempts += 1;
        throw new Error('transient');
      },
    }),
    (error: unknown) => error instanceof CanonicalTaskFailure,
  );
  assert.equal(attempts, 1, `implementation ran ${attempts} times`);
});

test('a research model cannot be routed to the implementation task', async () => {
  // §7 held at the point the task is constructed, not only at model selection. Two
  // independent controls over the same risk.
  assert.throws(
    () => implementationTaskNode({ ...base.task, selectedModel: 'grok_4_5' as never }),
    (error: unknown) => error instanceof ProviderPolicyError,
  );
  assert.throws(
    () => implementationTaskNode({ ...base.task, fallbackModels: ['grok_4_3'] as never }),
    (error: unknown) => error instanceof ProviderPolicyError,
  );
});

test('the task records the role and the model that did the work', async () => {
  const result = await runImplementationAsCanonicalTask({ ...base, implement: async () => FILES });
  assert.equal(result.task.selectedModel, 'kimi_k3');
  assert.equal(result.task.selectedProvider, 'moonshot');
  assert.deepEqual(result.task.fallbackRoutes.map((route) => route.model), ['glm_5_2']);
  assert.ok(result.task.evidenceRequirements.includes('file_mutation'));
});

test('the handler map covers only phases that are actually migrated', () => {
  // A handler for a phase that still runs inline would report canonical execution for work
  // the runtime did not perform. The map is asserted rather than described so adding one
  // is a deliberate act.
  const handlers = universalTaskHandlers({ implement: async () => FILES });
  assert.deepEqual(Object.keys(handlers), ['multi_file_implementation']);
});
