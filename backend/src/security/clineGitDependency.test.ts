import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { generateWorkspaceInfoWithDiagnostics } from '@cline/core';
import { Agent } from '@cline/sdk';
import { z } from 'zod';

// Resolve the real Cline receiver, with only its reviewed factory-import patch.
// No model calls, credentials or remote Git operations.
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

test('Cline resolves the fixed Git release and patched safety parser', () => {
  assert.equal(resolvedVersion(gitPath, 'simple-git'), '4.0.2');
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

test('fixed Git keeps local status diff and commit inspection compatible',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'xroga-git-api-'));
  try {
    const git=simpleGit({baseDir:directory});
    await git.init();
    await git.addConfig('user.name','Synthetic Test');await git.addConfig('user.email','test@example.invalid');
    await writeFile(join(directory,'example.txt'),'before\n');await git.add('example.txt');
    await git.raw(['-c','commit.gpgsign=false','commit','-m','fixture']);
    const log=await git.log({maxCount:1});assert.equal(log.latest?.message,'fixture');
    await writeFile(join(directory,'example.txt'),'after\n');
    assert.ok((await git.status()).modified.includes('example.txt'));
    const diff=await git.diff(['--','example.txt']);assert.ok(diff.includes('-before'));assert.ok(diff.includes('+after'));
  }finally{await rm(directory,{recursive:true,force:true});}
});

for (const key of ['VISUAL', 'visual', 'Visual']) {
  test(`Git parser rejects unsafe ${key} editor environment`, () => {
    const findings = parser.vulnerabilityCheck(['commit', '--amend'], { [key]: 'untrusted-editor' });
    assert.ok(findings.some((finding: { category?: string }) => finding.category === 'allowUnsafeEditor'));
  });
}

test('real Cline Agent executes a bounded prebuilt-model turn without providers or tools', async () => {
  let turns=0;
  // Validate the real runtime values rather than importing an internal type
  // absent from this SDK version's @cline/shared package-root exports.
  const model={async *stream(request:unknown){
      turns++;assert.equal(z.object({tools:z.array(z.unknown())}).parse(request).tools.length,0);
      yield {type:'text-delta' as const,text:'Synthetic SDK execution receipt'};
      yield {type:'finish' as const,reason:'stop' as const};
    }};
  const agent=new Agent({tools:[],maxIterations:1,completionPolicy:{requireCompletionTool:false},model});
  const result=z.object({status:z.string(),iterations:z.number(),outputText:z.string(),error:z.unknown().optional(),
    messages:z.array(z.object({role:z.string(),content:z.array(z.object({type:z.string(),text:z.string().optional()}))})),
  }).parse(await agent.run('Isolated compatibility fixture only'));
  assert.equal(turns,1);
  assert.ok(result.messages.some(message=>message.role==='assistant'&&message.content.some(part=>part.type==='text'&&part.text==='Synthetic SDK execution receipt')));
  assert.equal(result.iterations,1);assert.equal(result.status,'completed');
  assert.equal(result.outputText,'Synthetic SDK execution receipt');assert.equal(result.error,undefined);
});

for (const config of ['trailer.audit.cmd=untrusted-command', 'trailer.audit.command=untrusted-command', 'include.path=/untrusted/config']) {
  test(`Git rejects executable configuration before spawning: ${config.split('=')[0]}`, async () => {
    // A guard regression must fail without accidentally attempting network/Git
    // actions: Node as the binary cannot perform a Git action if spawn occurs.
    await assert.rejects(simpleGit({ binary: 'node', config: [config] }).raw(['status', '--porcelain']), (error: Error) => error instanceof GitPluginError && /is not permitted without enabling allowUnsafe/.test(error.message));
  });
}
