import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CanonicalTaskFailure,
  IMPLEMENTATION_TASK_ID,
  assessGeneratedFiles,
  implementationTaskNode,
  runImplementationAsCanonicalTask,
  runPublishAsCanonicalTask,
  runRepairAsCanonicalTask,
  runReviewAsCanonicalTask,
  runValidationAsCanonicalTask,
  publishTaskNode,
  repairTaskNode,
  reviewTaskNode,
  universalTaskHandlers,
  validationTaskNode,
  VALIDATION_TASK_ID,
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

// ── Validation as a canonical task ──────────────────────────────────────────────

const report = (over: Partial<import('./universalFlow.js').ValidationReport> = {}) => ({
  executed: [],
  passed: true,
  failures: [],
  tierReached: 'sandbox' as const,
  blocker: null,
  ...over,
});

const executedCommand = (command: string, exitCode: number) => ({
  validation: {
    componentRoot: '',
    adapterId: 'rust-cargo',
    phase: 'test' as const,
    command: { command, args: [] as string[] },
    image: null,
  },
  exitCode,
  stdout: 'output',
  stderr: '',
  skipped: false,
});

async function stateAfterImplementation() {
  const result = await runImplementationAsCanonicalTask({ ...base, implement: async () => FILES });
  return result.state;
}

test('the validation task carries no model at all', async () => {
  // §19: executable verification outranks model confidence. Carrying no model makes a
  // model-driven pass structurally unavailable rather than merely discouraged.
  const node = validationTaskNode({ objective: 'Validate' });
  assert.equal(node.selectedModel, null);
  assert.equal(node.selectedProvider, null);
  assert.equal(node.selectedRuntime, 'sandbox');
});

test('validation completes only when the sandbox says it passed', async () => {
  const state = await stateAfterImplementation();
  const result = await runValidationAsCanonicalTask({
    state,
    objective: 'Validate',
    validate: async () => report({ executed: [executedCommand('cargo test', 0)] as never }),
  });
  assert.equal(result.task.status, 'completed');
  assert.equal(result.report.passed, true);
});

test('a failing sandbox verdict fails the task and is not thrown', async () => {
  // A failed validation is an ordinary outcome the phase machine repairs. Throwing would
  // convert a repairable failure into a dead run — but the task must still record `failed`,
  // so the canonical record and the phase machine agree.
  const state = await stateAfterImplementation();
  const result = await runValidationAsCanonicalTask({
    state,
    objective: 'Validate',
    validate: async () =>
      report({
        passed: false,
        blocker: 'cargo test exited 101',
        executed: [executedCommand('cargo test', 101)] as never,
        failures: [executedCommand('cargo test', 101)] as never,
      }),
  });
  assert.equal(result.task.status, 'failed');
  assert.equal(result.report.passed, false);
});

test('a sandbox that never ran is thrown, not reported as a failed validation', async () => {
  // The distinction sends debugging to the right place: no verdict means infrastructure,
  // a failing verdict means the generated code.
  const state = await stateAfterImplementation();
  await assert.rejects(
    runValidationAsCanonicalTask({
      state,
      objective: 'Validate',
      validate: async () => {
        throw new Error('sandbox image unavailable');
      },
    }),
    (error: unknown) => error instanceof CanonicalTaskFailure,
  );
});

test('every executed command is persisted with its exit code', async () => {
  // §19 requires the command and exit code, not just pass/fail. Without them a failed run
  // says only "validation failed" and the next question has no answer in the record.
  const state = await stateAfterImplementation();
  const result = await runValidationAsCanonicalTask({
    state,
    objective: 'Validate',
    validate: async () =>
      report({
        passed: false,
        executed: [executedCommand('cargo build', 0), executedCommand('cargo test', 101)] as never,
        failures: [executedCommand('cargo test', 101)] as never,
      }),
  });

  assert.equal(result.records.length, 2);
  assert.deepEqual(result.records.map((entry) => entry.command), ['cargo build', 'cargo test']);
  assert.deepEqual(result.records.map((entry) => entry.exitCode), [0, 101]);
  assert.deepEqual(result.records.map((entry) => entry.ok), [true, false]);
});

