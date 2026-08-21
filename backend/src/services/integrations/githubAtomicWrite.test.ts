import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AtomicWriteError,
  describeAtomicWriteFailure,
  writeAtomically,
  type AtomicWriteApi,
  type AtomicWriteStage,
  type PullRequestResult,
  type RefUpdateOutcome,
} from './githubAtomicWrite.js';
import { deriveFileSyncMutations, type StartingTree } from './githubMutationPlan.js';
import type { RawTreeResponse } from './githubTreeSnapshot.js';

/**
 * Failure injection across every stage of the atomic write.
 *
 * The property being proved is one sentence: **everything before the reference update
 * leaves the branch exactly where it was.** Blobs, trees and commits are git objects that
 * nothing points at until step 7, so aborting at any of them is indistinguishable from
 * never having started — and the compare-and-swap at step 7 means even that step cannot
 * overwrite a commit it did not plan against.
 *
 * The defect this replaces is worth naming precisely, because it was one layer above the
 * check that was supposed to prevent it: the old push path caught *any* Git Data failure
 * and re-applied the same files through the per-file Contents API. That handler caught the
 * concurrency refusal too, so the mechanism protecting a concurrent commit was the thing
 * that triggered the clobber. `assertNoContentsApiSurface` below is the standing check
 * that no such second path exists.
 */

interface FakeRepo {
  branches: Record<string, string>;
  commits: Record<string, { tree: string; parent: string | null; message: string }>;
  trees: Record<string, RawTreeResponse>;
  empty?: boolean;
  protectedBranches?: string[];
  protectionUnreachable?: boolean;
}

interface FakeOptions {
  /** Stage to fail. Injected as a thrown transport error, or a refused ref update. */
  failAt?: AtomicWriteStage;
  /** Make the ref update fail as a concurrency conflict rather than a transport error. */
  refConflict?: boolean;
  /** Move the branch head as soon as the ref update is attempted, simulating a racer. */
  concurrentHeadSha?: string;
  /** Make verification read back a different commit than the one that was written. */
  verificationSha?: string;
  omitPullRequestSupport?: boolean;
}

interface FakeApi extends AtomicWriteApi {
  repo: FakeRepo;
  calls: string[];
  blobCount: number;
  treeCount: number;
  commitCount: number;
  refUpdateCount: number;
  lastTreeEntries: Array<{ path: string; sha: string | null; mode: string }>;
  pullRequests: Array<{ head: string; base: string }>;
}

let objectCounter = 0;
function nextId(kind: string): string {
  objectCounter += 1;
  return `${kind}-${String(objectCounter).padStart(4, '0')}`;
}

