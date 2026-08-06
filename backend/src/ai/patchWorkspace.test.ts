/**
 * Tests for the transactional patch workspace.
 *
 * The three facts these exist to pin, each of which was reachable from an ordinary model
 * response before: a failed transaction left earlier patches applied; the stale-base check
 * had no producer so it never fired; and `.git` was an ordinary writable path.
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { describe, it } from 'node:test';
import {
  PatchWorkspace,
  PatchWorkspaceError,
  checkWorkspacePath,
  gitBlobSha,
} from './patchWorkspace.js';
import type { ProjectFile } from './patches.js';

const COMMIT = '4d1f2a9c8b7e6d5f4a3b2c1d0e9f8a7b6c5d4e3f';

const FILES: ProjectFile[] = [
  { path: 'src/index.ts', content: "import { serve } from './serve.js';\nserve();\n" },
  { path: 'src/serve.ts', content: 'export function serve() {\n  return 1;\n}\n' },
  { path: 'package.json', content: '{\n  "name": "app"\n}\n' },
  { path: 'README.md', content: '# App\n' },
];

function open(overrides: Partial<Parameters<typeof PatchWorkspace.open>[0]> = {}) {
  return PatchWorkspace.open({ commitSha: COMMIT, files: FILES, ...overrides });
}

/** The refusal from a call expected to fail, so a passing call is never mistaken for one. */
async function refusalOf(run: () => Promise<unknown>): Promise<PatchWorkspaceError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof PatchWorkspaceError, `expected a workspace refusal, got ${String(error)}`);
    return error;
  }
  throw new assert.AssertionError({ message: 'the call was expected to be refused and was not' });
}

describe('the expected base blob SHA', () => {
  it('is the same value git itself computes', () => {
    // Without this, the SHA the workspace derives could never be compared to the one
    // GitHub reports, and stale-base detection would be decorative.
    const content = 'export function serve() {\n  return 1;\n}\n';
    const fromGit = execFileSync('git', ['hash-object', '--stdin'], { input: content }).toString().trim();
    assert.equal(gitBlobSha(content), fromGit);
  });

  it('distinguishes a CRLF file from its LF twin', () => {
    // Deliberate: git stores bytes, so these are different objects. Normalising here
    // would make a stale base look current on a CRLF checkout.
    assert.notEqual(gitBlobSha('a\r\nb\r\n'), gitBlobSha('a\nb\n'));
  });

  it('is derivable from the workspace for every file at the source commit', async () => {
    const workspace = await open();
    for (const file of FILES) {
      assert.equal(workspace.baseBlobSha(file.path), gitBlobSha(file.content));
    }
    assert.equal(workspace.baseBlobSha('does/not/exist.ts'), null, 'an absent path has no base');
    await workspace.dispose();
  });

  it('is required for an update, so the check cannot go unexercised again', async () => {
    const workspace = await open();
    const refusal = await refusalOf(() =>
      workspace.stageWrite({ path: 'src/serve.ts', content: 'export function serve() {\n  return 2;\n}\n' }),
    );
    assert.equal(refusal.refusal, 'missing_expected_base');
    assert.equal(refusal.commitSha, COMMIT, 'a refusal names the commit it was judged against');
    await workspace.dispose();
  });

  it('refuses a change written against a base the file has moved past', async () => {
    const workspace = await open();
    const refusal = await refusalOf(() =>
      workspace.stageWrite({
        path: 'src/serve.ts',
        content: 'export function serve() {\n  return 2;\n}\n',
        expectedBlobSha: gitBlobSha('something else entirely\n'),
      }),
    );
    assert.equal(refusal.refusal, 'stale_source');
    await workspace.dispose();
  });

  it('accepts a change written against the base the workspace reports', async () => {
    const workspace = await open();
    const change = await workspace.stageWrite({
      path: 'src/serve.ts',
      content: 'export function serve() {\n  return 2;\n}\n',
      expectedBlobSha: workspace.baseBlobSha('src/serve.ts'),
    });
    assert.equal(change.kind, 'update');
    assert.equal(change.baseBlobSha, gitBlobSha(FILES[1].content));
    await workspace.dispose();
  });

  it('advances the expected base after a staged change, so a second edit must use the new one', async () => {
    const workspace = await open();
    const first = await workspace.stageWrite({
      path: 'src/serve.ts',
      content: 'export function serve() {\n  return 2;\n}\n',
      expectedBlobSha: workspace.baseBlobSha('src/serve.ts'),
    });

    const stale = await refusalOf(() =>
      workspace.stageWrite({
        path: 'src/serve.ts',
        content: 'export function serve() {\n  return 3;\n}\n',
        expectedBlobSha: workspace.baseBlobSha('src/serve.ts'),
      }),
    );
    assert.equal(stale.refusal, 'stale_source', 'the original base must not still be accepted');

    await workspace.stageWrite({
      path: 'src/serve.ts',
      content: 'export function serve() {\n  return 3;\n}\n',
      expectedBlobSha: first.resultBlobSha,
    });
    await workspace.dispose();
  });
});
describe('path safety', () => {
  it('refuses the .git directory at any depth and in any case', () => {
    for (const path of ['.git/config', '.git/hooks/pre-commit', 'src/.git/config', 'src/.GIT/HEAD', '.Git/index']) {
      const refusal = checkWorkspacePath(path);
      assert.ok(refusal, `${path} must be refused`);
      assert.equal(refusal.refusal, 'git_directory', path);
    }
  });

  it('refuses traversal, absolute paths, NUL and reserved device names', () => {
    const cases: Array<[string, string]> = [
      ['../outside.ts', 'path_traversal'],
      ['src/../../outside.ts', 'path_traversal'],
      ['/etc/passwd', 'absolute_path'],
      ['C:/Windows/System32/drivers/etc/hosts', 'absolute_path'],
      ['src\\..\\..\\outside.ts', 'path_traversal'],
      ['src/wi\0th-nul.ts', 'nul_byte'],
      ['', 'empty_path'],
      ['src/CON', 'path_traversal'],
      ['src/aux.ts', 'path_traversal'],
    ];
    for (const [path, expected] of cases) {
      const refusal = checkWorkspacePath(path);
      assert.ok(refusal, `${JSON.stringify(path)} must be refused`);
      assert.equal(refusal.refusal, expected, JSON.stringify(path));
    }
  });

  it('allows ordinary paths, including deeply nested ones and leading ./', () => {
    for (const path of [
      'src/index.ts',
      './src/index.ts',
      'services/internal/platform/adapters/persistence/postgres/migrationRunner.ts',
      '.github/workflows/ci.yml',
      'a.gitignore',
      'src/gitignore/thing.ts',
    ]) {
      assert.equal(checkWorkspacePath(path), null, `${path} should be allowed`);
    }
  });

  it('refuses a write to .git through the workspace, not only through the parser', async () => {
    const workspace = await open();
    const refusal = await refusalOf(() =>
      workspace.stageWrite({ path: '.git/hooks/pre-commit', content: '#!/bin/sh\nrm -rf /\n' }),
    );
    assert.equal(refusal.refusal, 'git_directory');
    await workspace.dispose();
  });

  it('does not write through a symlink that exists at the source commit', async () => {
    const workspace = await open({
      files: [...FILES, { path: 'link.ts', content: '../../../etc/passwd' }],
      symlinkPaths: ['link.ts'],
    });
    const refusal = await refusalOf(() =>
      workspace.stageWrite({ path: 'link.ts', content: 'owned\n', expectedBlobSha: workspace.baseBlobSha('link.ts') }),
    );
    assert.equal(refusal.refusal, 'symlink');
    await workspace.dispose();
  });
});

