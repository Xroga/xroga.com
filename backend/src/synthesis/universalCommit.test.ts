import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  UniversalCommitError,
  atomicGitHubCommit,
  planUniversalMutations,
  type UniversalCommitRecord,
} from './universalCommit.js';
import type {
  AtomicWriteApi,
  PullRequestResult,
  RefUpdateOutcome,
} from '../services/integrations/githubAtomicWrite.js';
import type { StartingTree } from '../services/integrations/githubMutationPlan.js';
import type { RawTreeResponse } from '../services/integrations/githubTreeSnapshot.js';

/**
 * Cover for the gap PR #473 recorded and did not close: the universal path's commit step
 * was `refusingCommit`, so an enabled run reached `commit` and threw by design.
 *
 * These tests exercise the real binding — `atomicGitHubCommit` — against a fake transport,
 * and assert the properties that make its evidence trustworthy: the run branches from an
 * exact recorded SHA, writes once, never touches the base branch, preserves files it did
 * not generate, and reports a commit SHA that was read back rather than assumed.
 *
 * The failure cases matter more than the success case. A commit step that refuses loudly
 * was already correct; the risk in replacing it is that it starts succeeding quietly when
 * it should not.
 */

let counter = 0;
const nextId = (kind: string) => `${kind}-${String((counter += 1)).padStart(4, '0')}`;

interface FakeOptions {
  refConflict?: boolean;
  failCreateRef?: boolean;
  failBlob?: boolean;
  existingBranches?: string[];
}

interface Fake extends AtomicWriteApi {
  branches: Record<string, string>;
  trees: Record<string, RawTreeResponse>;
  commits: Record<string, { tree: string; parent: string | null; message: string }>;
  pullRequests: Array<{ head: string; base: string; title: string }>;
  treeEntriesWritten: Array<{ path: string; sha: string | null; mode: string }>;
  refUpdates: number;
}

/** `main` at one commit holding a README, a source file and an executable script. */
function makeFake(options: FakeOptions = {}): Fake {
  const baseTree = 'tree-base';
  const fake: Fake = {
    branches: { main: 'commit-base' },
    commits: { 'commit-base': { tree: baseTree, parent: null, message: 'initial' } },
    trees: {
      [baseTree]: {
        sha: baseTree,
        tree: [
          { path: 'README.md', sha: 'blob-readme', mode: '100644', type: 'blob' },
          { path: 'src/main.rs', sha: 'blob-main', mode: '100644', type: 'blob' },
          { path: 'scripts/run.sh', sha: 'blob-run', mode: '100755', type: 'blob' },
        ],
      },
    },
    pullRequests: [],
    treeEntriesWritten: [],
    refUpdates: 0,

    async initializeEmptyRepository() {
      throw new Error('not used by this non-empty repository fake');
    },

    async isRepositoryEmpty() {
      return false;
    },
    async isBranchProtected(branch) {
      return branch === 'main';
    },
    async getRef(branch) {
      if (options.existingBranches?.includes(branch)) return { sha: 'commit-squatter' };
      return fake.branches[branch] ? { sha: fake.branches[branch] } : null;
    },
    async createRef(branch, sha) {
      if (options.failCreateRef) return false;
      if (fake.branches[branch]) return false;
      fake.branches[branch] = sha;
      return true;
    },
    async getCommitTreeSha(commitSha) {
      return fake.commits[commitSha]?.tree ?? null;
    },
    async getTree(treeSha) {
      return fake.trees[treeSha] ?? null;
    },
    async createBlob() {
      if (options.failBlob) throw new Error('injected blob failure');
      return nextId('blob');
    },
    async createTree(baseTreeSha, entries) {
      fake.treeEntriesWritten = entries.map((e) => ({ path: e.path, sha: e.sha, mode: e.mode }));
      const merged = new Map<string, { sha: string; mode: string }>();
      for (const entry of fake.trees[baseTreeSha ?? '']?.tree ?? []) {
        if (entry.path && entry.sha) {
          merged.set(entry.path, { sha: entry.sha, mode: entry.mode ?? '100644' });
        }
      }
      for (const entry of entries) {
        if (entry.sha === null) merged.delete(entry.path);
        else merged.set(entry.path, { sha: entry.sha, mode: entry.mode });
      }
      const sha = nextId('tree');
      fake.trees[sha] = {
        sha,
        tree: [...merged].map(([path, v]) => ({ path, sha: v.sha, mode: v.mode, type: 'blob' })),
      };
      return sha;
    },
    async createCommit(message, treeSha, parentSha) {
      const sha = nextId('commit');
      fake.commits[sha] = { tree: treeSha, parent: parentSha, message };
      return sha;
    },
    async updateRef(branch, commitSha): Promise<RefUpdateOutcome> {
      fake.refUpdates += 1;
      if (options.refConflict) {
        return { ok: false, conflict: true, detail: '422 Update is not a fast forward' };
      }
      fake.branches[branch] = commitSha;
      return { ok: true };
    },
    async openPullRequest(input): Promise<PullRequestResult> {
      fake.pullRequests.push({ head: input.head, base: input.base, title: input.title });
      return { number: 12, htmlUrl: 'https://github.com/Xroga/test/pull/12' };
    },
  };
  return fake;
}

