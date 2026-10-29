import assert from 'node:assert/strict';
import test from 'node:test';
import type {SupabaseClient} from '@supabase/supabase-js';
import {GoogleDeliveryStore,requireCanonicalDeliveryClaim} from './googleDeliveryStore.js';
import {GoogleDispatchError,type GoogleDispatchConfiguration} from './googleDispatch.js';
import {createTenantContext} from '../security/tenantContext.js';
import {fakeTable} from './__tests__/postgrestFilter.js';
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

test('maintenance rediscovers every delivery that is still within its queue wait and can still be launched',async t=>{
  const now=Date.parse('2026-10-29T00:00:00.000Z');
  t.mock.method(Date,'now',()=>now);
  const ago=(ms:number)=>new Date(now-ms).toISOString();
  const row=(id:string,extra:Record<string,unknown>)=>({id,state:'pending',source_sha:c.sourceSha,created_at:ago(60000),launch_attempts:0,launch_lease_until:null,...extra});
  const ids={fresh:'00000000-0000-4000-8000-000000000001',waited:'00000000-0000-4000-8000-000000000002',expiredLaunch:'00000000-0000-4000-8000-000000000003',
    activeLaunch:'00000000-0000-4000-8000-000000000004',tooOld:'00000000-0000-4000-8000-000000000005',exhausted:'00000000-0000-4000-8000-000000000006',
    otherSource:'00000000-0000-4000-8000-000000000007',superseded:'00000000-0000-4000-8000-000000000008',running:'00000000-0000-4000-8000-000000000009'};
  const rows=[
    row(ids.waited,{created_at:ago(30*60000)}),                                   // waited 30 minutes for capacity, still bounded
    row(ids.fresh,{created_at:ago(60000)}),
    row(ids.expiredLaunch,{state:'launching',created_at:ago(20*60000),launch_attempts:1,launch_lease_until:ago(1000)}), // unknown outcome, lease over
    row(ids.activeLaunch,{state:'launching',launch_attempts:1,launch_lease_until:new Date(now+120000).toISOString()}),   // another dispatcher owns it
    row(ids.tooOld,{created_at:ago(61*60000)}),                                   // past the queue wait: the reconciler ends the run
    row(ids.exhausted,{launch_attempts:5}),                                        // the database's absolute attempt ceiling
    row(ids.otherSource,{source_sha:'c'.repeat(40)}),
    row(ids.superseded,{state:'superseded'}),
    row(ids.running,{state:'running'}),
  ];
  const service=()=>({from:(table:string)=>{assert.equal(table,'google_canonical_deliveries');return fakeTable(rows);}} as unknown as SupabaseClient);
  const found=await new GoogleDeliveryStore(c,env,async()=>{},service).pendingDeliveryIds();
  assert.deepEqual(found,[ids.waited,ids.expiredLaunch,ids.fresh]);
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
