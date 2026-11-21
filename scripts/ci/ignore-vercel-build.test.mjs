import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { skipBatchPreview,productionActivationHeld,frontendBuildInputsChanged } from './ignore-vercel-build.mjs';

test('shared backend renderer changes build a preview while documentation-only commits stay ignored', () => {
  const root=mkdtempSync(join(tmpdir(),'xroga-preview-inputs-'));
  const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'pipe',windowsHide:true});
  const commit=()=>{git('add','.');git('-c','user.name=Fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-qm','fixture');};
  try {
    git('init','-q');
    mkdirSync(join(root,'backend','src','ai'),{recursive:true});
    writeFileSync(join(root,'backend','src','ai','nativeOpenUi.ts'),'export const valid = true;\n');
    writeFileSync(join(root,'notes.md'),'Initial notes\n');
    commit();
    writeFileSync(join(root,'notes.md'),'Updated notes\n');
    commit();
    assert.equal(frontendBuildInputsChanged(root),false);
    writeFileSync(join(root,'backend','src','ai','nativeOpenUi.ts'),'export const valid = false;\n');
    commit();
    assert.equal(frontendBuildInputsChanged(root),true);
  } finally {
    assert.equal(dirname(resolve(root)),resolve(tmpdir()));
    rmSync(root,{recursive:true,force:true});
  }
});

test('unapproved Batch 01 branch and unknown branch cannot trigger a Vercel build',()=>{
  for(const branch of [undefined,'','codex/xroga-batch-01','main']) {
    assert.equal(skipBatchPreview(branch),true);
    const env={...process.env,VERCEL_GIT_COMMIT_REF:branch??''};
    const result=spawnSync(process.execPath,['scripts/ci/ignore-vercel-build.mjs'],{env,encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0);assert.match(result.stdout,/not authorized/);
  }
  assert.equal(productionActivationHeld(),true);
  assert.equal(skipBatchPreview('main'),true);
  assert.equal(skipBatchPreview('main',false),false);
  assert.equal(skipBatchPreview('codex/xroga-batch-01',false),true);
  assert.equal(skipBatchPreview('other-feature'),false);
});
