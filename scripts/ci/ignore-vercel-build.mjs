import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const blockedPreviewBranch='codex/xroga-batch-01';
export function skipBatchPreview(branch) {return !branch || branch===blockedPreviewBranch;}
// Code/CI is authorized, deployment is not. Vercel's 0 exit means ignore the build.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(skipBatchPreview(process.env.VERCEL_GIT_COMMIT_REF)){console.log('Build ignored: Batch 01 deployment is not authorized, or branch identity is unknown.');process.exitCode=0;}
  else {
    const root=fileURLToPath(new URL('../..',import.meta.url));
    const result=spawnSync('git',['diff','--quiet','HEAD^','HEAD','--','frontend/','package.json','package-lock.json','vercel.json','scripts/enforce-next-postcss.mjs','scripts/ci/ignore-vercel-build.mjs'],{cwd:root,windowsHide:true});
    process.exitCode=result.status===0?0:1;
  }
}