function makeFake(repo: FakeRepo, options: FakeOptions = {}): FakeApi {
  const calls: string[] = [];
  const boom = (stage: AtomicWriteStage) => {
    if (options.failAt === stage) throw new Error(`injected ${stage} failure`);
  };

  const api: FakeApi = {
    repo,
    calls,
    blobCount: 0,
    treeCount: 0,
    commitCount: 0,
    refUpdateCount: 0,
    lastTreeEntries: [],
    pullRequests: [],

    async isRepositoryEmpty() {
      calls.push('isRepositoryEmpty');
      return repo.empty === true;
    },

    async isBranchProtected(branch) {
      calls.push(`isBranchProtected:${branch}`);
      if (repo.protectionUnreachable) return null;
      return (repo.protectedBranches ?? []).includes(branch);
    },

    async getRef(branch) {
      calls.push(`getRef:${branch}`);
      return repo.branches[branch] ? { sha: repo.branches[branch] } : null;
    },

    async createRef(branch, sha) {
      calls.push(`createRef:${branch}`);
      if (options.failAt === 'branch_resolution') return false;
      if (repo.branches[branch]) return false;
      repo.branches[branch] = sha;
      return true;
    },

    async getCommitTreeSha(commitSha) {
      calls.push(`getCommitTreeSha:${commitSha}`);
      boom('tree_snapshot');
      return repo.commits[commitSha]?.tree ?? null;
    },

    async getTree(treeSha) {
      calls.push(`getTree:${treeSha}`);
      return repo.trees[treeSha] ?? null;
    },

    async createBlob(content) {
      calls.push('createBlob');
      boom('blob_creation');
      api.blobCount += 1;
      void content;
      return nextId('blob');
    },

    async createTree(baseTreeSha, entries) {
      calls.push('createTree');
      boom('tree_creation');
      api.treeCount += 1;
      api.lastTreeEntries = entries.map((e) => ({ path: e.path, sha: e.sha, mode: e.mode }));

      const basePaths = new Map<string, { sha: string; mode: string }>();
      for (const entry of repo.trees[baseTreeSha ?? '']?.tree ?? []) {
        if (entry.path && entry.sha) {
          basePaths.set(entry.path, { sha: entry.sha, mode: entry.mode ?? '100644' });
        }
      }
      for (const entry of entries) {
        if (entry.sha === null) basePaths.delete(entry.path);
        else basePaths.set(entry.path, { sha: entry.sha, mode: entry.mode });
      }

      const treeSha = nextId('tree');
      repo.trees[treeSha] = {
        sha: treeSha,
        tree: [...basePaths].map(([path, v]) => ({ path, sha: v.sha, mode: v.mode, type: 'blob' })),
      };
      return treeSha;
    },

    async createCommit(message, treeSha, parentSha) {
      calls.push('createCommit');
      boom('commit_creation');
      api.commitCount += 1;
      const sha = nextId('commit');
      repo.commits[sha] = { tree: treeSha, parent: parentSha, message };
      return sha;
    },

    async updateRef(branch, commitSha): Promise<RefUpdateOutcome> {
      calls.push(`updateRef:${branch}`);
      api.refUpdateCount += 1;

      // A racer landing between the snapshot and this call is what compare-and-swap
      // exists for, so it is modelled here rather than as a bare status code.
      if (options.concurrentHeadSha) {
        repo.branches[branch] = options.concurrentHeadSha;
        return { ok: false, conflict: true, detail: '422 Update is not a fast forward' };
      }
      if (options.failAt === 'ref_update') {
        return options.refConflict
          ? { ok: false, conflict: true, detail: '422 Update is not a fast forward' }
          : { ok: false, conflict: false, detail: '500 internal error' };
      }

      repo.branches[branch] = options.verificationSha ?? commitSha;
      return { ok: true };
    },

    async openPullRequest(input): Promise<PullRequestResult> {
      calls.push(`openPullRequest:${input.head}->${input.base}`);
      boom('pull_request');
      api.pullRequests.push({ head: input.head, base: input.base });
      return { number: 7, htmlUrl: 'https://github.com/acme/site/pull/7' };
    },
  };

  if (options.omitPullRequestSupport) delete (api as { openPullRequest?: unknown }).openPullRequest;
  return api;
}

/** A repository with `main` at one commit holding three files. */
function repoWithFiles(
  files: Array<[path: string, sha: string, mode?: string]> = [
    ['README.md', 'sha-readme'],
    ['index.html', 'sha-index'],
    ['run.sh', 'sha-run', '100755'],
  ],
  branch = 'main',
): FakeRepo {
  return {
    branches: { [branch]: 'commit-base' },
    commits: { 'commit-base': { tree: 'tree-base', parent: null, message: 'base' } },
    trees: {
      'tree-base': {
        sha: 'tree-base',
        tree: files.map(([path, sha, mode]) => ({
          path,
          sha,
          mode: mode ?? '100644',
          type: 'blob',
        })),
      },
    },
  };
}

const AUTHORIZED = { defaultBranch: 'main', directWriteAuthorized: true } as const;

function files(entries: Array<[string, string]>) {
  return entries.map(([path, content]) => ({ path, content }));
}

function syncMutations(entries: Array<[string, string]>, deletePaths: string[] = []) {
  return (tree: StartingTree) => deriveFileSyncMutations(tree, files(entries), deletePaths);
}

/**
 * The standing check that no second, non-atomic write path exists.
 *
 * Written as a shape assertion on the transport interface rather than a source grep,
 * because the defect was never that the Contents API was *called* — it was that a
 * fallback existed at all, reachable from a catch block, with the same authority to
 * modify the branch.
 */
