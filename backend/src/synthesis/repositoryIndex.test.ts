/**
 * Tests for the repository index.
 *
 * Most of these are about the index refusing to answer. A cache over source control has
 * one catastrophic failure mode — describing a commit that is no longer HEAD — and the
 * answer it produces looks authoritative, cites real paths, and describes deleted code.
 * So the staleness tests matter more than the indexing ones.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import type { ProjectFile } from '../ai/patches.js';
import {
  InMemoryRepositoryIndexStore,
  applyUpdate,
  buildIndex,
  extractExports,
  extractImports,
  extractSymbols,
  gitBlobSha,
  isBinary,
  planUpdate,
  queryIndex,
  readIndex,
  refreshIndex,
  type RepositoryIdentity,
} from './repositoryIndex.js';

const f = (path: string, content = ''): ProjectFile => ({ path, content });

const identity: RepositoryIdentity = {
  repositoryId: 'r1', repositoryOwner: 'Xroga', repositoryName: 'demo',
  projectId: 'p1', branch: 'main',
};

const tree: ProjectFile[] = [
  f('package.json', JSON.stringify({ name: 'web', workspaces: ['packages/*'] })),
  f('packages/ui/package.json', '{"name":"ui"}'),
  f('packages/ui/src/Button.tsx', 'import React from "react";\nexport function Button() { return null; }\n'),
  f('service/pyproject.toml', '[tool.poetry]\nname = "svc"\n'),
  f('service/poetry.lock', ''),
  f('service/app/main.py', 'from fastapi import FastAPI\n\nclass Handler:\n    def get(self):\n        pass\n'),
  f('worker/Cargo.toml', '[package]\nname = "worker"\n'),
  f('worker/src/main.rs', 'use std::io;\n\npub fn run() {}\n\nfn main() {}\n'),
  f('assets/logo.png', 'PNG\0\0\0binary'),
];

describe('a blob SHA is git\'s, so it can be compared against a tree listing', () => {
  it('matches git hash-object exactly', () => {
    // If this diverged, the index could not answer "has this file changed" without
    // downloading it, which is most of the point.
    const content = 'hello world\n';
    const expected = execFileSync('git', ['hash-object', '--stdin'], { input: content }).toString().trim();
    assert.equal(gitBlobSha(content), expected);
  });

  it('produces a different SHA for different content', () => {
    assert.notEqual(gitBlobSha('a'), gitBlobSha('b'));
  });
});

describe('indexing a repository', () => {
  it('records identity, commit and a row per file', () => {
    const index = buildIndex({ identity, commitSha: 'aaa111', files: tree });
    assert.equal(index.indexedCommitSha, 'aaa111');
    assert.equal(index.identity.projectId, 'p1');
    assert.equal(index.files.length, tree.length);
  });

  it('assigns component and workspace ownership from the runtime adapters', () => {
    // Ownership comes from the adapters rather than a second path-guessing implementation,
    // so both layers give the same answer. Two implementations would eventually disagree
    // invisibly.
    const index = buildIndex({ identity, commitSha: 'aaa111', files: tree });
    const byPath = Object.fromEntries(index.files.map((file) => [file.filePath, file]));

    assert.equal(byPath['worker/src/main.rs'].componentAdapterId, 'rust');
    assert.equal(byPath['service/app/main.py'].componentAdapterId, 'python');
    assert.equal(byPath['packages/ui/src/Button.tsx'].componentAdapterId, 'node');
    assert.equal(byPath['packages/ui/src/Button.tsx'].componentRoot, 'packages/ui');
  });

  it('finds a file at arbitrary depth', () => {
    const deep = [f('a/b/c/d/e/f/g/service.go', 'package main\n\nfunc Handle() {}\n')];
    const index = buildIndex({ identity, commitSha: 'x', files: deep });
    assert.equal(index.files[0].filePath, 'a/b/c/d/e/f/g/service.go');
    assert.equal(index.files[0].language, 'go');
    assert.ok(index.files[0].symbols.includes('Handle'));
  });

  it('records binary metadata without extracting any content', () => {
    // §7 requires binary metadata without injecting binaries into model context. The
    // cheapest guarantee is to extract nothing from them at all.
    const index = buildIndex({ identity, commitSha: 'x', files: tree });
    const logo = index.files.find((file) => file.filePath === 'assets/logo.png')!;
    assert.equal(logo.binary, true);
    assert.deepEqual(logo.symbols, []);
    assert.deepEqual(logo.imports, []);
    assert.match(logo.summary!, /binary file/);
  });

  it('classifies binaries by extension and by NUL byte', () => {
    assert.equal(isBinary('a.png', 'not really'), true, 'extension is decisive');
    assert.equal(isBinary('data.unknown', 'text\0with nul'), true, 'a NUL byte is decisive');
    assert.equal(isBinary('a.ts', 'export const x = 1;'), false);
  });
});

describe('symbols, imports and exports', () => {
  it('extracts across several languages', () => {
    assert.ok(extractSymbols('a.ts', 'export function alpha() {}\nclass Beta {}').includes('alpha'));
    assert.ok(extractSymbols('a.py', 'def gamma():\n    pass\nclass Delta:\n    pass').includes('Delta'));
    assert.ok(extractSymbols('a.rs', 'pub fn epsilon() {}\nstruct Zeta;').includes('epsilon'));
    assert.ok(extractSymbols('a.go', 'func Eta() {}\ntype Theta struct{}').includes('Eta'));
    assert.ok(extractSymbols('a.sol', 'contract Iota {}').includes('Iota'));
  });

  it('extracts imports across syntaxes', () => {
    assert.ok(extractImports('a.ts', 'import x from "lodash";').includes('lodash'));
    assert.ok(extractImports('a.py', 'from fastapi import FastAPI').includes('fastapi'));
    assert.ok(extractImports('a.rs', 'use std::io;').includes('std::io'));
    assert.ok(extractImports('a.c', '#include <stdio.h>').includes('stdio.h'));
  });

  it('extracts explicit exports only', () => {
    assert.ok(extractExports('a.ts', 'export function visible() {}\nfunction hidden() {}').includes('visible'));
    assert.ok(!extractExports('a.ts', 'function hidden() {}').includes('hidden'));
    assert.ok(extractExports('a.py', "__all__ = ['public_name']").includes('public_name'));
  });
});

describe('the index refuses to answer for a commit that is no longer HEAD', () => {
  it('returns rows when the index matches HEAD', async () => {
    const store = new InMemoryRepositoryIndexStore();
    await store.save(buildIndex({ identity, commitSha: 'aaa111', files: tree }));
    const result = await readIndex(store, identity, 'aaa111');
    assert.equal(result.freshness, 'fresh');
    assert.ok(result.index);
  });

  it('returns NO rows when HEAD has moved', async () => {
    // The whole correctness argument. A stale hit would describe deleted code with real
    // paths, and a model handed that will edit files that moved three commits ago.
    const store = new InMemoryRepositoryIndexStore();
    await store.save(buildIndex({ identity, commitSha: 'aaa111', files: tree }));
    const result = await readIndex(store, identity, 'bbb222');

    assert.equal(result.freshness, 'stale');
    assert.equal(result.index, null, 'a stale index must yield no rows at all');
    assert.equal(result.indexedCommitSha, 'aaa111');
    assert.match(result.reason, /cannot describe the current tree/);
  });

  it('reports absence distinctly from staleness', async () => {
    const result = await readIndex(new InMemoryRepositoryIndexStore(), identity, 'aaa111');
    assert.equal(result.freshness, 'absent');
    assert.equal(result.index, null);
    assert.match(result.reason, /read canonical GitHub content instead/);
  });

  it('keeps one project from reading another\'s index of the same repository', async () => {
    const store = new InMemoryRepositoryIndexStore();
    await store.save(buildIndex({ identity, commitSha: 'aaa111', files: tree }));
    const other = await readIndex(store, { ...identity, projectId: 'p2' }, 'aaa111');
    assert.equal(other.freshness, 'absent');
  });

  it('keeps branches separate', async () => {
    const store = new InMemoryRepositoryIndexStore();
    await store.save(buildIndex({ identity, commitSha: 'aaa111', files: tree }));
    const develop = await readIndex(store, { ...identity, branch: 'develop' }, 'aaa111');
    assert.equal(develop.freshness, 'absent');
  });
});

describe('incremental update', () => {
  const base = buildIndex({ identity, commitSha: 'aaa111', files: tree });

  it('classifies added, modified, deleted and unchanged', () => {
    const next = [
      ...tree.filter((file) => file.path !== 'worker/src/main.rs'),
      f('packages/ui/src/Button.tsx', 'export function Button() { return "changed"; }\n'),
      f('service/app/routes.py', 'def list_items():\n    pass\n'),
    ].filter((file, index, all) => all.findIndex((other) => other.path === file.path) === index);

    const plan = planUpdate(base, next);
    assert.ok(plan.deleted.includes('worker/src/main.rs'));
    assert.ok(plan.added.includes('service/app/routes.py'));
    assert.ok(plan.unchanged.includes('package.json'));
  });

  it('detects a rename by identical blob SHA rather than by guessing', () => {
    // Content-addressed, so it is exact. A rename seen as delete-plus-add discards symbols
    // and imports that did not change, and re-extracting them is the expensive part.
    const renamed = tree.map((file) =>
      file.path === 'worker/src/main.rs' ? f('worker/src/cli.rs', file.content) : file,
    );
    const plan = planUpdate(base, renamed);

    assert.deepEqual(plan.renamed, [{ from: 'worker/src/main.rs', to: 'worker/src/cli.rs' }]);
    assert.ok(!plan.deleted.includes('worker/src/main.rs'), 'a rename is not a deletion');
    assert.ok(!plan.added.includes('worker/src/cli.rs'), 'nor an addition');
  });

  it('carries extracted data across a rename unchanged', () => {
    const renamed = tree.map((file) =>
      file.path === 'worker/src/main.rs' ? f('worker/src/cli.rs', file.content) : file,
    );
    const updated = applyUpdate({ index: base, files: renamed, commitSha: 'bbb222' });
    const moved = updated.files.find((file) => file.filePath === 'worker/src/cli.rs')!;

    assert.ok(moved.symbols.includes('run'), 'identical content needs no re-extraction');
    assert.equal(moved.blobSha, base.files.find((file) => file.filePath === 'worker/src/main.rs')!.blobSha);
  });

  it('removes deleted files and advances the commit', () => {
    const next = tree.filter((file) => file.path !== 'worker/src/main.rs' && file.path !== 'worker/Cargo.toml');
    const updated = applyUpdate({ index: base, files: next, commitSha: 'bbb222' });

    assert.equal(updated.files.some((file) => file.filePath === 'worker/src/main.rs'), false);
    assert.equal(updated.indexedCommitSha, 'bbb222');
  });

  it('re-extracts a modified file', () => {
    const next = tree.map((file) =>
      file.path === 'packages/ui/src/Button.tsx'
        ? f(file.path, 'export function RenamedButton() { return null; }\n')
        : file,
    );
    const updated = applyUpdate({ index: base, files: next, commitSha: 'bbb222' });
    const button = updated.files.find((file) => file.filePath === 'packages/ui/src/Button.tsx')!;

    assert.ok(button.symbols.includes('RenamedButton'));
    assert.ok(!button.symbols.includes('Button'));
  });

  it('leaves unchanged rows byte-identical', () => {
    const next = [...tree, f('README.md', '# demo')];
    const updated = applyUpdate({ index: base, files: next, commitSha: 'bbb222' });
    const before = base.files.find((file) => file.filePath === 'service/app/main.py')!;
    const after = updated.files.find((file) => file.filePath === 'service/app/main.py')!;
    assert.deepEqual(after, before, 'an untouched file must not be re-extracted');
  });
});

describe('refresh, and what happens when it cannot', () => {
  it('builds an index when none exists', async () => {
    const store = new InMemoryRepositoryIndexStore();
    const result = await refreshIndex({
      store, identity, currentHeadSha: 'aaa111', fetchFiles: async () => tree,
    });
    assert.equal(result.refreshed, true);
    assert.equal((await readIndex(store, identity, 'aaa111')).freshness, 'fresh');
  });

  it('does not leave a stale index readable when the fetch fails', async () => {
    // The dangerous case: a failed refresh must not let a later read treat old rows as
    // current. Staleness is decided by SHA comparison, so it survives a failed refresh.
    const store = new InMemoryRepositoryIndexStore();
    await store.save(buildIndex({ identity, commitSha: 'aaa111', files: tree }));

    const result = await refreshIndex({
      store, identity, currentHeadSha: 'bbb222',
      fetchFiles: async () => { throw new Error('API rate limit exceeded'); },
    });

    assert.equal(result.refreshed, false);
    assert.match(result.reason, /rate limit/);
    assert.match(result.reason, /use canonical GitHub content directly/);

    const read = await readIndex(store, identity, 'bbb222');
    assert.equal(read.freshness, 'stale');
    assert.equal(read.index, null, 'the failed refresh must not have made stale data readable');
  });

  it('makes the index fresh at the new HEAD after a successful refresh', async () => {
    const store = new InMemoryRepositoryIndexStore();
    await store.save(buildIndex({ identity, commitSha: 'aaa111', files: tree }));
    const next = [...tree, f('CHANGELOG.md', '# changes')];

    await refreshIndex({ store, identity, currentHeadSha: 'bbb222', fetchFiles: async () => next });
    const read = await readIndex(store, identity, 'bbb222');

    assert.equal(read.freshness, 'fresh');
    assert.ok(read.index!.files.some((file) => file.filePath === 'CHANGELOG.md'));
  });
});

describe('retrieval rather than whole-tree injection', () => {
  const index = buildIndex({ identity, commitSha: 'aaa111', files: tree });

  it('finds files by language, component, symbol and import', () => {
    assert.ok(queryIndex(index, { language: 'rust' }).every((file) => file.filePath.endsWith('.rs')));
    assert.ok(queryIndex(index, { componentRoot: 'service' }).length > 0);
    assert.ok(queryIndex(index, { symbol: 'Button' }).some((file) => file.filePath.endsWith('Button.tsx')));
    assert.ok(queryIndex(index, { importsModule: 'fastapi' }).some((file) => file.filePath.endsWith('main.py')));
  });

  it('returns nothing rather than everything for an unmatched query', () => {
    assert.deepEqual(queryIndex(index, { symbol: 'NoSuchSymbol' }), []);
  });
});
