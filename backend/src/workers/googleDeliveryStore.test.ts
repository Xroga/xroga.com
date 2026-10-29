import assert from 'node:assert/strict';
import test from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {GoogleDeliveryStore,requireCanonicalDeliveryClaim} from './googleDeliveryStore.js';
import {GoogleDispatchError,type GoogleDispatchConfiguration} from './googleDispatch.js';
import {createTenantContext} from '../security/tenantContext.js';
const project='project-c40d4821-e647-4fa2-92d';
const c:GoogleDispatchConfiguration={project,region:'us-east4',queue:'xroga-canonical-queue',job:'xroga-canonical-worker',
  dispatcherUrl:'https://xroga-dispatcher-fixture.us-east4.run.app/internal/canonical-dispatch',
  dispatchAccount:`xroga-dispatcher@${project}.iam.gserviceaccount.com`,runtimeAccount:`xroga-api-runtime@${project}.iam.gserviceaccount.com`,
  image:`us-east4-docker.pkg.dev/${project}/cloud-run-source-deploy/xroga-api-migration@sha256:${'a'.repeat(64)}`,sourceSha:'b'.repeat(40),kmsKeyName:`projects/${project}/locations/us-central1/keyRings/synthetic/cryptoKeys/custody`};
const delivery='11111111-1111-4111-8111-111111111111',run='22222222-2222-4222-8222-222222222222',owner='33333333-3333-4333-8333-333333333333',worker='44444444-4444-4444-8444-444444444444';
const env={CLOUD_RUN_JOB:c.job,CLOUD_RUN_EXECUTION:c.job+'-fixture',XROGA_RELEASE_SHA:c.sourceSha};
const denied=(e:unknown)=>e instanceof GoogleDispatchError;
test('only the exact native Job can claim a delivery and owner context comes from the DB receipt',async()=>{
  let calls=0;
  const service=()=>({rpc:async(name:string,args:any)=>{calls++;assert.equal(name,'claim_google_canonical_run');return{data:{deliveryId:delivery,
    runId:run,userId:owner,sourceSha:c.sourceSha,workerId:worker,generation:args.p_generation,freshStart:false,
    input:{prompt:'synthetic request',userId:'UNTRUSTED_BODY_OWNER',tenantContext:{userId:'UNTRUSTED_BODY_OWNER'}}},error:null};}} as unknown as SupabaseClient);
  const store=new GoogleDeliveryStore(c,env,async account=>{assert.equal(account,c.runtimeAccount);},service);
  const claim=await store.claim(delivery,worker);assert.ok(claim);const issued=requireCanonicalDeliveryClaim(claim);
  assert.equal(issued.context.userId,owner);assert.equal(issued.context.provenance,'persisted_owner');
  assert.equal((issued.input as any).userId,undefined);assert.equal((issued.input as any).tenantContext,undefined);
  assert.throws(()=>requireCanonicalDeliveryClaim({...claim}),denied);assert.equal(calls,1);
  for(const wrong of [{...env,CLOUD_RUN_JOB:'foreign-job'},{...env,XROGA_RELEASE_SHA:'c'.repeat(40)}]){
    await assert.rejects(new GoogleDeliveryStore(c,wrong,async()=>{},service).claim(delivery,worker),denied);
  }
  assert.equal(calls,1);
});
test('native identity denial never reads a delivery, and a rejected duplicate issues no authority',async()=>{
  let calls=0;const service=()=>({rpc:async()=>{calls++;return{data:null,error:null};}} as unknown as SupabaseClient);
  await assert.rejects(new GoogleDeliveryStore(c,env,async()=>{throw new Error('PRIVATE_IDENTITY_CANARY');},service).claim(delivery,worker));
  assert.equal(calls,0);assert.equal(await new GoogleDeliveryStore(c,env,async()=>{},service).claim(delivery,worker),null);assert.equal(calls,1);
});
test('launch reservation and recording require exact token and one-row receipt, no fabricated acknowledgment',async()=>{
  let wrong=false;
  const service=()=>({rpc:async(name:string,args:any)=>({error:null,data:name==='reserve_google_canonical_launch'
    ?{state:'reserved',deliveryId:delivery,token:wrong?'foreign':args.p_token}:!wrong})} as unknown as SupabaseClient);
  const store=new GoogleDeliveryStore(c,env,async()=>{},service);const reservation=await store.reserve(delivery);
  assert.equal(reservation.state,'reserved');if(reservation.state!=='reserved')throw new Error('Fixture');
  await store.recordLaunch(delivery,reservation.token,`projects/${project}/locations/us-east4/operations/fixture`);
  wrong=true;await assert.rejects(store.reserve(delivery),denied);
  await assert.rejects(store.recordLaunch(delivery,reservation.token,`projects/${project}/locations/us-east4/operations/fixture`),denied);
});

