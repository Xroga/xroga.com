import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  TreeSnapshotError,
  describeTreeSnapshotFailure,
  emptyStartingTree,
  readStartingTree,
  type RawTreeResponse,
  type TreeApi,
} from './githubTreeSnapshot.js';

/**
 * Cover for planning against a partial view of the repository.
 *
 * A truncated tree looks exactly like a smaller repository. Planning against one would
 * classify existing files as new (so a create collides at commit time, or worse, does
 * not) and report untouched files as absent. There is no safe way to guess the rest, so
 * the snapshot refuses instead.
 */

function fakeTreeApi(
  trees: Record<string, RawTreeResponse>,
  commits: Record<string, string> = {},
): TreeApi {
  return {
    async getCommitTreeSha(commitSha) {
      return commits[commitSha] ?? null;
    },
    async getTree(treeSha) {
      return trees[treeSha] ?? null;
    },
  };
}

test('the tree is read from the exact commit the write will build on', async () => {
  const api = fakeTreeApi(
    {
      'tree-1': {
        sha: 'tree-1',
        tree: [
          { path: 'README.md', sha: 'sha-readme', mode: '100644', type: 'blob' },
          { path: 'run.sh', sha: 'sha-run', mode: '100755', type: 'blob' },
        ],
      },
    },
    { 'commit-1': 'tree-1' },
  );

  const snapshot = await readStartingTree(api, 'commit-1');
  assert.equal(snapshot.treeSha, 'tree-1');
  assert.deepEqual(snapshot.entries, [
    { path: 'README.md', sha: 'sha-readme', mode: '100644', type: 'blob' },
    { path: 'run.sh', sha: 'sha-run', mode: '100755', type: 'blob' },
  ]);
});

test('reproduces the defect: a truncated listing refuses the write', async () => {
  const api = fakeTreeApi(
    { 'tree-big': { sha: 'tree-big', tree: [{ path: 'a.ts', sha: 'sha-a' }], truncated: true } },
    { 'commit-big': 'tree-big' },
  );

  await assert.rejects(readStartingTree(api, 'commit-big'), (error: unknown) => {
    assert.ok(error instanceof TreeSnapshotError);
    assert.equal(error.reason, 'tree_truncated');
    assert.match(error.message, /partially known/i);
    return true;
  });
});

test('an unreadable commit is a named refusal, never an empty tree', async () => {
  const api = fakeTreeApi({}, {});
  await assert.rejects(readStartingTree(api, 'commit-missing'), (error: unknown) => {
    assert.ok(error instanceof TreeSnapshotError);
    assert.equal(error.reason, 'commit_unreadable');
    return true;
  });
});

test('an unreadable tree is a named refusal, never an empty tree', async () => {
  const api = fakeTreeApi({}, { 'commit-1': 'tree-gone' });
  await assert.rejects(readStartingTree(api, 'commit-1'), (error: unknown) => {
    assert.ok(error instanceof TreeSnapshotError);
    assert.equal(error.reason, 'tree_unreadable');
    return true;
  });
});

test('a missing commit sha is refused before any request is made', async () => {
  let called = false;
  const api: TreeApi = {
    async getCommitTreeSha() {
      called = true;
      return 'tree-1';
    },
    async getTree() {
      return null;
    },
  };
  await assert.rejects(readStartingTree(api, ''), TreeSnapshotError);
  assert.equal(called, false);
});

test('malformed entries are dropped rather than becoming entries with no identity', async () => {
  const api = fakeTreeApi(
    {
      'tree-1': {
        sha: 'tree-1',
        tree: [
          { path: 'ok.ts', sha: 'sha-ok' },
          { path: '', sha: 'sha-x' },
          { sha: 'sha-y' },
          { path: 'no-sha.ts' },
        ],
      },
    },
    { 'commit-1': 'tree-1' },
  );
  const snapshot = await readStartingTree(api, 'commit-1');
  assert.deepEqual(snapshot.entries.map((e) => e.path), ['ok.ts']);
});

test('directories and submodules keep their type so a plan can exclude them', async () => {
  const api = fakeTreeApi(
    {
      'tree-1': {
        sha: 'tree-1',
        tree: [
          { path: 'src', sha: 'sha-dir', mode: '040000', type: 'tree' },
          { path: 'vendor', sha: 'sha-sub', mode: '160000', type: 'commit' },
          { path: 'a.ts', sha: 'sha-a', mode: '100644', type: 'blob' },
        ],
      },
    },
    { 'commit-1': 'tree-1' },
  );
  const snapshot = await readStartingTree(api, 'commit-1');
  assert.deepEqual(snapshot.entries.map((e) => e.type), ['tree', 'commit', 'blob']);
});

test('an entry with an unrecognised type is read as a blob, never invented', async () => {
  const api = fakeTreeApi(
    { 'tree-1': { sha: 'tree-1', tree: [{ path: 'a.ts', sha: 'sha-a', type: 'wat' }] } },
    { 'commit-1': 'tree-1' },
  );
  const snapshot = await readStartingTree(api, 'commit-1');
  assert.equal(snapshot.entries[0]?.type, 'blob');
});

test('the empty starting tree is explicitly flagged, so it cannot pass as a real one', () => {
  const empty = emptyStartingTree();
  assert.equal(empty.empty, true);
  assert.deepEqual(empty.entries, []);
});

test('every snapshot failure has a sanitised description', () => {
  for (const reason of [
    'commit_unreadable',
    'tree_unreadable',
    'tree_truncated',
    'repository_empty',
  ] as const) {
    const message = describeTreeSnapshotFailure(reason);
    assert.ok(message.length > 10, reason);
    assert.doesNotMatch(message, /Bearer |gho_|ghp_/, reason);
  }
});
