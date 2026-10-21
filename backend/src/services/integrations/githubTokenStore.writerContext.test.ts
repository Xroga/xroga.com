import assert from 'node:assert/strict';
import {test} from 'node:test';
import {saveGitHubTokenToStorage} from './githubTokenStore.js';
import {createTenantContext,type TenantContext} from '../../security/tenantContext.js';

test('legacy GitHub mirror writes require original issued context before bucket or transport',async()=>{
 const previous={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SERVICE_ROLE_KEY},original=globalThis.fetch;
 process.env.SUPABASE_URL='http://127.0.0.1:49191';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-loopback-only';
 const userId='11111111-1111-4111-8111-111111111111',context=createTenantContext({userId,via:'remote_getuser'});
 const payload={access_token:'SYNTHETIC_MIRROR_FIXTURE',username:'fixture',provider_user_id:'fixture',repo_strategy:'auto' as const,default_repo:null,updated_at:'2026-10-19T00:00:00Z'};
 let requests=0,uploads=0;
 globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input instanceof Request?input.url:input));assert.equal(url.origin,process.env.SUPABASE_URL);requests++;
  if(url.pathname==='/storage/v1/bucket')return Response.json([{id:'xroga-github-tokens',name:'xroga-github-tokens',public:false}]);
  assert.equal(url.pathname,`/storage/v1/object/xroga-github-tokens/${userId}/github.json`);uploads++;assert.deepEqual(JSON.parse(String(init?.body)),payload);return Response.json({Key:'fixture'});
 };
 try{
  for(const forged of [userId,{userId},{...context}]){
   assert.equal(await saveGitHubTokenToStorage(forged as TenantContext,payload),false);
   assert.equal(requests,0,'Unissued authority cannot even inspect or create the bucket');
  }
  assert.equal(await saveGitHubTokenToStorage(context,payload),true);assert.equal(uploads,1);
 }finally{
  globalThis.fetch=original;
  previous.url===undefined?delete process.env.SUPABASE_URL:process.env.SUPABASE_URL=previous.url;
  previous.key===undefined?delete process.env.SUPABASE_SERVICE_ROLE_KEY:process.env.SUPABASE_SERVICE_ROLE_KEY=previous.key;
 }
});
