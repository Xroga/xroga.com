import {readFileSync} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const blockedPreviewBranch='codex/xroga-batch-01';
export function productionActivationHeld(){try{const policy=JSON.parse(readFileSync(new URL('../../deploy/PRODUCTION_ACTIVATION_HOLD.json',import.meta.url),'utf8'));return policy.version!==1||policy.hold!==false;}catch{return true;}}
export function skipBatchPreview(branch,productionHold=productionActivationHeld()) {return !branch || branch===blockedPreviewBranch || branch==='main'&&productionHold;}
// Code/CI is authorized, deployment is not. Vercel's 0 exit means ignore the build.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(skipBatchPreview(process.env.VERCEL_GIT_COMMIT_REF)){console.log('Build ignored: Batch 01 deployment is not authorized, coordinated production activation is held, or branch identity is unknown.');process.exitCode=0;}
  else {
    const root=fileURLToPath(new URL('../..',import.meta.url));
    const result=spawnSync('git',['diff','--quiet','HEAD^','HEAD','--','frontend/','package.json','package-lock.json','vercel.json','scripts/enforce-next-postcss.mjs'],{cwd:root,windowsHide:true});
    process.exitCode=result.status===0?0:1;
  }
}
