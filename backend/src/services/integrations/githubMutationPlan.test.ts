import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_FILE_MODE,
  MutationPlanError,
  deriveFileSyncMutations,
  describeMutationRejection,
  finalizeTreeEntries,
  planMutation,
  validateRepositoryPath,
  type MutationRequest,
  type StartingTree,
} from './githubMutationPlan.js';

/**
 * Cover for what a repository mutation is allowed to be.
 *
 * The old push path built its tree from the file list the build happened to be holding
 * and let GitHub's `base_tree` merge sort out the rest. That made three things
 * unobservable: whether a file already existed, what mode it had, and whether the set of
 * operations was even self-consistent. Every test below asserts one of those is now
 * decided here, against the repository's real starting tree, before anything is uploaded.
 */

function tree(
  entries: Array<[path: string, sha: string, mode?: string, type?: 'blob' | 'tree' | 'commit']>,
): StartingTree {
  return {
    treeSha: 'tree-base',
    entries: entries.map(([path, sha, mode, type]) => ({
      path,
      sha,
      mode: mode ?? '100644',
      type: type ?? 'blob',
    })),
  };
}

// --- criterion 3: path validation and traversal ------------------------------------

test('a plain repository-relative path is accepted unchanged', () => {
  assert.equal(validateRepositoryPath('src/app/page.tsx'), 'src/app/page.tsx');
  assert.equal(validateRepositoryPath('  README.md  '), 'README.md');
});

test('path traversal is refused rather than normalised', () => {
  // Normalising would still write a file, just a different one, and hide the fact that
  // something upstream produced a path it had no business producing.
  for (const path of ['../secrets.env', 'src/../../etc/passwd', 'a/./b.ts', 'a//b.ts']) {
    assert.throws(
      () => validateRepositoryPath(path),
      (error: unknown) => {
        assert.ok(error instanceof MutationPlanError);
        assert.equal(error.rejection, 'invalid_path');
        return true;
      },
      path,
    );
  }
});

test('absolute, Windows and backslash paths are refused', () => {
  for (const path of ['/etc/hosts', 'C:\\Users\\x\\a.ts', 'src\\app\\page.tsx']) {
    assert.throws(() => validateRepositoryPath(path), MutationPlanError, path);
  }
});

test('a write inside .git is refused at any depth or case', () => {
  for (const path of ['.git/config', 'src/.git/hooks/pre-commit', '.GIT/HEAD']) {
    assert.throws(() => validateRepositoryPath(path), MutationPlanError, path);
  }
});

test('empty, directory-shaped and control-character paths are refused', () => {
  assert.throws(() => validateRepositoryPath(''), MutationPlanError);
  assert.throws(() => validateRepositoryPath('   '), MutationPlanError);
  assert.throws(() => validateRepositoryPath('src/'), MutationPlanError);
  assert.throws(() => validateRepositoryPath('src/a\u0000b.ts'), MutationPlanError);
  assert.throws(() => validateRepositoryPath('src/a\u0007b.ts'), MutationPlanError);
  assert.throws(() => validateRepositoryPath('src/a\u007fb.ts'), MutationPlanError);
  assert.throws(() => validateRepositoryPath(`${'a'.repeat(401)}.ts`), MutationPlanError);
});

// --- criterion 3: the five operations ----------------------------------------------

test('create adds a file that is not already there', () => {
  const plan = planMutation(tree([['README.md', 'sha-readme']]), [
    { kind: 'create', path: 'src/index.ts', content: 'export {};' },
  ]);
  assert.deepEqual(plan.pendingBlobs.map((b) => b.path), ['src/index.ts']);
  assert.deepEqual(plan.manifest, [
    { kind: 'create', path: 'src/index.ts', mode: DEFAULT_FILE_MODE, bytes: 10 },
  ]);
});

