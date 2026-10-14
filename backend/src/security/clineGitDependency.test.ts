import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateWorkspaceInfoWithDiagnostics } from '@cline/core';

// Resolve the dependency used by the real, unchanged Cline SDK, not an unrelated
// top-level patched copy. No model calls, credentials or remote Git operations.
const requireCore = createRequire(import.meta.resolve('@cline/core'));
const gitPath = requireCore.resolve('simple-git');
const requireGit = createRequire(gitPath);
const { simpleGit, GitPluginError } = requireGit('simple-git');
const parser = requireGit('@simple-git/argv-parser');
function resolvedVersion(entry: string, name: string): string {
  let directory = dirname(entry);
  for (let count = 0; count < 8; count++) {
    const path = join(directory, 'package.json');
    if (existsSync(path)) {
      const metadata = JSON.parse(readFileSync(path, 'utf8'));
      if (metadata.name === name) return metadata.version;
    }
    directory = dirname(directory);
  }
  throw new Error('Resolved dependency metadata unavailable');
}

test('Cline keeps its compatible Git API while resolving the patched safety parser', () => {
  assert.equal(resolvedVersion(gitPath, 'simple-git'), '3.36.0');
  // Parser package subpath exports are restrictive; inspect only its resolved
  // installed package metadata, not a different top-level package.
  assert.equal(resolvedVersion(requireGit.resolve('@simple-git/argv-parser'), '@simple-git/argv-parser'), '2.0.1');
});

test('real Cline workspace discovery preserves repository metadata without network', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xroga-cline-git-'));
  try {
    execFileSync('git', ['init', '-b', 'fixture', directory]);
    await writeFile(join(directory, 'fixture.txt'), 'isolated synthetic fixture\n');
    execFileSync('git', ['-C', directory, 'add', 'fixture.txt']);
    execFileSync('git', ['-C', directory, '-c', 'user.name=Synthetic Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture']);
    execFileSync('git', ['-C', directory, 'remote', 'add', 'origin', 'https://example.invalid/fixture.git']);
    const before = execFileSync('git', ['-C', directory, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const info = await generateWorkspaceInfoWithDiagnostics(directory);
    assert.equal(info.vcsType, 'git');
    assert.equal(info.error, undefined);
    assert.equal(info.info.latestGitCommitHash, before);
    assert.equal(info.gitState.branch, 'fixture');
    assert.equal(info.gitState.url, 'https://example.invalid/fixture.git');
    assert.equal(execFileSync('git', ['-C', directory, 'status', '--porcelain'], { encoding: 'utf8' }), '');
  } finally {
    // Only this exact freshly created temporary fixture directory is removed.
    await rm(directory, { recursive: true, force: true });
  }
});

for (const key of ['VISUAL', 'visual', 'Visual']) {
  test(`Git parser rejects unsafe ${key} editor environment`, () => {
    const findings = parser.vulnerabilityCheck(['commit', '--amend'], { [key]: 'untrusted-editor' });
    assert.ok(findings.some((finding: { category?: string }) => finding.category === 'allowUnsafeEditor'));
  });
}

for (const config of ['trailer.audit.cmd=untrusted-command', 'trailer.audit.command=untrusted-command', 'include.path=/untrusted/config']) {
  test(`Git rejects executable configuration before spawning: ${config.split('=')[0]}`, async () => {
    // A guard regression must fail without accidentally attempting network/Git
    // actions: Node as the binary cannot perform a Git action if spawn occurs.
    await assert.rejects(simpleGit({ binary: 'node', config: [config] }).raw(['status', '--porcelain']), (error: Error) => error instanceof GitPluginError && /is not permitted without enabling allowUnsafe/.test(error.message));
  });
}