function assertNoContentsApiSurface(api: FakeApi): void {
  const contentsShaped = api.calls.filter((call) => /contents|putFile|deleteFile|pushFile/i.test(call));
  assert.deepEqual(contentsShaped, [], 'no per-file Contents API call may exist on any path');
  assert.ok(api.refUpdateCount <= 1, 'a build updates the reference at most once');
  assert.ok(api.commitCount <= 1, 'a build creates at most one commit');
}

// --- the happy path, and what it records -------------------------------------------

test('a build lands as one tree, one commit and one reference update', async () => {
  const repo = repoWithFiles();
  const api = makeFake(repo);

  const record = await writeAtomically(api, { owner: 'acme', repo: 'site' }, {
    branch: 'main',
    mutations: syncMutations([['index.html', '<html>new</html>'], ['about.html', 'new page']]),
    message: 'build',
    ...AUTHORIZED,
  });

  assert.equal(api.treeCount, 1);
  assert.equal(api.commitCount, 1);
  assert.equal(api.refUpdateCount, 1);
  assert.equal(api.blobCount, 2);
  assert.equal(repo.branches.main, record.resultingCommitSha);
  assert.equal(record.verified, true);
  assertNoContentsApiSurface(api);
});

test('the record carries everything needed to audit the write', async () => {
  const repo = repoWithFiles();
  const api = makeFake(repo);

  const record = await writeAtomically(api, { owner: 'acme', repo: 'site' }, {
    branch: 'main',
    mutations: syncMutations([['index.html', 'v2']], ['README.md']),
    message: 'build',
    ...AUTHORIZED,
  });

  assert.equal(record.owner, 'acme');
  assert.equal(record.repo, 'site');
  assert.equal(record.branch, 'main');
  assert.equal(record.startingHeadSha, 'commit-base');
  assert.equal(record.startingTreeSha, 'tree-base');
  assert.match(record.resultingCommitSha, /^commit-/);
  assert.match(record.resultingTreeSha, /^tree-/);
  assert.equal(record.directWriteAuthorized, true);
  assert.deepEqual(
    record.manifest.map((m) => [m.kind, m.path]),
    [['update', 'index.html'], ['delete', 'README.md']],
  );
  // Everything the build did not name is recorded as preserved, not assumed.
  assert.deepEqual(record.preservedPaths, ['run.sh']);
});

test('unchanged files survive and executable modes are preserved', async () => {
  const repo = repoWithFiles();
  const api = makeFake(repo);

  const record = await writeAtomically(api, { owner: 'acme', repo: 'site' }, {
    branch: 'main',
    mutations: syncMutations([['run.sh', '#!/bin/sh\necho hi\n']]),
    message: 'build',
    ...AUTHORIZED,
  });

  const written = repo.trees[record.resultingTreeSha]?.tree ?? [];
  const byPath = new Map(written.map((e) => [e.path, e]));
  assert.equal(byPath.get('README.md')?.sha, 'sha-readme', 'untouched file kept its blob');
  assert.equal(byPath.get('index.html')?.sha, 'sha-index');
  assert.equal(byPath.get('run.sh')?.mode, '100755', 'the executable bit survived the update');
});

// --- criterion 6: more than 35 files is still a single commit ----------------------

test('a build larger than 35 files still creates one tree, one commit and one ref update', async () => {
  // The old path batched at 35, producing N commits with all deletions deferred to the
  // last batch — so a mid-way failure left new files, no removals, and no single commit
  // that represented the build.
  const repo = repoWithFiles();
  const api = makeFake(repo);
  const large = Array.from({ length: 120 }, (_, i): [string, string] => [
    `src/generated/file-${i}.ts`,
    `export const n = ${i};`,
  ]);

  const record = await writeAtomically(api, { owner: 'acme', repo: 'site' }, {
    branch: 'main',
    mutations: syncMutations(large, ['README.md']),
    message: 'big build',
    ...AUTHORIZED,
  });

  assert.equal(api.blobCount, 120);
  assert.equal(api.treeCount, 1, 'one tree at any file count');
  assert.equal(api.commitCount, 1, 'one commit at any file count');
  assert.equal(api.refUpdateCount, 1, 'one reference update at any file count');
  assert.equal(record.manifest.length, 121, 'the deletion is in the same commit, not deferred');
  assertNoContentsApiSurface(api);
});