test('validation shares one task graph with implementation', async () => {
  // Two states would make the canonical record claim two runs happened.
  const state = await stateAfterImplementation();
  const result = await runValidationAsCanonicalTask({
    state,
    objective: 'Validate',
    validate: async () => report(),
  });
  const ids = state.tasks.map((task) => task.id).sort();
  assert.deepEqual(ids, [IMPLEMENTATION_TASK_ID, VALIDATION_TASK_ID].sort());
  assert.equal(result.task.dependencies.length, 0);
});

test('implementation is not re-run when validation executes', async () => {
  // A second implementation would generate a second file set for the same run.
  const state = await stateAfterImplementation();
  await runValidationAsCanonicalTask({
    state,
    objective: 'Validate',
    validate: async () => report(),
  });
  const implementation = state.tasks.find((task) => task.id === IMPLEMENTATION_TASK_ID)!;
  assert.equal(implementation.attempts, 1);
  assert.equal(implementation.status, 'completed');
});

test('bounded output keeps canonical state from carrying whole build logs', async () => {
  const state = await stateAfterImplementation();
  const huge = { ...executedCommand('cargo build', 0), stdout: 'x'.repeat(50_000) };
  const result = await runValidationAsCanonicalTask({
    state,
    objective: 'Validate',
    validate: async () => report({ executed: [huge] as never }),
  });
  assert.ok(result.records[0]!.safeOutputSummary.length <= 2_000);
});

// ── Repair, review and publish as canonical tasks ───────────────────────────────

test('repair rewrites files but does not decide its own success', async () => {
  // §9: a repair is not successful because a model says it is fixed. This task completing
  // means a usable file set came back; revalidation is what decides whether the failure was
  // actually repaired.
  const state = await stateAfterImplementation();
  const repaired = [{ path: 'src/main.rs', content: 'fn main() { println!("fixed"); }\n' }];
  const result = await runRepairAsCanonicalTask({
    state,
    objective: 'Repair 1 failure',
    selectedModel: 'kimi_k3',
    provider: 'moonshot',
    failureCount: 1,
    repair: async () => repaired,
  });

  assert.deepEqual(result.files, repaired);
  assert.equal(result.task.status, 'completed');
  assert.equal(state.repairHistory.length, 1);
  assert.deepEqual(state.repairHistory[0]!.files, ['src/main.rs']);
});

test('a repair that produced nothing is recorded, not treated as success', async () => {
  const state = await stateAfterImplementation();
  const result = await runRepairAsCanonicalTask({
    state,
    objective: 'Repair 1 failure',
    selectedModel: 'kimi_k3',
    provider: 'moonshot',
    failureCount: 1,
    repair: async () => null,
  });

  assert.equal(result.files, null);
  assert.equal(result.task.status, 'failed');
  assert.equal(state.repairHistory.length, 0);
});

test('repair is never retried automatically', async () => {
  // A second automatic attempt produces a second repaired file set with nothing able to say
  // which one revalidation then saw.
  const node = repairTaskNode({
    objective: 'r',
    selectedModel: 'kimi_k3',
    provider: 'moonshot',
    failureCount: 1,
  });
  assert.equal(node.retryPolicy.maximumAttempts, 1);
});

test('a research model cannot be routed to repair or review', () => {
  assert.throws(
    () => repairTaskNode({ objective: 'r', selectedModel: 'grok_4_5' as never, provider: 'xai', failureCount: 1 }),
    (error: unknown) => error instanceof ProviderPolicyError,
  );
  assert.throws(
    () => reviewTaskNode({ objective: 'r', selectedModel: 'grok_4_3' as never, provider: 'xai' }),
    (error: unknown) => error instanceof ProviderPolicyError,
  );
});

