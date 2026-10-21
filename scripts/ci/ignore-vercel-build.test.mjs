import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { skipBatchPreview } from './ignore-vercel-build.mjs';

test('unapproved Batch 01 branch and unknown branch cannot trigger a Vercel build',()=>{
  for(const branch of [undefined,'','codex/xroga-batch-01']) {
    assert.equal(skipBatchPreview(branch),true);
    const env={...process.env,VERCEL_GIT_COMMIT_REF:branch??''};
    const result=spawnSync(process.execPath,['scripts/ci/ignore-vercel-build.mjs'],{env,encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0);assert.match(result.stdout,/not authorized/);
  }
  assert.equal(skipBatchPreview('main'),false);
  assert.equal(skipBatchPreview('other-feature'),false);
});