// --- criterion 5: failure injection, one stage at a time ---------------------------

const PRE_REF_STAGES: AtomicWriteStage[] = [
  'tree_snapshot',
  'blob_creation',
  'tree_creation',
  'commit_creation',
];

for (const failAt of PRE_REF_STAGES) {
  test(`a ${failAt.replace(/_/g, ' ')} failure leaves the branch exactly where it was`, async () => {
    const repo = repoWithFiles();
    const api = makeFake(repo, { failAt });

    await assert.rejects(
      writeAtomically(api, { owner: 'acme', repo: 'site' }, {
        branch: 'main',
        mutations: syncMutations([['index.html', 'v2'], ['about.html', 'new']]),
        message: 'build',
        ...AUTHORIZED,
      }),
      (error: unknown) => {
        assert.ok(error instanceof AtomicWriteError);
        assert.equal(error.stage, failAt);
        assert.equal(error.branchUnchanged, true);
        return true;
      },
    );

    assert.equal(repo.branches.main, 'commit-base', 'the branch never moved');
    assert.equal(api.refUpdateCount, 0, 'the reference was never touched');
    assertNoContentsApiSurface(api);
  });
}

test('a branch-creation failure refuses instead of writing somewhere else', async () => {
  const repo = repoWithFiles();
  const api = makeFake(repo, { failAt: 'branch_resolution' });

  await assert.rejects(
    writeAtomically(api, { owner: 'acme', repo: 'site' }, {
      branch: 'xroga/run-7',
      createBranchFromSha: 'commit-base',
      mutations: syncMutations([['index.html', 'v2']]),
      message: 'build',
      defaultBranch: 'main',
    }),
    (error: unknown) => {
      assert.ok(error instanceof AtomicWriteError);
      assert.equal(error.stage, 'branch_resolution');
      assert.equal(error.branchUnchanged, true);
      return true;
    },
  );

  assert.equal(repo.branches.main, 'commit-base', 'main is untouched by a failed run branch');
  assert.equal(repo.branches['xroga/run-7'], undefined);
  assert.equal(api.refUpdateCount, 0);
});

test('a failed reference update exposes no partial mutation', async () => {
  const repo = repoWithFiles();
  const api = makeFake(repo, { failAt: 'ref_update' });

  await assert.rejects(
    writeAtomically(api, { owner: 'acme', repo: 'site' }, {
      branch: 'main',
      mutations: syncMutations([['index.html', 'v2'], ['about.html', 'new']], ['README.md']),
      message: 'build',
      ...AUTHORIZED,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AtomicWriteError);
      assert.equal(error.stage, 'ref_update');
      assert.equal(error.reason, 'stage_failed');
      assert.equal(error.branchUnchanged, true);
      assert.match(error.message, /Nothing was written/i);
      return true;
    },
  );

  // The blobs, tree and commit were all created — and none of them is reachable, which is
  // exactly why a failure here is indistinguishable from never having started.
  assert.ok(api.blobCount > 0 && api.treeCount === 1 && api.commitCount === 1);
  assert.equal(repo.branches.main, 'commit-base');
  const stillThere = new Map((repo.trees['tree-base']?.tree ?? []).map((e) => [e.path, e.sha]));
  assert.equal(stillThere.get('README.md'), 'sha-readme', 'the deletion never became visible');
  assert.equal(stillThere.get('index.html'), 'sha-index', 'the update never became visible');
  assert.equal(stillThere.has('about.html'), false, 'the new file never became visible');
  assertNoContentsApiSurface(api);
});

test('a post-write verification failure is the one failure that cannot claim the branch is unchanged', async () => {
  const repo = repoWithFiles();
  // The ref update reports success but the branch reads back as something else.
  const api = makeFake(repo, { verificationSha: 'commit-somebody-else' });

  await assert.rejects(
    writeAtomically(api, { owner: 'acme', repo: 'site' }, {
      branch: 'main',
      mutations: syncMutations([['index.html', 'v2']]),
      message: 'build',
      ...AUTHORIZED,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AtomicWriteError);
      assert.equal(error.stage, 'verification');
      assert.equal(error.reason, 'verification_mismatch');
      assert.equal(error.branchUnchanged, false, 'ambiguity is reported, not papered over');
      assert.match(error.message, /Check the branch before retrying/i);
      return true;
    },
  );
});