test('the reviewer holds no mutation tool', () => {
  // A reviewer that can rewrite the code it reviews is not independent of it.
  const node = reviewTaskNode({ objective: 'r', selectedModel: 'deepseek_v4_pro', provider: 'openrouter' });
  assert.deepEqual(node.allowedFiles, []);
  assert.equal(node.operationType, 'code_review');
});

test('a blocking review fails the task and records the findings', async () => {
  const state = await stateAfterImplementation();
  const result = await runReviewAsCanonicalTask({
    state,
    objective: 'Review',
    selectedModel: 'deepseek_v4_pro',
    provider: 'openrouter',
    review: async () => ({ approved: false, findings: ['unauthenticated admin route'] }),
  });

  assert.equal(result.approved, false);
  assert.equal(result.task.status, 'failed');
  assert.equal(state.reviewFindings.length, 1);
  assert.match(state.reviewFindings[0]!.title, /unauthenticated admin route/);
});

test('a reviewer that does not complete is a rejection, not an approval', async () => {
  // §46. The default must never be approval.
  const state = await stateAfterImplementation();
  const result = await runReviewAsCanonicalTask({
    state,
    objective: 'Review',
    selectedModel: 'deepseek_v4_pro',
    provider: 'openrouter',
    review: async () => {
      throw new Error('reviewer timed out');
    },
  });

  assert.equal(result.approved, false);
  assert.ok(result.findings.length > 0, 'a rejection must say why');
});

test('publish carries no model', () => {
  // §13: a model may prepare prose; deterministic tools perform the mutation.
  const node = publishTaskNode({
    objective: 'Publish',
    repository: 'xroga/demo',
    baseBranch: 'main',
    startingCommitSha: 'abc123',
  });
  assert.equal(node.selectedModel, null);
  assert.equal(node.selectedProvider, null);
  assert.equal(node.selectedRuntime, 'github_atomic_writer');
  assert.equal(node.retryPolicy.maximumAttempts, 1);
});

test('publish records the resulting commit sha as evidence', async () => {
  const state = await stateAfterImplementation();
  const result = await runPublishAsCanonicalTask({
    state,
    objective: 'Publish',
    repository: 'xroga/demo',
    baseBranch: 'main',
    startingCommitSha: 'abc123',
    publish: async () => ({ commitSha: 'deadbeef' }),
  });

  assert.equal(result.commitSha, 'deadbeef');
  assert.equal(result.task.status, 'completed');
  assert.match(result.task.evidence[0]!.summary, /deadbeef/);
});

test('a publish that returns no sha fails rather than completing the run', async () => {
  // Recording a commit that does not exist is the fabricated-commit failure the command
  // forbids by name. There is no downstream step that would notice, so this must throw.
  const state = await stateAfterImplementation();
  await assert.rejects(
    runPublishAsCanonicalTask({
      state,
      objective: 'Publish',
      repository: 'xroga/demo',
      baseBranch: 'main',
      startingCommitSha: 'abc123',
      publish: async () => ({ commitSha: '' }),
    }),
    (error: unknown) => error instanceof CanonicalTaskFailure,
  );
});

test('the publish node states the exact base it was cut from', async () => {
  // A stale or moved base must be diagnosable from the record alone.
  const node = publishTaskNode({
    objective: 'Publish',
    repository: 'xroga/demo',
    baseBranch: 'release',
    startingCommitSha: 'abc123',
  });
  assert.ok(node.requiredContextReferences.includes('base branch release'));
  assert.ok(node.requiredContextReferences.includes('starting sha abc123'));
  assert.equal(node.riskLevel, 'critical');
});

test('the handler map still covers only migrated phases', () => {
  const handlers = universalTaskHandlers({
    implement: async () => FILES,
    validate: async () => report(),
    repair: async () => null,
    review: async () => ({ approved: true, findings: [] }),
    publish: async () => ({ commitSha: 'x' }),
  });
  assert.deepEqual(
    Object.keys(handlers).sort(),
    ['code_review', 'github_publishing', 'multi_file_implementation', 'validation', 'validation_repair'],
  );
});