describe('the transaction', () => {
  it('leaves the caller file set untouched until commit', async () => {
    const before = JSON.stringify(FILES);
    const workspace = await open();
    await workspace.stageWrite({
      path: 'src/serve.ts',
      content: 'export function serve() {\n  return 2;\n}\n',
      expectedBlobSha: workspace.baseBlobSha('src/serve.ts'),
    });
    await workspace.stageDelete('README.md', workspace.baseBlobSha('README.md'));
    assert.equal(JSON.stringify(FILES), before, 'staging must not mutate the source file set');
    await workspace.dispose();
  });

  it('discards every staged change when the transaction is abandoned', async () => {
    // The regression this pins: a run that failed on its fourth patch had already
    // committed the first three, and the branch was written from that half-state.
    const workspace = await open();
    await workspace.stageWrite({
      path: 'src/serve.ts',
      content: 'first\n',
      expectedBlobSha: workspace.baseBlobSha('src/serve.ts'),
      allowDestructive: true,
    });
    await workspace.stageWrite({ path: 'src/new.ts', content: 'second\n' });

    const refusal = await refusalOf(() => workspace.stageWrite({ path: '.git/config', content: 'third\n' }));
    assert.equal(refusal.refusal, 'git_directory');

    await workspace.dispose();
    // The source set is the only thing that survives an abandoned transaction.
    assert.deepEqual(
      FILES.map((f) => f.path).sort(),
      ['README.md', 'package.json', 'src/index.ts', 'src/serve.ts'],
    );
    assert.equal(FILES[1].content, 'export function serve() {\n  return 1;\n}\n');
  });

  it('produces the resulting file set only on commit', async () => {
    const workspace = await open();
    await workspace.stageWrite({
      path: 'src/serve.ts',
      content: 'export function serve() {\n  return 2;\n}\n',
      expectedBlobSha: workspace.baseBlobSha('src/serve.ts'),
    });
    await workspace.stageWrite({ path: 'src/added.ts', content: 'export const added = true;\n' });
    await workspace.stageDelete('README.md', workspace.baseBlobSha('README.md'));

    const result = await workspace.commit();
    const byPath = new Map(result.files.map((f) => [f.path, f.content]));
    assert.equal(byPath.get('src/serve.ts'), 'export function serve() {\n  return 2;\n}\n');
    assert.equal(byPath.get('src/added.ts'), 'export const added = true;\n');
    assert.equal(byPath.has('README.md'), false, 'the deleted file must not come back');
    assert.equal(byPath.get('package.json'), '{\n  "name": "app"\n}\n', 'an untouched file is carried through');
    assert.equal(result.commitSha, COMMIT);
  });

  it('refuses further work after it is closed', async () => {
    const workspace = await open();
    await workspace.commit();
    const refusal = await refusalOf(() => workspace.stageWrite({ path: 'src/late.ts', content: 'x\n' }));
    assert.equal(refusal.refusal, 'workspace_closed');
  });
});