test('a pull-request failure is a warning on a landed commit, never a failed write', async () => {
  const repo = repoWithFiles([['README.md', 'sha-readme']], 'main');
  repo.branches['xroga/run-7'] = 'commit-base';
  const api = makeFake(repo, { failAt: 'pull_request' });

  const record = await writeAtomically(api, { owner: 'acme', repo: 'site' }, {
    branch: 'xroga/run-7',
    mutations: syncMutations([['index.html', 'v1']]),
    message: 'build',
    defaultBranch: 'main',
    pullRequest: { base: 'main', title: 'Build', body: 'body' },
  });

  assert.equal(record.verified, true);
  assert.equal(repo.branches['xroga/run-7'], record.resultingCommitSha, 'the commit landed');
  assert.equal(record.pullRequest, undefined);
  assert.match(record.pullRequestWarning ?? '', /committed to "xroga\/run-7"/);
  assert.match(record.pullRequestWarning ?? '', /pull request could not be/i);
});

// --- criterion 6: concurrency ------------------------------------------------------

test('concurrent head movement produces a typed conflict and overwrites nothing', async () => {
  const repo = repoWithFiles();
  const api = makeFake(repo, { concurrentHeadSha: 'commit-from-someone-else' });

  await assert.rejects(
    writeAtomically(api, { owner: 'acme', repo: 'site' }, {
      branch: 'main',
      mutations: syncMutations([['index.html', 'v2']], ['README.md']),
      message: 'build',
      ...AUTHORIZED,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AtomicWriteError);
      assert.equal(error.stage, 'ref_update');
      assert.equal(error.reason, 'concurrent_head_movement');
      assert.equal(error.branchUnchanged, true);
      assert.match(error.message, /Nothing was overwritten/i);
      return true;
    },
  );

  assert.equal(
    repo.branches.main,
    'commit-from-someone-else',
    "the other commit is still the branch head — this build did not clobber it",
  );
  assertNoContentsApiSurface(api);
});

test('the refused plan survives the conflict, so the build can be replanned', async () => {
  const repo = repoWithFiles();
  const api = makeFake(repo, { concurrentHeadSha: 'commit-from-someone-else' });

  const error = await writeAtomically(api, { owner: 'acme', repo: 'site' }, {
    branch: 'main',
    mutations: syncMutations([['index.html', 'v2'], ['about.html', 'new']], ['README.md']),
    message: 'build',
    ...AUTHORIZED,
  }).then(
    () => null,
    (e: unknown) => e as AtomicWriteError,
  );

  const proposal = error?.proposal;
  assert.ok(proposal, 'a conflict carries a proposal');
  assert.equal(proposal.branch, 'main');
  assert.equal(proposal.plannedFromSha, 'commit-base', 'the commit the refused plan was built on');
  assert.equal(proposal.observedHeadSha, 'commit-from-someone-else', 'where the branch is now');
  assert.deepEqual(
    proposal.manifest.map((m) => [m.kind, m.path]),
    [['update', 'index.html'], ['create', 'about.html'], ['delete', 'README.md']],
  );
  assert.deepEqual(proposal.preservedPaths, ['run.sh']);
});

test('a non-conflict reference failure also carries the plan, without claiming a conflict', async () => {
  const repo = repoWithFiles();
  const api = makeFake(repo, { failAt: 'ref_update', refConflict: false });

  const error = await writeAtomically(api, { owner: 'acme', repo: 'site' }, {
    branch: 'main',
    mutations: syncMutations([['index.html', 'v2']]),
    message: 'build',
    ...AUTHORIZED,
  }).then(
    () => null,
    (e: unknown) => e as AtomicWriteError,
  );

  assert.equal(error?.reason, 'stage_failed');
  assert.ok(error?.proposal, 'the plan is still available');
  assert.equal(error?.proposal?.observedHeadSha, null, 'no head was observed, so none is claimed');
});

// --- criterion 8: authorization happens before anything is created -----------------

