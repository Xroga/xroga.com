import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createClient} from '@supabase/supabase-js';
import {SupabaseUniversalStore} from './universalPersistence.js';
import {buildIndex} from './repositoryIndex.js';
import {createTenantContext} from '../security/tenantContext.js';

test('repository snapshot requires exact complete owner-bound receipts and immutable save input',async()=>{
  const owner='11111111-1111-4111-8111-111111111111';
  const identity={projectId:'project',repositoryId:'repo',repositoryOwner:'fixture',repositoryName:'repo',branch:'main'};
  const index=buildIndex({identity,commitSha:'commit',files:[{path:'a.txt',content:'A'}]});
  const id='project:repo:main';let mode='save',response:unknown,posted:Record<string,unknown>|undefined;
  let release:()=>void=()=>{};let held=false;
  const db=createClient('http://127.0.0.1:1','synthetic-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    const url=new URL(String(input));assert.equal(url.pathname,`/rest/v1/rpc/${mode}_repository_index_snapshot`);
    posted=JSON.parse(String(init?.body));assert.equal(posted!.p_owner,owner);assert.equal(posted!.p_index_id,id);
    if(held)await new Promise<void>(resolve=>{release=resolve;});
    return Response.json(response);
  }}});
  const store=new SupabaseUniversalStore(db,createTenantContext({userId:owner,via:'persisted_owner'}));
  const receipt={index_id:id,user_id:owner,indexed_commit_sha:'commit',file_count:1};
  for(response of [null,{}, {...receipt,user_id:'foreign'},{...receipt,index_id:'other'},{...receipt,indexed_commit_sha:'wrong'},{...receipt,file_count:0}]){
    await assert.rejects(store.save(index),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
  }
  response=receipt;held=true;const save=store.save(index);
  await new Promise(resolve=>setImmediate(resolve));
  identity.branch='mutated';(index.files[0] as {filePath:string}).filePath='mutated.txt';release();await save;held=false;
  assert.equal((posted!.p_index as typeof index).identity.branch,'main');
  assert.equal((posted!.p_index as typeof index).files[0].filePath,'a.txt');identity.branch='main';
  mode='load';
  const header={index_id:id,user_id:owner,project_id:'project',repository_id:'repo',repository_owner:'fixture',repository_name:'repo',branch:'main',schema_version:'1.0.0',indexed_commit_sha:'commit',file_count:1,updated_at:new Date().toISOString()};
  const file={index_id:id,user_id:owner,file_path:'a.txt',blob_sha:'blob',size_bytes:1,is_binary:false,symbols:[],imports:[],exports:[],updated_at:header.updated_at};
  for(response of [null,{header:{...header,user_id:'foreign'},files:[file]},{header:{...header,branch:'other'},files:[file]},
    {header,files:[]},{header,files:[{...file,user_id:'foreign'}]},{header,files:[{...file,is_binary:'false'}]},
    {header,files:[{...file,size_bytes:-1}]},{header,files:[{...file,symbols:[{}]}]}])assert.equal(await store.load(identity),null);
  response={header,files:[file]};const loaded=await store.load(identity);assert.equal(loaded?.indexedCommitSha,'commit');assert.equal(loaded.files.length,1);
});
