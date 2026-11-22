import {readFileSync} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const blockedPreviewBranch='codex/xroga-batch-01';
export function productionActivationHeld(){try{const policy=JSON.parse(readFileSync(new URL('../../deploy/PRODUCTION_ACTIVATION_HOLD.json',import.meta.url),'utf8'));return policy.version!==1||policy.hold!==false;}catch{return true;}}
export function skipBatchPreview(branch,productionHold=productionActivationHeld()) {return !branch || branch===blockedPreviewBranch || branch==='main'&&productionHold;}
export function skipTeamsPreview(env) {
  if (env.VERCEL_GIT_COMMIT_REF !== 'feature/xroga-full-teams') return false;
  const ref = env.NEXT_PUBLIC_XROGA_AUTH_PROJECT_REF;
  if (env.VERCEL_ENV !== 'preview' || !ref || ref === 'nzenxdfumxrnsmybazmo'
    || !env.NEXT_PUBLIC_XROGA_TEAMS_PREVIEW_API_ORIGIN
    || env.NEXT_PUBLIC_API_URL !== env.NEXT_PUBLIC_XROGA_TEAMS_PREVIEW_API_ORIGIN) return true;
  try {
    const api = new URL(env.NEXT_PUBLIC_API_URL);
    return api.protocol !== 'https:' || api.origin !== env.NEXT_PUBLIC_API_URL
      || ['api.xroga.com','xroga.com','www.xroga.com'].includes(api.hostname);
  } catch { return true; }
}
// Code/CI is authorized, deployment is not. Vercel's 0 exit means ignore the build.
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if(skipBatchPreview(process.env.VERCEL_GIT_COMMIT_REF)){console.log('Build ignored: Batch 01 deployment is not authorized, coordinated production activation is held, or branch identity is unknown.');process.exitCode=0;}
  else if(skipTeamsPreview(process.env)){console.log('Build ignored: Teams needs an isolated Preview API and Supabase project.');process.exitCode=0;}
  else {
    const root=fileURLToPath(new URL('../..',import.meta.url));
    const result=spawnSync('git',['diff','--quiet','HEAD^','HEAD','--','frontend/','package.json','package-lock.json','vercel.json','scripts/enforce-next-postcss.mjs'],{cwd:root,windowsHide:true});
    process.exitCode=result.status===0?0:1;
  }
}