test('create over an existing path is refused, not silently turned into an overwrite', () => {
  assert.throws(
    () => planMutation(tree([['a.ts', 'sha-a']]), [{ kind: 'create', path: 'a.ts', content: 'x' }]),
    (error: unknown) => {
      assert.ok(error instanceof MutationPlanError);
      assert.equal(error.rejection, 'already_exists');
      return true;
    },
  );
});

test('update requires the file to exist', () => {
  assert.throws(
    () => planMutation(tree([]), [{ kind: 'update', path: 'a.ts', content: 'x' }]),
    (error: unknown) => {
      assert.ok(error instanceof MutationPlanError);
      assert.equal(error.rejection, 'missing_source');
      return true;
    },
  );
});

test('update preserves the executable bit that the old path silently stripped', () => {
  const plan = planMutation(tree([['scripts/deploy.sh', 'sha-sh', '100755']]), [
    { kind: 'update', path: 'scripts/deploy.sh', content: '#!/bin/sh\n' },
  ]);
  assert.equal(plan.pendingBlobs[0]?.mode, '100755');
  assert.equal(plan.manifest[0]?.mode, '100755');
});

test('a symlink keeps its 120000 mode across an update', () => {
  const plan = planMutation(tree([['link', 'sha-link', '120000']]), [
    { kind: 'update', path: 'link', content: 'target' },
  ]);
  assert.equal(plan.pendingBlobs[0]?.mode, '120000');
});

test('a caller may change a mode deliberately, and it is recorded', () => {
  const plan = planMutation(tree([['run.sh', 'sha-run', '100644']]), [
    { kind: 'update', path: 'run.sh', content: '#!/bin/sh\n', mode: '100755' },
  ]);
  assert.equal(plan.manifest[0]?.mode, '100755');
});

test('delete removes the path with sha:null and requires it to exist', () => {
  const plan = planMutation(tree([['old.ts', 'sha-old']]), [{ kind: 'delete', path: 'old.ts' }]);
  assert.deepEqual(plan.resolvedEntries, [
    { path: 'old.ts', mode: '100644', type: 'blob', sha: null },
  ]);
  assert.throws(
    () => planMutation(tree([]), [{ kind: 'delete', path: 'ghost.ts' }]),
    MutationPlanError,
  );
});

test('rename reuses the existing blob rather than re-serialising content from memory', () => {
  const plan = planMutation(tree([['a.ts', 'sha-a', '100755']]), [
    { kind: 'rename', from: 'a.ts', to: 'b.ts' },
  ]);
  assert.equal(plan.pendingBlobs.length, 0, 'a pure rename uploads nothing');
  const write = plan.resolvedEntries.find((e) => e.path === 'b.ts');
  const removal = plan.resolvedEntries.find((e) => e.path === 'a.ts');
  assert.equal(write?.sha, 'sha-a');
  assert.equal(write?.mode, '100755', 'the mode moves with the file');
  assert.equal(removal?.sha, null);
});

test('rename onto an existing path is refused rather than destroying it', () => {
  assert.throws(
    () =>
      planMutation(tree([['a.ts', 'sha-a'], ['b.ts', 'sha-b']]), [
        { kind: 'rename', from: 'a.ts', to: 'b.ts' },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof MutationPlanError);
      assert.equal(error.rejection, 'already_exists');
      return true;
    },
  );
});

test('rename with content uploads the new content and still removes the source', () => {
  const plan = planMutation(tree([['a.ts', 'sha-a']]), [
    { kind: 'rename', from: 'a.ts', to: 'b.ts', content: 'moved' },
  ]);
  assert.deepEqual(plan.pendingBlobs.map((b) => b.path), ['b.ts']);
  assert.equal(plan.resolvedEntries.find((e) => e.path === 'a.ts')?.sha, null);
});

