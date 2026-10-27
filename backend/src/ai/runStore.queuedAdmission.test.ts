import assert from 'node:assert/strict';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {GoogleDeliveryStore} from '../workers/googleDeliveryStore.js';
import type {GoogleDispatchConfiguration} from '../workers/googleDispatch.js';
import {adoptQueuedRunDurable,withRunAttempt,currentRunWorkerId,captureCurrentRunAttempt,assertCurrentRunAttempt,activeRunIds} from './runStore.js';
const project='project-c40d4821-e647-4fa2-92d';
const c:GoogleDispatchConfiguration={project,region:'us-east4',queue:'xroga-canonical-queue',job:'xroga-canonical-worker',
  dispatcherUrl:'https://xroga-dispatcher-fixture.us-east4.run.app/internal/canonical-dispatch',
  dispatchAccount:`xroga-task-invoker@${project}.iam.gserviceaccount.com`,
  runtimeAccount:`xroga-api-runtime@${project}.iam.gserviceaccount.com`,
  image:`us-east4-docker.pkg.dev/${project}/cloud-run-source-deploy/xroga-api-migration@sha256:${'a'.repeat(64)}`,sourceSha:'b'.repeat(40),kmsKeyName:`projects/${project}/locations/us-central1/keyRings/synthetic/cryptoKeys/custody`};
test('queued handoff requires the original native claim, current owner and generation, and drops a denied local lease',async()=>{
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NODE_ENV'];const prior=keys.map(k=>process.env[k]);const fetchBefore=globalThis.fetch;
  let row:Record<string,unknown>={};let reads=0;
  process.env.SUPABASE_URL='http://127.0.0.1:49323';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';process.env.NODE_ENV='production';
  globalThis.fetch=async(input)=>{const url=new URL(String(input));assert.equal(url.pathname,'/rest/v1/swarm_runs');reads++;
    assert.equal(url.searchParams.get('user_id'),'eq.'+row.user_id);assert.equal(url.searchParams.get('id'),'eq.'+row.id);return Response.json(row);};
  const owner=randomUUID();
  const service=()=>({rpc:async(_name:string,args:any)=>{row={id:randomUUID(),user_id:owner,prompt:'synthetic',status:'running',
    worker_id:args.p_worker,lease_generation:args.p_generation,created_at:new Date().toISOString(),completed_at:null,events:[],last_sequence:0,iteration_count:0};
    return{error:null,data:{deliveryId:args.p_delivery,runId:row.id,userId:owner,sourceSha:c.sourceSha,
      workerId:args.p_worker,generation:args.p_generation,freshStart:false,input:{prompt:'synthetic'}}};}} as unknown as SupabaseClient);
  const store=new GoogleDeliveryStore(c,{CLOUD_RUN_JOB:c.job,CLOUD_RUN_EXECUTION:c.job+'-fixture',XROGA_RELEASE_SHA:c.sourceSha},async()=>{},service);
  try{
    await withRunAttempt(async()=>{
      const claim=await store.claim(randomUUID(),currentRunWorkerId());assert.ok(claim);
      await assert.rejects(adoptQueuedRunDurable({...claim}));assert.equal(reads,0);
      await adoptQueuedRunDurable(claim);const authority=captureCurrentRunAttempt();await assertCurrentRunAttempt(authority);
      row.status='cancelled';await assert.rejects(assertCurrentRunAttempt(authority));
    });
    await withRunAttempt(async()=>{
      const claim=await store.claim(randomUUID(),currentRunWorkerId());assert.ok(claim);row.worker_id='foreign-current-worker';
      await assert.rejects(adoptQueuedRunDurable(claim));
      assert.equal(activeRunIds().includes(claim.runId),false);
      assert.throws(()=>captureCurrentRunAttempt());
    });
  }finally{globalThis.fetch=fetchBefore;keys.forEach((key,i)=>{if(prior[i]===undefined)delete process.env[key];else process.env[key]=prior[i];});}
});