const FILES = [
  { path: 'src/main.rs', content: 'fn main() { println!("v2"); }' },
  { path: 'src/args.rs', content: 'pub struct Args;' },
];

function commitFn(fake: Fake, over: Partial<Parameters<typeof atomicGitHubCommit>[0]> = {}) {
  const records: UniversalCommitRecord[] = [];
  const fn = atomicGitHubCommit({
    token: 'unused-in-tests',
    owner: 'Xroga',
    repo: 'command-2-m19-verification',
    runId: 'run-abc123',
    baseBranch: 'main',
    api: fake,
    onRecord: (record) => records.push(record),
    ...over,
  });
  return { fn, records };
}

test('a run commits through the atomic path onto its own xroga/<run-id> branch', async () => {
  const fake = makeFake();
  const { fn, records } = commitFn(fake);

  const result = await fn({ files: FILES, message: 'Add a Rust CLI' });

  assert.equal(records.length, 1);
  const record = records[0]!;
  assert.equal(record.branch, 'xroga/run-abc123');
  assert.equal(record.baseBranch, 'main');
  assert.equal(record.branchCreated, true);
  // The branch is cut from the exact commit that was read at the start, never from
  // whatever HEAD happens to be by the time the write runs.
  assert.equal(record.startingHeadSha, 'commit-base');
  assert.equal(record.verified, true);
  assert.equal(result.commitSha, record.resultingCommitSha);
  assert.equal(fake.refUpdates, 1, 'exactly one ref update per mutation');
});

test('the base branch is never modified by a run', async () => {
  const fake = makeFake();
  const { fn } = commitFn(fake);
  await fn({ files: FILES, message: 'Add a Rust CLI' });

  assert.equal(fake.branches.main, 'commit-base', 'main must be exactly where it started');
  assert.notEqual(fake.branches['xroga/run-abc123'], 'commit-base');
});

test('a pull request opens against the exact base the run started from', async () => {
  const fake = makeFake();
  const { fn } = commitFn(fake);
  await fn({ files: FILES, message: 'Add a Rust CLI\n\nsecond line ignored in title' });

  assert.equal(fake.pullRequests.length, 1);
  assert.deepEqual(
    { head: fake.pullRequests[0]!.head, base: fake.pullRequests[0]!.base },
    { head: 'xroga/run-abc123', base: 'main' },
  );
  assert.equal(fake.pullRequests[0]!.title, 'Add a Rust CLI');
});

test('files the run did not generate are preserved, not deleted', async () => {
  const fake = makeFake();
  const { fn, records } = commitFn(fake);
  await fn({ files: FILES, message: 'Add a Rust CLI' });

  const resulting = fake.trees[fake.commits[records[0]!.resultingCommitSha]!.tree]!;
  const paths = (resulting.tree ?? []).map((entry) => entry.path).sort();
  assert.deepEqual(paths, ['README.md', 'scripts/run.sh', 'src/args.rs', 'src/main.rs']);
  // Nothing in the written entry set may be a deletion — the run asked for no deletes.
  assert.equal(fake.treeEntriesWritten.some((entry) => entry.sha === null), false);
});