test('restore re-points a path at a blob that already exists in git', () => {
  const fromTree = planMutation(tree([['a.ts', 'sha-current']]), [{ kind: 'restore', path: 'a.ts' }]);
  assert.equal(fromTree.resolvedEntries[0]?.sha, 'sha-current');

  const fromHistory = planMutation(tree([['a.ts', 'sha-current']]), [
    { kind: 'restore', path: 'a.ts', fromBlobSha: 'sha-older' },
  ]);
  assert.equal(fromHistory.resolvedEntries[0]?.sha, 'sha-older');
  assert.equal(fromHistory.manifest[0]?.reusedBlobSha, 'sha-older');
});

test('restore with no source anywhere is refused rather than inventing content', () => {
  assert.throws(
    () => planMutation(tree([]), [{ kind: 'restore', path: 'gone.ts' }]),
    (error: unknown) => {
      assert.ok(error instanceof MutationPlanError);
      assert.equal(error.rejection, 'restore_source_missing');
      return true;
    },
  );
});

// --- criterion 3: duplicate and conflicting operations ------------------------------

test('two operations writing the same path are refused', () => {
  assert.throws(
    () =>
      planMutation(tree([]), [
        { kind: 'create', path: 'a.ts', content: '1' },
        { kind: 'create', path: 'a.ts', content: '2' },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof MutationPlanError);
      assert.equal(error.rejection, 'duplicate_output_path');
      return true;
    },
  );
});

test('writing and removing the same path in one commit is refused, in either order', () => {
  const both: Array<MutationRequest[]> = [
    [
      { kind: 'delete', path: 'a.ts' },
      { kind: 'update', path: 'a.ts', content: 'x' },
    ],
    [
      { kind: 'update', path: 'a.ts', content: 'x' },
      { kind: 'delete', path: 'a.ts' },
    ],
  ];
  for (const requests of both) {
    assert.throws(
      () => planMutation(tree([['a.ts', 'sha-a']]), requests),
      (error: unknown) => {
        assert.ok(error instanceof MutationPlanError);
        assert.equal(error.rejection, 'conflicting_operations');
        return true;
      },
    );
  }
});

test('a rename to the same path is refused', () => {
  assert.throws(
    () => planMutation(tree([['a.ts', 'sha-a']]), [{ kind: 'rename', from: 'a.ts', to: 'a.ts' }]),
    MutationPlanError,
  );
});

test('an empty operation list is refused rather than producing an empty commit', () => {
  assert.throws(
    () => planMutation(tree([['a.ts', 'sha-a']]), []),
    (error: unknown) => {
      assert.ok(error instanceof MutationPlanError);
      assert.equal(error.rejection, 'empty_plan');
      return true;
    },
  );
});

test('an unknown operation kind is refused, not ignored', () => {
  assert.throws(
    () => planMutation(tree([]), [{ kind: 'chmod', path: 'a.ts' } as unknown as MutationRequest]),
    (error: unknown) => {
      assert.ok(error instanceof MutationPlanError);
      assert.equal(error.rejection, 'unsupported_entry_type');
      return true;
    },
  );
});

// --- criterion 3 + 4: preservation, and planning from the real tree -----------------

test('every untouched path in the starting tree is recorded as preserved', () => {
  const plan = planMutation(
    tree([
      ['README.md', 'sha-readme'],
      ['src/a.ts', 'sha-a'],
      ['src/b.ts', 'sha-b'],
      ['docs/c.md', 'sha-c'],
    ]),
    [{ kind: 'update', path: 'src/a.ts', content: 'x' }, { kind: 'delete', path: 'docs/c.md' }],
  );
  assert.deepEqual(plan.preservedPaths, ['README.md', 'src/b.ts']);
});

test('the plan carries the tree it was built against, so the writer cannot substitute one', () => {
  const plan = planMutation(tree([['a.ts', 'sha-a']]), [
    { kind: 'update', path: 'a.ts', content: 'x' },
  ]);
  assert.equal(plan.baseTreeSha, 'tree-base');
});

