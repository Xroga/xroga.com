/**
 * The repository tool suite, exercised against a fake repository.
 *
 * The fixture is deliberately awkward. Its important file lives at
 * `services/internal/platform/adapters/persistence/postgres/migrationRunner.ts` — deep,
 * unusual, and nowhere near any conventional path a hydration step would think to carry.
 * The previous context mechanism required the tree to be in memory before it could rank
 * anything, so a file like this was reachable only if something upstream had already
 * decided to fetch it. Several tests below exist purely to prove these tools find it
 * without anyone having predicted where it was.
 */

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import {
  LIMITS,
  REPOSITORY_TOOL_NAMES,
  RepositoryToolError,
  RepositoryToolSession,
  validateRepositoryPath,
  type BlobPayload,
  type RepositoryToolTransport,
} from './repositoryTools.js';
import type { RawTreeResponse } from '../services/integrations/githubTreeSnapshot.js';

const DEEP_PATH = 'services/internal/platform/adapters/persistence/postgres/migrationRunner.ts';

const DEEP_FILE = `import { Pool } from 'pg';
import { loadMigrationPlan } from '../../../planning/migrationPlan';

export class MigrationRunner {
  constructor(private readonly pool: Pool) {}

  async runPending(): Promise<number> {
    const plan = await loadMigrationPlan();
    return plan.length;
  }
}
`;

const FILES: Record<string, string> = {
  'package.json': '{\n  "name": "fixture"\n}\n',
  'README.md': '# Fixture\n',
  'src/index.ts': "import { MigrationRunner } from '../services/internal/platform/adapters/persistence/postgres/migrationRunner';\n\nexport const runner = MigrationRunner;\n",
  [DEEP_PATH]: DEEP_FILE,
  'docs/notes.md': 'Nothing important here.\n',
};

function blobSha(content: string): string {
  // Not git's algorithm — the tools only ever compare these for equality.
  return createHash('sha1').update(content).digest('hex');
}

interface FakeOptions {
  truncated?: boolean;
  symlinks?: Record<string, string>;
  submodules?: string[];
  oversized?: Record<string, number>;
  binary?: Record<string, string>;
  compare?: string | null;
}

function fakeTransport(options: FakeOptions = {}): RepositoryToolTransport & { blobReads: string[] } {
  const blobReads: string[] = [];
  const bySha = new Map<string, { content: string; size: number }>();
  const tree: RawTreeResponse['tree'] = [];

  for (const [path, content] of Object.entries({ ...FILES, ...(options.binary ?? {}) })) {
    const sha = blobSha(path);
    bySha.set(sha, { content, size: options.oversized?.[path] ?? Buffer.byteLength(content) });
    tree.push({ path, mode: '100644', type: 'blob', sha });
  }
  for (const [path, target] of Object.entries(options.symlinks ?? {})) {
    const sha = blobSha(`link:${path}`);
    bySha.set(sha, { content: target, size: target.length });
    tree.push({ path, mode: '120000', type: 'blob', sha });
  }
  for (const path of options.submodules ?? []) {
    tree.push({ path, mode: '160000', type: 'commit', sha: blobSha(`sub:${path}`) });
  }

  return {
    blobReads,
    async getCommitTreeSha(commitSha: string) {
      return commitSha === 'commit-abc' ? 'tree-abc' : null;
    },
    async getTree(treeSha: string): Promise<RawTreeResponse | null> {
      if (treeSha !== 'tree-abc') return null;
      return { sha: treeSha, tree, truncated: options.truncated ?? false };
    },
    async getBlob(sha: string): Promise<BlobPayload | null> {
      blobReads.push(sha);
      const found = bySha.get(sha);
      if (!found) return null;
      return { content: found.content, encoding: 'utf-8', size: found.size };
    },
    async compareCommits() {
      return options.compare === undefined ? 'diff --git a/x b/x\n' : options.compare;
    },
  };
}

function session(options?: FakeOptions): RepositoryToolSession {
  return new RepositoryToolSession(fakeTransport(options), {
    owner: 'Xroga',
    repo: 'fixture',
    commitSha: 'commit-abc',
    ref: 'refs/heads/main',
  });
}

describe('the tool surface', () => {
  it('exposes every tool the command requires', () => {
    for (const required of [
      'list_tree',
      'search_code',
      'search_symbol',
      'read_file',
      'read_file_range',
      'read_imports',
      'read_git_diff',
      'read_test_failure',
      'inspect_blob_sha',
      'write_file',
      'apply_patch',
      'propose_delete',
      'inspect_resulting_diff',
    ]) {
      assert.ok(
        (REPOSITORY_TOOL_NAMES as readonly string[]).includes(required),
        `${required} must exist`,
      );
    }
  });
});