test('an executable file keeps its mode when a run rewrites it', () => {
  const tree: StartingTree = {
    treeSha: 'tree-base',
    entries: [
      { path: 'scripts/run.sh', sha: 'blob-run', mode: '100755', type: 'blob' },
      { path: 'README.md', sha: 'blob-readme', mode: '100644', type: 'blob' },
    ],
  };
  const mutations = planUniversalMutations(
    [
      { path: 'scripts/run.sh', content: '#!/bin/sh\necho hi' },
      { path: 'README.md', content: '# hi' },
      { path: 'src/new.rs', content: 'fn x() {}' },
    ],
    tree,
  );

  assert.deepEqual(
    mutations.map((m) => [m.kind, 'path' in m ? m.path : '', 'mode' in m ? m.mode : undefined]),
    [
      ['update', 'scripts/run.sh', '100755'],
      ['update', 'README.md', '100644'],
      // A path absent from the starting tree is a create, decided from the tree rather
      // than from what the pipeline believed it had.
      ['create', 'src/new.rs', undefined],
    ],
  );
});

test('a branch that moved mid-run is a refusal, and nothing is overwritten', async () => {
  const fake = makeFake({ refConflict: true });
  const { fn, records } = commitFn(fake);

  await assert.rejects(
    fn({ files: FILES, message: 'Add a Rust CLI' }),
    (error: unknown) => {
      assert.ok(error instanceof UniversalCommitError);
      assert.equal(error.branchUnchanged, true);
      assert.match(error.message, /pushed to this branch while the build was running/i);
      assert.match(error.message, /nothing was overwritten/i);
      return true;
    },
  );
  assert.equal(records.length, 0, 'no record may be emitted for a write that did not land');
  assert.equal(fake.branches.main, 'commit-base');
});

test('a failure before the ref update leaves the repository untouched', async () => {
  const fake = makeFake({ failBlob: true });
  const { fn } = commitFn(fake);

  await assert.rejects(fn({ files: FILES, message: 'Add a Rust CLI' }), (error: unknown) => {
    assert.ok(error instanceof UniversalCommitError);
    assert.equal(error.branchUnchanged, true);
    return true;
  });
  assert.equal(fake.refUpdates, 0, 'no ref update may be attempted after an aborted stage');
  assert.equal(fake.branches.main, 'commit-base');
});

test('an occupied xroga/<run-id> name is side-stepped rather than overwritten', async () => {
  const fake = makeFake({ existingBranches: ['xroga/run-abc123'] });
  const { fn, records } = commitFn(fake);
  await fn({ files: FILES, message: 'Add a Rust CLI' });

  assert.notEqual(records[0]!.branch, 'xroga/run-abc123');
  assert.match(records[0]!.branch, /^xroga\/run-abc123-/);
  assert.ok(records[0]!.collisionsAvoided >= 1);
});

test('a run that generated no files refuses instead of committing nothing', async () => {
  const fake = makeFake();
  const { fn } = commitFn(fake);

  await assert.rejects(fn({ files: [], message: 'nothing' }), (error: unknown) => {
    assert.ok(error instanceof UniversalCommitError);
    assert.match(error.message, /nothing to write/i);
    return true;
  });
  assert.equal(fake.refUpdates, 0);
});

test('a missing base branch refuses rather than inventing a starting point', async () => {
  const fake = makeFake();
  const { fn } = commitFn(fake, { baseBranch: 'does-not-exist' });

  await assert.rejects(fn({ files: FILES, message: 'x' }), (error: unknown) => {
    assert.ok(error instanceof UniversalCommitError);
    assert.match(error.message, /does not exist/i);
    assert.equal(error.branchUnchanged, true);
    return true;
  });
});

test('the reported commit SHA is the one the branch actually reads back as', async () => {
  const fake = makeFake();
  const { fn, records } = commitFn(fake);
  const result = await fn({ files: FILES, message: 'Add a Rust CLI' });

  // Not merely equal to what createCommit returned — equal to what the branch points at.
  assert.equal(fake.branches[records[0]!.branch], result.commitSha);
});
