import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BranchApi } from './githubBranchSafety.js';
import {
  MAX_RUN_BRANCH_ATTEMPTS,
  RunBranchError,
  planRunBranch,
  runBranchCandidate,
  sanitizeRunId,
} from './githubRunBranch.js';

/**
 * Cover for the branch a build proposes from.
 *
 * Three properties, none of which the old push path had: the branch is cut from the exact
 * recorded commit, an existing branch is never adopted, and the pull-request base is the
 * branch the run was actually pointed at rather than whatever the default happens to be.
 */

function fakeApi(branches: Record<string, string>): BranchApi {
  return {
    async getRef(branch) {
      return branches[branch] ? { sha: branches[branch] } : null;
    },
    async createRef() {
      throw new Error('planRunBranch must not create refs — the write path owns that');
    },
  };
}

test('a run branch is namespaced under xroga/', () => {
  assert.equal(runBranchCandidate('run-123', 0), 'xroga/run-123');
});

test('collisions take a deterministic suffix, so a run’s branches stay identifiable', () => {
  assert.equal(runBranchCandidate('run-123', 1), 'xroga/run-123-2');
  assert.equal(runBranchCandidate('run-123', 2), 'xroga/run-123-3');
});

test('run ids are reduced to something git accepts as a ref component', () => {
  assert.equal(sanitizeRunId('Run ID 42'), 'run-id-42');
  assert.equal(sanitizeRunId('a..b'), 'a.b');
  assert.equal(sanitizeRunId('--lead-and-trail--'), 'lead-and-trail');
  assert.equal(sanitizeRunId('feature~1^2:3?4*5[6'), 'feature-1-2-3-4-5-6');
  // A ref component may not end in `.lock`.
  assert.equal(sanitizeRunId('run.lock'), 'runlock');
  assert.equal(sanitizeRunId('x'.repeat(200)).length, 60);
});

test('a run id with nothing usable in it is refused rather than producing a bare prefix', () => {
  for (const runId of ['', '   ', '///', '...']) {
    assert.throws(() => sanitizeRunId(runId), (error: unknown) => {
      assert.ok(error instanceof RunBranchError);
      assert.equal(error.reason, 'invalid_run_id');
      return true;
    }, JSON.stringify(runId));
  }
});

test('the plan records the exact source commit and base branch it was given', async () => {
  const plan = await planRunBranch(fakeApi({ 'release/v2': 'aaaaaaa' }), {
    runId: 'run-7',
    sourceSha: 'aaaaaaa',
    baseBranch: 'release/v2',
  });
  assert.deepEqual(plan, {
    branch: 'xroga/run-7',
    sourceSha: 'aaaaaaa',
    baseBranch: 'release/v2',
    collisionsAvoided: 0,
  });
});

test('reproduces the defect: an existing xroga branch is never written into', async () => {
  const plan = await planRunBranch(
    fakeApi({ 'xroga/run-7': 'bbbbbbb', 'xroga/run-7-2': 'ccccccc', main: 'aaaaaaa' }),
    { runId: 'run-7', sourceSha: 'aaaaaaa', baseBranch: 'main' },
  );
  assert.equal(plan.branch, 'xroga/run-7-3');
  assert.equal(plan.collisionsAvoided, 2);
});

test('a source commit is required, so a branch can never start from an unrecorded point', async () => {
  await assert.rejects(
    planRunBranch(fakeApi({}), { runId: 'run-7', sourceSha: '', baseBranch: 'main' }),
    (error: unknown) => {
      assert.ok(error instanceof RunBranchError);
      assert.equal(error.reason, 'invalid_run_id');
      return true;
    },
  );
});

test('a base branch is required, so a pull request can never open against a guess', async () => {
  await assert.rejects(
    planRunBranch(fakeApi({}), { runId: 'run-7', sourceSha: 'aaaaaaa', baseBranch: '' }),
    (error: unknown) => {
      assert.ok(error instanceof RunBranchError);
      assert.equal(error.reason, 'invalid_run_id');
      return true;
    },
  );
});

test('exhausting every candidate name refuses rather than reusing one', async () => {
  const taken: Record<string, string> = {};
  for (let attempt = 0; attempt < MAX_RUN_BRANCH_ATTEMPTS; attempt += 1) {
    taken[runBranchCandidate('run-7', attempt)] = 'sha';
  }
  await assert.rejects(
    planRunBranch(fakeApi(taken), { runId: 'run-7', sourceSha: 'aaaaaaa', baseBranch: 'main' }),
    (error: unknown) => {
      assert.ok(error instanceof RunBranchError);
      assert.equal(error.reason, 'no_available_name');
      assert.match(error.message, /Refusing to write into an existing branch/i);
      return true;
    },
  );
});

test('a lookup failure is reported as such, never as an available name', async () => {
  const api: BranchApi = {
    async getRef() {
      throw new Error('network down');
    },
    async createRef() {
      return true;
    },
  };
  await assert.rejects(
    planRunBranch(api, { runId: 'run-7', sourceSha: 'aaaaaaa', baseBranch: 'main' }),
    (error: unknown) => {
      assert.ok(error instanceof RunBranchError);
      assert.equal(error.reason, 'lookup_failed');
      return true;
    },
  );
});

test('planning reserves nothing — ref creation stays in the write path', async () => {
  // If this module created the ref, two runs racing for a name would both believe they
  // own it. Leaving creation to `resolveExactWritableBranch` means the loser's createRef
  // fails and the write refuses, instead of writing into the winner's branch.
  const api = fakeApi({ main: 'aaaaaaa' });
  await planRunBranch(api, { runId: 'run-7', sourceSha: 'aaaaaaa', baseBranch: 'main' });
  // fakeApi throws from createRef; reaching here means it was never called.
});