test('an unauthorized default-branch write creates no git objects at all', async () => {
  const repo = repoWithFiles();
  const api = makeFake(repo);

  await assert.rejects(
    writeAtomically(api, { owner: 'acme', repo: 'site' }, {
      branch: 'main',
      mutations: syncMutations([['index.html', 'v2']]),
      message: 'build',
      defaultBranch: 'main',
    }),
    (error: unknown) => {
      assert.ok(error instanceof AtomicWriteError);
      assert.equal(error.stage, 'branch_resolution');
      assert.equal(error.reason, 'protected_branch_unauthorized');
      assert.equal(error.branchUnchanged, true);
      return true;
    },
  );

  assert.equal(api.blobCount, 0);
  assert.equal(api.treeCount, 0);
  assert.equal(api.commitCount, 0);
  assert.equal(api.refUpdateCount, 0);
  assert.equal(repo.branches.main, 'commit-base');
});

test('an unauthorized protected-branch write is refused the same way', async () => {
  const repo = repoWithFiles([['README.md', 'sha-readme']], 'release/v2');
  repo.protectedBranches = ['release/v2'];
  const api = makeFake(repo);

  await assert.rejects(
    writeAtomically(api, { owner: 'acme', repo: 'site' }, {
      branch: 'release/v2',
      mutations: syncMutations([['index.html', 'v1']]),
      message: 'build',
      defaultBranch: 'main',
    }),
    (error: unknown) => {
      assert.ok(error instanceof AtomicWriteError);
      assert.equal(error.reason, 'protected_branch_unauthorized');
      return true;
    },
  );
  assert.equal(api.blobCount, 0);
});

test('a run branch writes without authorization, which is the whole point of using one', async () => {
  const repo = repoWithFiles([['README.md', 'sha-readme']], 'main');
  const api = makeFake(repo);

  const record = await writeAtomically(api, { owner: 'acme', repo: 'site' }, {
    branch: 'xroga/run-7',
    createBranchFromSha: 'commit-base',
    mutations: syncMutations([['index.html', 'v1']]),
    message: 'build',
    defaultBranch: 'main',
    pullRequest: { base: 'main', title: 'Build', body: 'body' },
  });

  assert.equal(record.branch, 'xroga/run-7');
  assert.equal(record.branchCreated, true);
  assert.equal(record.startingHeadSha, 'commit-base', 'cut from the exact recorded commit');
  assert.equal(record.directWriteAuthorized, false);
  assert.equal(record.pullRequest?.htmlUrl, 'https://github.com/acme/site/pull/7');
  assert.deepEqual(api.pullRequests, [{ head: 'xroga/run-7', base: 'main' }]);
  assert.equal(repo.branches.main, 'commit-base', 'main was not touched');
});

// --- the empty-repository policy ---------------------------------------------------

test('an explicitly authorized empty repository is bootstrapped with one parentless commit and one ref', async () => {
  const repo: FakeRepo = { branches: {}, commits: {}, trees: {}, empty: true };
  const api = makeFake(repo);

  const record = await writeAtomically(api, { owner: 'acme', repo: 'blank' }, {
    branch: 'main',
    mutations: syncMutations([['index.html', 'v1'], ['README.md', '# Blank']]),
    message: 'initial build',
    ...AUTHORIZED,
    allowEmptyBootstrap: true,
  });

  assert.equal(record.startingHeadSha, null);
  assert.equal(record.startingTreeSha, '');
  assert.equal(record.branchCreated, true);
  assert.equal(record.verified, true);
  assert.equal(api.commitCount, 1);
  assert.equal(api.refUpdateCount, 0, 'bootstrap creates a ref instead of patching one');
  assert.equal(repo.commits[record.resultingCommitSha]?.parent, null);
  assert.equal(repo.branches.main, record.resultingCommitSha);
  assert.equal(api.calls.filter((call) => call === 'createRef:main').length, 1);
  assertNoContentsApiSurface(api);
});

