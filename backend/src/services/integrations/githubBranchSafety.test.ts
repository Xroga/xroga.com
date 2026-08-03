import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ExactBranchWriteError,
  resolveExactWritableBranch,
  resolveReadableBranch,
  verifyBranchHead,
  type BranchApi,
} from './githubBranchSafety.js';

/**
 * Cover for the wrong-branch write defect.
 *
 * `pushFilesViaGitData` resolved its write target through `getBranchHeadSha`, which
 * tries the requested branch then falls back to `main` then `master`. A push aimed at a
 * branch that did not exist yet therefore committed to `main` — and then reported the
 * branch it had asked for, so nothing in the result showed which branch was actually
 * modified.
 */

function fakeApi(branches: Record<string, string>, opts: { failCreate?: boolean } = {}): BranchApi & {
  created: string[];
} {
  const created: string[] = [];
  return {
    created,
    async getRef(branch) {
      return branches[branch] ? { sha: branches[branch] } : null;
    },
    async createRef(branch, sha) {
      if (opts.failCreate) return false;
      created.push(branch);
      branches[branch] = sha;
      return true;
    },
  };
}

test('reproduces the defect: a missing branch can no longer silently mutate main', async () => {
  const api = fakeApi({ main: 'aaaaaaa', master: 'bbbbbbb' });
  await assert.rejects(
    resolveExactWritableBranch(api, 'feature/checkout'),
    (error: unknown) => {
      assert.ok(error instanceof ExactBranchWriteError);
      assert.equal(error.reason, 'branch_missing');
      assert.equal(error.requestedBranch, 'feature/checkout');
      return true;
    },
  );
  assert.deepEqual(api.created, [], 'nothing may be created without an explicit base');
});

test('the refusal explains why falling back to main would be wrong', async () => {
  const api = fakeApi({ main: 'aaaaaaa' });
  try {
    await resolveExactWritableBranch(api, 'release/v2');
    assert.fail('should have refused');
  } catch (error) {
    assert.match((error as Error).message, /does not exist/i);
    assert.match((error as Error).message, /default branch/i);
  }
});

test('an existing branch resolves to itself and is never substituted', async () => {
  const api = fakeApi({ main: 'aaaaaaa', 'feature/x': 'ccccccc' });
  const target = await resolveExactWritableBranch(api, 'feature/x');
  assert.equal(target.branch, 'feature/x');
  assert.equal(target.sha, 'ccccccc');
  assert.equal(target.created, false);
});

test('a missing branch is created deliberately when a base commit is supplied', async () => {
  const api = fakeApi({ main: 'aaaaaaa' });
  const target = await resolveExactWritableBranch(api, 'xroga/run-123', { createFromSha: 'aaaaaaa' });
  assert.equal(target.branch, 'xroga/run-123');
  assert.equal(target.created, true);
  assert.equal(target.baseSha, 'aaaaaaa');
  assert.deepEqual(api.created, ['xroga/run-123']);
});

test('a branch that cannot be created is a refusal, not a fallback', async () => {
  const api = fakeApi({ main: 'aaaaaaa' }, { failCreate: true });
  await assert.rejects(
    resolveExactWritableBranch(api, 'xroga/run-9', { createFromSha: 'aaaaaaa' }),
    (error: unknown) => {
      assert.ok(error instanceof ExactBranchWriteError);
      assert.equal(error.reason, 'branch_create_failed');
      return true;
    },
  );
});

test('an empty branch name is refused rather than defaulted', async () => {
  const api = fakeApi({ main: 'aaaaaaa' });
  await assert.rejects(resolveExactWritableBranch(api, ''), ExactBranchWriteError);
});

test('a lookup failure is reported as such, never as a missing branch', async () => {
  const api: BranchApi = {
    async getRef() {
      throw new Error('network down');
    },
    async createRef() {
      return true;
    },
  };
  await assert.rejects(resolveExactWritableBranch(api, 'main'), (error: unknown) => {
    assert.ok(error instanceof ExactBranchWriteError);
    assert.equal(error.reason, 'branch_lookup_failed');
    return true;
  });
});

test('reads keep the convenience fallback, because a read cannot corrupt anything', async () => {
  const api = fakeApi({ main: 'aaaaaaa' });
  const ref = await resolveReadableBranch(api, 'does-not-exist');
  assert.equal(ref?.branch, 'main');
  // And the caller can see it was substituted, which is the point of returning the name.
  assert.notEqual(ref?.branch, 'does-not-exist');
});

test('a read with nothing to fall back to returns null rather than inventing a branch', async () => {
  const api = fakeApi({});
  assert.equal(await resolveReadableBranch(api, 'nope'), null);
});

test('branch head verification detects a mutation that landed elsewhere', async () => {
  const api = fakeApi({ main: 'aaaaaaa' });
  assert.deepEqual(await verifyBranchHead(api, 'main', 'aaaaaaa'), {
    verified: true,
    actualSha: 'aaaaaaa',
  });
  assert.deepEqual(await verifyBranchHead(api, 'main', 'dddddd'), {
    verified: false,
    actualSha: 'aaaaaaa',
  });
});