describe('a file at a deep, unconventional path', () => {
  it('is listed without anyone having named its directory', async () => {
    const result = await session().listTree();
    assert.ok(result.data.paths.includes(DEEP_PATH), 'the deep file must be reachable from a plain listing');
  });

  it('is found by content search without a path hint', async () => {
    const result = await session().searchCode({ query: 'class MigrationRunner' });
    assert.equal(result.data.matches.length, 1);
    assert.equal(result.data.matches[0].path, DEEP_PATH);
  });

  it('is found by symbol declaration rather than by every mention', async () => {
    // src/index.ts imports and re-exports the name, so a plain text search matches both
    // files. Only one of them declares it.
    const mentions = await session().searchCode({ query: 'MigrationRunner' });
    assert.ok(mentions.data.matches.length > 1, 'the fixture should mention the symbol in several places');

    const declarations = await session().searchSymbol({ symbol: 'MigrationRunner' });
    assert.equal(declarations.data.declarations.length, 1);
    assert.equal(declarations.data.declarations[0].path, DEEP_PATH);
  });

  it('is readable directly, and its content is the file at that commit', async () => {
    const result = await session().readFile({ path: DEEP_PATH });
    assert.match(result.data.content, /class MigrationRunner/);
    assert.equal(result.evidence.commitSha, 'commit-abc');
  });
});

describe('fetching on demand', () => {
  it('does not read a single blob just to list the tree', async () => {
    const transport = fakeTransport();
    const s = new RepositoryToolSession(transport, {
      owner: 'Xroga',
      repo: 'fixture',
      commitSha: 'commit-abc',
    });
    await s.listTree();
    assert.equal(transport.blobReads.length, 0, 'listing must not hydrate the repository');
  });

  it('reads a file once, however many times it is asked for', async () => {
    const transport = fakeTransport();
    const s = new RepositoryToolSession(transport, {
      owner: 'Xroga',
      repo: 'fixture',
      commitSha: 'commit-abc',
    });
    await s.readFile({ path: DEEP_PATH });
    await s.readFile({ path: DEEP_PATH });
    await s.readFileRange({ path: DEEP_PATH, startLine: 1, endLine: 3 });
    assert.equal(transport.blobReads.length, 1);
  });
});

describe('path safety', () => {
  it('refuses to address anything inside .git', () => {
    for (const path of ['.git/config', '.git/hooks/pre-commit', 'nested/.git/HEAD', '.git\\config']) {
      assert.throws(
        () => validateRepositoryPath('read_file', path),
        (error: unknown) => {
          assert.ok(error instanceof RepositoryToolError);
          assert.equal(error.refusal, 'git_internal_path');
          return true;
        },
        `${path} must be refused`,
      );
    }
  });

  it('refuses traversal, absolute paths and NUL bytes', () => {
    for (const path of ['../secrets.env', 'a/../../b', '/etc/passwd', 'C:/Windows/System32', 'a\0b']) {
      assert.throws(() => validateRepositoryPath('read_file', path), RepositoryToolError, `${path} must be refused`);
    }
  });

  it('does not follow a symlink to reach the file it points at', async () => {
    const s = session({ symlinks: { 'shortcut.ts': '../../../etc/passwd' } });
    await assert.rejects(
      () => s.readFile({ path: 'shortcut.ts' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'symlink_path');
        return true;
      },
    );
  });

  it('does not treat a submodule as a file', async () => {
    const s = session({ submodules: ['vendor/thirdparty'] });
    await assert.rejects(
      () => s.readFile({ path: 'vendor/thirdparty' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'submodule_path');
        return true;
      },
    );
  });
});

describe('tenant isolation', () => {
  it('refuses a call that names a different repository', async () => {
    const s = session();
    await assert.rejects(
      () => s.readFile({ path: 'package.json', owner: 'SomeoneElse', repo: 'their-app' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'unauthorized_repository');
        return true;
      },
    );
  });

  it('refuses a call that keeps the owner but swaps the repository', async () => {
    const s = session();
    await assert.rejects(
      () => s.listTree({ owner: 'Xroga', repo: 'a-different-repo' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'unauthorized_repository');
        return true;
      },
    );
  });
});

describe('an incomplete snapshot', () => {
  it('is refused rather than treated as the whole repository', async () => {
    const s = session({ truncated: true });
    await assert.rejects(
      () => s.listTree(),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'tree_truncated');
        return true;
      },
    );
  });
});

