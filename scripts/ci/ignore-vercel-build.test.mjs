import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { skipBatchPreview,productionActivationHeld,skipTeamsPreview } from './ignore-vercel-build.mjs';

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

test('Teams refuses production, missing isolation and production API or Auth defaults', () => {
  const candidate = { VERCEL_GIT_COMMIT_REF: 'feature/xroga-full-teams', VERCEL_ENV: 'preview',
    NEXT_PUBLIC_XROGA_AUTH_PROJECT_REF: 'abcdefghijklmnopqrst',
    NEXT_PUBLIC_API_URL: 'https://preview-api.example.org',
    NEXT_PUBLIC_XROGA_TEAMS_PREVIEW_API_ORIGIN: 'https://preview-api.example.org' };
  assert.equal(skipTeamsPreview(candidate), false);
  assert.equal(skipTeamsPreview({ ...candidate, VERCEL_ENV: 'production' }), true);
  assert.equal(skipTeamsPreview({ ...candidate, NEXT_PUBLIC_XROGA_AUTH_PROJECT_REF: 'nzenxdfumxrnsmybazmo' }), true);
  assert.equal(skipTeamsPreview({ ...candidate, NEXT_PUBLIC_API_URL: 'https://api.xroga.com', NEXT_PUBLIC_XROGA_TEAMS_PREVIEW_API_ORIGIN: 'https://api.xroga.com' }), true);
  assert.equal(skipTeamsPreview({ ...candidate, NEXT_PUBLIC_XROGA_TEAMS_PREVIEW_API_ORIGIN: '' }), true);
  assert.equal(skipTeamsPreview({ ...candidate, VERCEL_GIT_COMMIT_REF: 'other-feature' }), false);
});
