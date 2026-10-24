import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {test} from 'node:test';
import {RunTrace} from './runTrace.js';
import {captureAdmittedRunAttempt,createRunDurable,withRunAttempt} from './runStore.js';

test('trace persistence requires issued bound attempt, snapshots diagnostics and never falls back after rejection',async t=>{
  const prior=[process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY],originalFetch=globalThis.fetch;
  process.env.SUPABASE_URL='http://127.0.0.1:49230';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  const owner=randomUUID(),runId=randomUUID(),trace=new RunTrace(runId,owner),logs:unknown[][]=[];
  t.mock.method(console,'warn',(...args:unknown[])=>{logs.push(args);});
  const writes:any[]=[];let release:(()=>void)|undefined,accepted=true;
  globalThis.fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname;
    if(path==='/rest/v1/swarm_runs'&&init?.method==='POST')return new Response(null,{status:201});
    assert.equal(path,'/rest/v1/rpc/persist_run_trace_attempt');writes.push(JSON.parse(String(init?.body)));
    if(!release)await new Promise<void>(resolve=>{release=resolve;});return Response.json(accepted);
  };
  try{
    await trace.persist();assert.equal(writes.length,0);
    assert.throws(()=>trace.bindAttempt({runId,userId:owner,workerId:'fake',generation:randomUUID()}),{code:'RUN_STATE_CONFLICT'});
    const attempt=await withRunAttempt(async()=>{await createRunDurable(owner,'Synthetic trace',runId);return captureAdmittedRunAttempt(runId,owner);});
    assert.throws(()=>trace.bindAttempt(structuredClone(attempt)),{code:'RUN_STATE_CONFLICT'});
    trace.bindAttempt(attempt);assert.throws(()=>trace.bindAttempt(attempt),{code:'RUN_STATE_CONFLICT'});
    trace.add('worker','complete','token=SECRET_TOKEN_CANARY');trace.setMeta({password:'SECRET_PASSWORD_CANARY',safe:{message:'Bearer PRIVATE_TOKEN',count:1}});
    const pending=trace.persist();while(!release)await new Promise(resolve=>setImmediate(resolve));
    trace.stages.push({agent:'late',status:'late',at:new Date().toISOString()});trace.meta.safe='late';
    release();await pending;assert.equal(writes[0].p_generation,attempt.generation);assert.equal(writes[0].p_owner_id,owner);assert.equal(writes[0].p_stages.length,1);
    assert.equal(writes[0].p_meta.safe.count,1);assert.ok(!JSON.stringify(writes[0]).includes('SECRET_'));assert.ok(!JSON.stringify(writes[0]).includes('PRIVATE_TOKEN'));
    accepted=false;await trace.persist();assert.equal(writes.length,2);assert.ok(logs.every(args=>args.length===1&&args[0]==='[runTrace] diagnostic persistence unavailable'));
    const summary=trace.summary();summary.stages.length=0;assert.equal(trace.stages.length,2);
  }finally{release?.();globalThis.fetch=originalFetch;['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].forEach((key,index)=>{if(prior[index]===undefined)delete process.env[key];else process.env[key]=prior[index];});}
});