describe('bounded output', () => {
  it('refuses a file over the read limit instead of returning it', async () => {
    const s = session({ oversized: { 'README.md': LIMITS.maxFileBytes + 1 } });
    await assert.rejects(
      () => s.readFile({ path: 'README.md' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'too_large');
        return true;
      },
    );
  });

  it('refuses a line range larger than the limit', async () => {
    const s = session();
    await assert.rejects(
      () => s.readFileRange({ path: DEEP_PATH, startLine: 1, endLine: LIMITS.maxRangeLines + 2 }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'too_large');
        return true;
      },
    );
  });

  it('refuses binary content rather than returning mojibake', async () => {
    const s = session({ binary: { 'assets/logo.png': 'PNG\0\0\0binary' } });
    await assert.rejects(
      () => s.readFile({ path: 'assets/logo.png' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'binary_content');
        return true;
      },
    );
  });
});

describe('secret redaction', () => {
  it('removes a credential from a result before the model sees it', async () => {
    const s = session({
      binary: {},
    });
    // Stage a file containing something that looks like a live key, then read it back
    // through the tool surface.
    await s.writeFile({
      path: 'config/runtime.ts',
      content: "export const key = 'sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJKKKKLLLL';\n",
    });
    const result = await s.inspectResultingDiff();
    assert.ok(result.data.creates.includes('config/runtime.ts'));

    const read = await s.readTestFailure({
      log: "✖ boom\n  token was sk-ant-api03-AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHHIIIIJJJJKKKKLLLL\n",
    });
    assert.doesNotMatch(
      JSON.stringify(read.data),
      /sk-ant-api03-AAAABBBBCCCCDDDD/,
      'a credential must not survive into a tool result',
    );
    assert.ok(read.evidence.redactions > 0, 'the redaction must be recorded as evidence');
  });
});

describe('staged writes', () => {
  it('requires an update to state the blob it was computed against', async () => {
    const s = session();
    await assert.rejects(
      () => s.writeFile({ path: 'package.json', content: '{}' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'missing_expected_sha');
        return true;
      },
    );
  });

  it('refuses a write computed against content that has since changed', async () => {
    const s = session();
    await assert.rejects(
      () => s.writeFile({ path: 'package.json', content: '{}', expectedBlobSha: 'some-old-sha' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'stale_base');
        return true;
      },
    );
  });

  it('accepts an update that states the current blob', async () => {
    const s = session();
    const sha = (await s.inspectBlobSha({ path: 'package.json' })).data.blobSha;
    const result = await s.writeFile({
      path: 'package.json',
      content: '{"name":"updated"}',
      expectedBlobSha: sha,
    });
    assert.equal(result.data.operation, 'update');
    assert.equal(result.data.baseBlobSha, sha);
  });

  it('treats a new path as a create, and refuses one that claims a base blob', async () => {
    const s = session();
    const created = await s.writeFile({ path: 'src/new.ts', content: 'export {};\n' });
    assert.equal(created.data.operation, 'create');
    assert.equal(created.data.baseBlobSha, null);

    await assert.rejects(
      () => s.writeFile({ path: 'src/other.ts', content: 'export {};\n', expectedBlobSha: 'invented' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'stale_base');
        return true;
      },
    );
  });

  it('refuses to stage a write through a symlink', async () => {
    const s = session({ symlinks: { 'shortcut.ts': '../outside.ts' } });
    await assert.rejects(
      () => s.writeFile({ path: 'shortcut.ts', content: 'x', expectedBlobSha: 'anything' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'symlink_path');
        return true;
      },
    );
  });
});

describe('staged patches', () => {
  it('refuses an empty search pattern', async () => {
    const s = session();
    await assert.rejects(
      () => s.applyPatch({ path: DEEP_PATH, search: '', replace: 'anything' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'invalid_path');
        return true;
      },
    );
  });

  it('refuses a pattern that does not appear', async () => {
    const s = session();
    await assert.rejects(
      () => s.applyPatch({ path: DEEP_PATH, search: 'function thatDoesNotExist', replace: 'x' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'stale_base');
        return true;
      },
    );
  });

  it('refuses an ambiguous pattern rather than picking one', async () => {
    const s = session();
    // `import ` appears on both import lines of the deep file.
    await assert.rejects(
      () => s.applyPatch({ path: DEEP_PATH, search: 'import ', replace: 'IMPORT ' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'stale_base');
        return true;
      },
    );
  });

  it('applies a pattern that matches exactly once', async () => {
    const s = session();
    const result = await s.applyPatch({
      path: DEEP_PATH,
      search: 'return plan.length;',
      replace: 'return plan.filter(Boolean).length;',
    });
    assert.match(result.data.content!, /plan\.filter\(Boolean\)\.length/);
    assert.doesNotMatch(result.data.content!, /return plan\.length;/);
  });

  it('patches on top of an earlier staged edit, not the original blob', async () => {
    const s = session();
    await s.applyPatch({ path: DEEP_PATH, search: 'runPending', replace: 'runOutstanding' });
    const second = await s.applyPatch({
      path: DEEP_PATH,
      search: 'return plan.length;',
      replace: 'return 0;',
    });
    assert.match(second.data.content!, /runOutstanding/, 'the first edit must survive the second');
    assert.match(second.data.content!, /return 0;/);
  });
});