test('only a database-proven never-admitted retry can start without a nonexistent execution checkpoint',async()=>{
  let fresh=true;
  const service=()=>({rpc:async(_name:string,args:any)=>({error:null,data:{deliveryId:delivery,runId:run,userId:owner,sourceSha:c.sourceSha,
    workerId:worker,generation:args.p_generation,freshStart:fresh,input:{prompt:'synthetic',clientMeta:{resumeRun:true,projectRoot:'src'}}}})} as unknown as SupabaseClient);
  const store=new GoogleDeliveryStore(c,env,async()=>{},service);
  const neverStarted=await store.claim(delivery,worker);assert.ok(neverStarted);
  assert.equal(requireCanonicalDeliveryClaim(neverStarted).input.clientMeta?.resumeRun,false);
  fresh=false;const previouslyStarted=await store.claim(delivery,worker);assert.ok(previouslyStarted);
  assert.equal(requireCanonicalDeliveryClaim(previouslyStarted).input.clientMeta?.resumeRun,true);
});

const builderProject='55555555-5555-4555-8555-555555555555';
test('a Builder project id travels through the claim only when it is a valid id, and is never taken from the browser body',async()=>{
  let builderId:unknown=builderProject;
  const service=()=>({rpc:async(_name:string,args:any)=>({error:null,data:{deliveryId:delivery,runId:run,userId:owner,sourceSha:c.sourceSha,
    workerId:worker,generation:args.p_generation,freshStart:true,input:{prompt:'synthetic',builderProjectId:builderId}}})} as unknown as SupabaseClient);
  const store=new GoogleDeliveryStore(c,env,async()=>{},service);
  const claim=await store.claim(delivery,worker);assert.ok(claim);
  assert.equal(requireCanonicalDeliveryClaim(claim).input.builderProjectId,builderProject);
  for(const bad of ['not-a-uuid',42,{id:builderProject},'']){builderId=bad;await assert.rejects(store.claim(delivery,worker),denied);}
  builderId=undefined;const plain=await store.claim(delivery,worker);assert.ok(plain);
  assert.equal(requireCanonicalDeliveryClaim(plain).input.builderProjectId,undefined);
});
test('enqueue refuses a malformed Builder project id before any database call',async()=>{
  const store=new GoogleDeliveryStore(c,env,async()=>{},()=>{throw new Error('NO_DATABASE_CALL_EXPECTED');});
  const context=createTenantContext({userId:owner,via:'persisted_owner'});
  for(const bad of ['../etc','not-a-uuid','',' ']){
    await assert.rejects(store.enqueue(context,run,{prompt:'synthetic',builderProjectId:bad}),denied);
  }
});

test('maintenance can rediscover an eligible delivery between four and five minutes old',async t=>{
  const now=Date.parse('2026-10-29T00:05:00.000Z');
  t.mock.method(Date,'now',()=>now);
  const rows=[{id:delivery,state:'pending',source_sha:c.sourceSha,created_at:new Date(now-270000).toISOString()},
    {id:run,state:'pending',source_sha:'c'.repeat(40),created_at:new Date(now-1000).toISOString()},
    {id:owner,state:'superseded',source_sha:c.sourceSha,created_at:new Date(now-1000).toISOString()},
    {id:worker,state:'pending',source_sha:c.sourceSha,created_at:new Date(now-301000).toISOString()}];
  const service=()=>({from:(table:string)=>{
    assert.equal(table,'google_canonical_deliveries');let found=rows.slice();
    const query={select:(columns:string)=>{assert.equal(columns,'id');return query;},
      eq:(key:string,value:string)=>{found=found.filter(row=>row[key as keyof typeof row]===value);return query;},
      gte:(key:string,value:string)=>{found=found.filter(row=>row[key as keyof typeof row]>=value);return query;},
      order:()=>query,limit:async(n:number)=>({data:found.slice(0,n).map(({id})=>({id})),error:null})};
    return query;
  }} as unknown as SupabaseClient);
  assert.deepEqual(await new GoogleDeliveryStore(c,env,async()=>{},service).pendingDeliveryIds(),[delivery]);
});
const changeId='66666666-6666-4666-8666-666666666666';
test('an existing-project change id travels through the claim only when it is a valid id',async()=>{
  let value:unknown=changeId;
  const service=()=>({rpc:async(_name:string,args:any)=>({error:null,data:{deliveryId:delivery,runId:run,userId:owner,sourceSha:c.sourceSha,
    workerId:worker,generation:args.p_generation,freshStart:true,input:{prompt:'synthetic',existingSourceChangeId:value}}})} as unknown as SupabaseClient);
  const store=new GoogleDeliveryStore(c,env,async()=>{},service);
  const claim=await store.claim(delivery,worker);assert.ok(claim);
  assert.equal(requireCanonicalDeliveryClaim(claim).input.existingSourceChangeId,changeId);
  for(const bad of ['not-a-uuid',42,{id:changeId},'']){value=bad;await assert.rejects(store.claim(delivery,worker),denied);}
  value=undefined;const plain=await store.claim(delivery,worker);assert.ok(plain);
  assert.equal(requireCanonicalDeliveryClaim(plain).input.existingSourceChangeId,undefined);
});
test('enqueue refuses a malformed existing-project change id before any database call',async()=>{
  const store=new GoogleDeliveryStore(c,env,async()=>{},()=>{throw new Error('NO_DATABASE_CALL_EXPECTED');});
  const context=createTenantContext({userId:owner,via:'persisted_owner'});
  for(const bad of ['../etc','not-a-uuid','',' ']){
    await assert.rejects(store.enqueue(context,run,{prompt:'synthetic',existingSourceChangeId:bad}),denied);
  }
});