test('an empty repository without explicit authorization still creates no git objects', async () => {
  const repo: FakeRepo = { branches: {}, commits: {}, trees: {}, empty: true };
  const api = makeFake(repo);

  await assert.rejects(
    writeAtomically(api, { owner: 'acme', repo: 'blank' }, {
      branch: 'main',
      mutations: syncMutations([['index.html', 'v1']]),
      message: 'build',
      defaultBranch: 'main',
    }),
    (error: unknown) => {
      assert.ok(error instanceof AtomicWriteError);
      assert.equal(error.reason, 'atomic_bootstrap_required');
      return true;
    },
  );

  assert.equal(api.blobCount, 0);
  assert.deepEqual(api.calls, ['isRepositoryEmpty']);
});

test('generic direct-write approval cannot bootstrap an empty repository without the narrow bootstrap grant', async () => {
  const repo: FakeRepo = { branches: {}, commits: {}, trees: {}, empty: true };
  const api = makeFake(repo);

  await assert.rejects(
    writeAtomically(api, { owner: 'acme', repo: 'blank' }, {
      branch: 'main',
      mutations: syncMutations([['index.html', 'v1']]),
      message: 'build',
      ...AUTHORIZED,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AtomicWriteError);
      assert.equal(error.reason, 'atomic_bootstrap_required');
      return true;
    },
  );

  assert.equal(api.blobCount, 0);
  assert.deepEqual(api.calls, ['isRepositoryEmpty']);
});

// --- planning refusals abort before any upload -------------------------------------

test('a rejected plan is refused before a single blob is uploaded', async () => {
  const repo = repoWithFiles();
  const api = makeFake(repo);

  await assert.rejects(
    writeAtomically(api, { owner: 'acme', repo: 'site' }, {
      branch: 'main',
      mutations: [{ kind: 'create', path: '../escape.ts', content: 'x' }],
      message: 'build',
      ...AUTHORIZED,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AtomicWriteError);
      assert.equal(error.stage, 'planning');
      assert.equal(error.branchUnchanged, true);
      return true;
    },
  );
  assert.equal(api.blobCount, 0);
  assert.equal(repo.branches.main, 'commit-base');
});

test('the plan is resolved against the repository’s tree, not against the caller’s memory', async () => {
  // `index.html` exists, so the pipeline handing over "here are the files" must produce
  // an update; `about.html` does not, so it must produce a create. Nothing in the caller
  // told the write which was which.
  const repo = repoWithFiles();
  const api = makeFake(repo);

  const record = await writeAtomically(api, { owner: 'acme', repo: 'site' }, {
    branch: 'main',
    mutations: syncMutations([['index.html', 'v2'], ['about.html', 'new']]),
    message: 'build',
    ...AUTHORIZED,
  });

  assert.deepEqual(
    record.manifest.map((m) => [m.kind, m.path]),
    [['update', 'index.html'], ['create', 'about.html']],
  );
});

test('a repository with no pull-request support still writes, it just opens no PR', async () => {
  const repo = repoWithFiles([['README.md', 'sha-readme']], 'main');
  repo.branches['xroga/run-7'] = 'commit-base';
  const api = makeFake(repo, { omitPullRequestSupport: true });

  const record = await writeAtomically(api, { owner: 'acme', repo: 'site' }, {
    branch: 'xroga/run-7',
    mutations: syncMutations([['index.html', 'v1']]),
    message: 'build',
    defaultBranch: 'main',
    pullRequest: { base: 'main', title: 'Build', body: 'body' },
  });

  assert.equal(record.verified, true);
  assert.equal(record.pullRequest, undefined);
});

test('every failure reason has a sanitised description that says nothing was written', () => {
  const cases: Array<[AtomicWriteStage, Parameters<typeof describeAtomicWriteFailure>[0]['reason']]> = [
    ['ref_update', 'concurrent_head_movement'],
    ['branch_resolution', 'atomic_bootstrap_required'],
    ['branch_resolution', 'protected_branch_unauthorized'],
    ['verification', 'verification_mismatch'],
    ['blob_creation', 'stage_failed'],
  ];
  for (const [stage, reason] of cases) {
    const message = describeAtomicWriteFailure(new AtomicWriteError(stage, reason, 'detail'));
    assert.ok(message.length > 10, `${stage}/${reason}`);
    assert.doesNotMatch(message, /Bearer |gho_|ghp_|injected/, `${stage}/${reason}`);
  }
});