test('directory and submodule entries are never treated as writable files', () => {
  const starting = tree([
    ['vendor', 'sha-sub', '160000', 'commit'],
    ['src', 'sha-dir', '040000', 'tree'],
  ]);
  // Neither is in the index, so both a create and an update behave as if absent:
  // the create succeeds (nothing to collide with) and the update is refused.
  assert.doesNotThrow(() =>
    planMutation(starting, [{ kind: 'create', path: 'vendor', content: 'x' }]),
  );
  assert.throws(
    () => planMutation(starting, [{ kind: 'update', path: 'src', content: 'x' }]),
    MutationPlanError,
  );
});

// --- finalizeTreeEntries -----------------------------------------------------------

test('a tree cannot be finalised while a blob upload is unaccounted for', () => {
  // The failure this prevents: a commit that succeeds while silently omitting a file.
  const plan = planMutation(tree([]), [
    { kind: 'create', path: 'a.ts', content: '1' },
    { kind: 'create', path: 'b.ts', content: '2' },
  ]);
  assert.throws(
    () => finalizeTreeEntries(plan, new Map([['a.ts', 'blob-a']])),
    MutationPlanError,
  );
  const entries = finalizeTreeEntries(
    plan,
    new Map([
      ['a.ts', 'blob-a'],
      ['b.ts', 'blob-b'],
    ]),
  );
  assert.deepEqual(entries.map((e) => [e.path, e.sha]), [
    ['a.ts', 'blob-a'],
    ['b.ts', 'blob-b'],
  ]);
});

// --- deriveFileSyncMutations: the pipeline's convention -----------------------------

test('a build\u2019s files are classified against the real tree, not against its own memory', () => {
  const mutations = deriveFileSyncMutations(
    tree([['index.html', 'sha-idx'], ['styles.css', 'sha-css']]),
    [
      { path: 'index.html', content: '<html>' },
      { path: 'script.js', content: 'x' },
    ],
  );
  assert.deepEqual(mutations, [
    { kind: 'update', path: 'index.html', content: '<html>' },
    { kind: 'create', path: 'script.js', content: 'x' },
  ]);
});

test('a removal of a path that was never committed is dropped, not refused', () => {
  // The pipeline computes deletions by diffing its own view of a previous build, so a
  // path it lists may simply never have been committed. Refusing the whole write over
  // that would fail builds for a bookkeeping artefact.
  const mutations = deriveFileSyncMutations(tree([['a.ts', 'sha-a']]), [], ['a.ts', 'never-there.ts']);
  assert.deepEqual(mutations, [{ kind: 'delete', path: 'a.ts' }]);
});

test('a path both written and deleted resolves to the write, with no conflicting pair emitted', () => {
  const mutations = deriveFileSyncMutations(
    tree([['a.ts', 'sha-a']]),
    [{ path: 'a.ts', content: 'new' }],
    ['a.ts'],
  );
  assert.deepEqual(mutations, [{ kind: 'update', path: 'a.ts', content: 'new' }]);
});

test('the same output path twice in one build is refused', () => {
  assert.throws(
    () =>
      deriveFileSyncMutations(tree([]), [
        { path: 'a.ts', content: '1' },
        { path: 'a.ts', content: '2' },
      ]),
    (error: unknown) => {
      assert.ok(error instanceof MutationPlanError);
      assert.equal(error.rejection, 'duplicate_output_path');
      return true;
    },
  );
});

test('an invalid output path fails the build instead of reaching GitHub', () => {
  assert.throws(
    () => deriveFileSyncMutations(tree([]), [{ path: '../escape.ts', content: 'x' }]),
    MutationPlanError,
  );
});

test('every rejection has a sanitised, human-readable description', () => {
  for (const rejection of [
    'invalid_path',
    'duplicate_output_path',
    'conflicting_operations',
    'missing_source',
    'already_exists',
    'restore_source_missing',
    'unsupported_entry_type',
    'empty_plan',
  ] as const) {
    const message = describeMutationRejection(rejection);
    assert.ok(message.length > 10, rejection);
    assert.doesNotMatch(message, /Bearer |gho_|ghp_/, rejection);
  }
});