describe('inspecting the resulting diff', () => {
  it('reports what would change before the branch is touched', async () => {
    const workspace = await open();
    await workspace.stageWrite({ path: 'src/added.ts', content: 'export const a = 1;\n' });
    await workspace.stageWrite({
      path: 'src/serve.ts',
      content: 'export function serve() {\n  return 2;\n}\n',
      expectedBlobSha: workspace.baseBlobSha('src/serve.ts'),
    });
    await workspace.stageDelete('README.md', workspace.baseBlobSha('README.md'));

    const diff = workspace.inspectDiff();
    assert.deepEqual(diff.creates, ['src/added.ts']);
    assert.deepEqual(diff.updates, ['src/serve.ts']);
    assert.deepEqual(diff.deletes, ['README.md']);
    assert.equal(diff.filesAtBase, 4);
    assert.equal(diff.deletionRatio, 0.25);
    assert.ok(diff.linesAdded > 0 && diff.linesRemoved > 0);
    await workspace.dispose();
  });

  it('makes a mass deletion visible as a ratio rather than a file list to skim', async () => {
    const workspace = await open();
    for (const path of ['README.md', 'package.json', 'src/index.ts']) {
      await workspace.stageDelete(path, workspace.baseBlobSha(path));
    }
    assert.equal(workspace.inspectDiff().deletionRatio, 0.75);
    await workspace.dispose();
  });

  it('refuses to delete something that is not there', async () => {
    const workspace = await open();
    const refusal = await refusalOf(() => workspace.stageDelete('src/never-existed.ts'));
    assert.equal(refusal.refusal, 'unknown_path');
    await workspace.dispose();
  });
});

describe('patch safety inside the workspace', () => {
  it('refuses an empty SEARCH against an existing file', async () => {
    const workspace = await open();
    const refusal = await refusalOf(() =>
      workspace.stagePatch({ path: 'src/serve.ts', search: '   ', replace: 'wiped\n' }),
    );
    assert.equal(refusal.refusal, 'empty_search_on_existing_file');
    await workspace.dispose();
  });

  it('refuses a SEARCH that matches more than once rather than picking one', async () => {
    const workspace = await open({
      files: [{ path: 'src/dup.ts', content: 'const x = 1;\nconst x = 1;\n' }],
    });
    const refusal = await refusalOf(() =>
      workspace.stagePatch({
        path: 'src/dup.ts',
        search: 'const x = 1;',
        replace: 'const x = 2;',
        expectedBlobSha: workspace.baseBlobSha('src/dup.ts'),
      }),
    );
    assert.equal(refusal.refusal, 'search_ambiguous');
    await workspace.dispose();
  });

  it('refuses a patch that would remove most of a file without saying so', async () => {
    const workspace = await open({
      files: [{ path: 'src/big.ts', content: `${'export const keep = 1;\n'.repeat(40)}const tail = 2;\n` }],
    });
    const refusal = await refusalOf(() =>
      workspace.stagePatch({
        path: 'src/big.ts',
        search: `${'export const keep = 1;\n'.repeat(40)}const tail = 2;\n`,
        replace: 'gone\n',
        expectedBlobSha: workspace.baseBlobSha('src/big.ts'),
      }),
    );
    assert.equal(refusal.refusal, 'unexpectedly_destructive');
    await workspace.dispose();
  });

  it('applies an unambiguous patch and stacks a second one on the result', async () => {
    const workspace = await open();
    const first = await workspace.stagePatch({
      path: 'src/serve.ts',
      search: 'return 1;',
      replace: 'return 2;',
      expectedBlobSha: workspace.baseBlobSha('src/serve.ts'),
    });
    await workspace.stagePatch({
      path: 'src/serve.ts',
      search: 'return 2;',
      replace: 'return 3;',
      expectedBlobSha: first.resultBlobSha,
    });
    const result = await workspace.commit();
    assert.equal(
      result.files.find((f) => f.path === 'src/serve.ts')?.content,
      'export function serve() {\n  return 3;\n}\n',
    );
  });

  it('creates a file when the patch says that is what it is doing', async () => {
    const workspace = await open();
    const change = await workspace.stagePatch({
      path: 'src/created.ts',
      search: '',
      replace: 'export const created = true;\n',
      isNewFile: true,
    });
    assert.equal(change.kind, 'create');
    assert.equal(change.baseBlobSha, null);
    await workspace.dispose();
  });
});
