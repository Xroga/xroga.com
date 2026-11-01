import test from 'node:test';
import assert from 'node:assert/strict';
import {createTenantContext} from '../../security/tenantContext.js';
import {saveGitHubTokenToStorage} from './githubTokenStore.js';

test('actual legacy credential upload refuses public/unknown buckets and binds both upload attempts to original owner',async t=>{
  const keys=['NODE_ENV','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','XROGA_LEGACY_CREDENTIAL_MIGRATION','FLY_APP_NAME'];
  const old=keys.map(k=>process.env[k]);Object.assign(process.env,{NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55440',SUPABASE_SERVICE_ROLE_KEY:'synthetic-only'});
  delete process.env.FLY_APP_NAME;delete process.env.XROGA_LEGACY_CREDENTIAL_MIGRATION;
  t.after(()=>keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}));
  const owner='11111111-1111-4111-8111-111111111111',context=createTenantContext({userId:owner,via:'remote_getuser'});
  const data={access_token:'SYNTHETIC_ENCRYPTED_FIXTURE_NOT_REAL_CREDENTIAL',username:'fixture',provider_user_id:'fixture',repo_strategy:'auto' as const,default_repo:null,updated_at:'2026-10-23T00:00:00Z'};
  let mode='private',requests=0,uploads=0;
  t.mock.method(console,'warn',(...args:unknown[])=>assert.doesNotMatch(JSON.stringify(args),/SYNTHETIC_ENCRYPTED|provider_user_id/));
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));assert.equal(url.origin,process.env.SUPABASE_URL);requests++;
    if(url.pathname==='/storage/v1/bucket'){
      if(mode==='unavailable')return Response.json({message:'Unavailable'},{status:503});
      return Response.json([{id:'xroga-github-tokens',name:'xroga-github-tokens',...(mode==='unknown'?{}:{public:mode==='public'})}]);
    }
    assert.equal(init?.method,'POST');assert.equal(url.pathname,`/storage/v1/object/xroga-github-tokens/${owner}/github.json`);
    assert.deepEqual(JSON.parse(String(init.body)),data);uploads++;
    return mode==='retry'&&uploads===1?Response.json({message:'Bucket not found'},{status:404}):Response.json({Key:'synthetic'});
  });
  assert.equal(await saveGitHubTokenToStorage(context,data),true);assert.equal(uploads,1);
  for(const scenario of ['public','unknown','unavailable']){mode=scenario;uploads=0;assert.equal(await saveGitHubTokenToStorage(context,data),false);assert.equal(uploads,0);}
  mode='retry';uploads=0;assert.equal(await saveGitHubTokenToStorage(context,data),true);assert.equal(uploads,2);
  const before=requests;assert.equal(await saveGitHubTokenToStorage({...context},data),false);assert.equal(requests,before);
  process.env.NODE_ENV='production';assert.equal(await saveGitHubTokenToStorage(context,data),false);assert.equal(requests,before,'Closed migration window denies before any bucket or upload request');
});