describe('inspecting a proposal before it is applied', () => {
  it('reports what would change, and how much of the repository would be deleted', async () => {
    const s = session();
    await s.proposeDelete({ path: 'docs/notes.md' });
    await s.writeFile({ path: 'src/added.ts', content: 'export {};\n' });
    const shaOf = (await s.inspectBlobSha({ path: 'README.md' })).data.blobSha;
    await s.writeFile({ path: 'README.md', content: '# Changed\n', expectedBlobSha: shaOf });

    const diff = await s.inspectResultingDiff();
    assert.deepEqual(diff.data.deletes, ['docs/notes.md']);
    assert.deepEqual(diff.data.creates, ['src/added.ts']);
    assert.deepEqual(diff.data.updates, ['README.md']);
    assert.equal(diff.data.totalFilesAtCommit, 5);
    assert.ok(diff.data.deletionRatio > 0 && diff.data.deletionRatio < 0.5);
  });

  it('refuses to stage a delete for a file that is not there', async () => {
    const s = session();
    await assert.rejects(
      () => s.proposeDelete({ path: 'src/typo.ts' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'not_found');
        return true;
      },
    );
  });

  it('never mutates the repository itself', async () => {
    const transport = fakeTransport();
    const s = new RepositoryToolSession(transport, {
      owner: 'Xroga',
      repo: 'fixture',
      commitSha: 'commit-abc',
    });
    await s.proposeDelete({ path: 'docs/notes.md' });
    await s.writeFile({ path: 'src/added.ts', content: 'export {};\n' });

    // The tree the session reads is still the original one.
    const listing = await s.listTree();
    assert.ok(listing.data.paths.includes('docs/notes.md'), 'a staged delete must not remove the file');
    assert.ok(!listing.data.paths.includes('src/added.ts'), 'a staged create must not appear in the commit');
  });
});

describe('evidence', () => {
  it('records the commit every call was served from', async () => {
    const s = session();
    await s.listTree();
    await s.readFile({ path: DEEP_PATH });
    assert.ok(s.evidence.length >= 2);
    for (const entry of s.evidence) assert.equal(entry.commitSha, 'commit-abc');
  });

  it('records refusals, not just successes', async () => {
    const s = session();
    await assert.rejects(() => s.readFile({ path: '.git/config' }));
    const last = s.evidence[s.evidence.length - 1];
    assert.equal(last.ok, false);
    assert.equal(last.refusal, 'git_internal_path');
  });
});

describe('reading imports and diffs', () => {
  it('extracts the imports of a file without reading its dependencies', async () => {
    const result = await session().readImports({ path: DEEP_PATH });
    assert.deepEqual(result.data.imports, ['../../../planning/migrationPlan', 'pg']);
  });

  it('refuses a diff when the transport cannot compare commits', async () => {
    const transport = fakeTransport();
    delete (transport as { compareCommits?: unknown }).compareCommits;
    const s = new RepositoryToolSession(transport, {
      owner: 'Xroga',
      repo: 'fixture',
      commitSha: 'commit-abc',
    });
    await assert.rejects(
      () => s.readGitDiff({ baseSha: 'commit-old' }),
      (error: unknown) => {
        assert.ok(error instanceof RepositoryToolError);
        assert.equal(error.refusal, 'unsupported');
        return true;
      },
    );
  });
});

describe('reducing a test log', () => {
  it('keeps the failing assertion and drops the runner frames', async () => {
    const log = [
      '✔ a passing test (1ms)',
      '✖ the important failing test (3ms)',
      "  AssertionError: expected 'a' to equal 'b'",
      '      at TestContext.<anonymous> (/app/src/thing.test.ts:12:5)',
      '      at node:internal/test_runner/test:1325:25',
      '      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3)',
      '✔ another passing test (1ms)',
    ].join('\n');

    const result = await session().readTestFailure({ log });
    assert.equal(result.data.failures.length, 1);
    assert.match(result.data.failures[0].header, /the important failing test/);
    assert.match(result.data.failures[0].detail, /expected 'a' to equal 'b'/);
    assert.doesNotMatch(result.data.failures[0].detail, /node:internal/);
  });
});
