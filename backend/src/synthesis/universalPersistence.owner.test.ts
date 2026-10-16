/** Owner admission and query shape fixtures; not a database/RLS substitute. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { SupabaseUniversalStore,universalStore } from './universalPersistence.js';
import { synthesizeUniversalProductSpec } from './universalProductSpec.js';
import { createTenantContext } from '../security/tenantContext.js';

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const identity={projectId:'logical-project',repositoryId:'fixture/local',repositoryOwner:'fixture',repositoryName:'local',branch:'main'};
test('privileged universal store requires issued scope and does not cache another request identity',async()=>{
  let requests=0;
  const client=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async()=>{requests++;throw new Error('No request expected');}}});
  assert.throws(()=>universalStore(client),{status:401});
  const a=universalStore(client,createTenantContext({userId:owner,via:'persisted_owner'}));
  const b=universalStore(client,createTenantContext({userId:other,via:'persisted_owner'}));assert.notEqual(a,b);
  await assert.rejects(a.loadLatestSpec({userId:other,projectId:identity.projectId}),{status:404});
  const denied=await a.saveSpec({userId:other,projectId:identity.projectId},synthesizeUniversalProductSpec({prompt:'Fixture spec'}));assert.equal(denied.saved,false);assert.equal(denied.reason,'Project data could not be saved. Retry shortly.');
  await assert.rejects(new SupabaseUniversalStore(client).load(identity),{status:401});assert.equal(requests,0);
});
test('foreign repository header denies child read and mutation predicates include server owner',async()=>{
  const requests:URL[]=[];
  const client=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{
    requests.push(new URL(String(input)));
    if(init?.method==='POST')assert.equal(JSON.parse(String(init.body)).p_owner,owner);
    return new Response('null',{headers:{'Content-Type':'application/json'}});
  }}});
  const store=new SupabaseUniversalStore(client,createTenantContext({userId:owner,via:'persisted_owner'}));
  assert.equal(await store.load(identity),null);assert.equal(requests.length,1);assert.equal(requests[0].pathname,'/rest/v1/rpc/load_repository_index_snapshot');
  await store.delete(identity);assert.equal(requests[1].searchParams.get('user_id'),`eq.${owner}`);
});

test('mutation history binds the requested project as well as owner and run',async()=>{
  const client=createClient('http://127.0.0.1:1','fixture-only',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input)=>{
    const url=new URL(String(input));
    assert.equal(url.searchParams.get('user_id'),`eq.${owner}`);
    assert.equal(url.searchParams.get('project_id'),'eq.requested-project');
    assert.equal(url.searchParams.get('run_id'),'eq.other-project-run');
    return new Response('[]',{headers:{'Content-Type':'application/json'}});
  }}});
  const store=new SupabaseUniversalStore(client,createTenantContext({userId:owner,via:'persisted_owner'}));
  assert.deepEqual(await store.loadMutations({userId:owner,projectId:'requested-project'},'other-project-run'),[]);
});
