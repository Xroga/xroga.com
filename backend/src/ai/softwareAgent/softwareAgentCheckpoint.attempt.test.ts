import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Agent } from '@cline/sdk';
import { captureAdmittedRunAttempt, createRunDurable, withRunAttempt } from '../runStore.js';
import { createAgentEvidence } from './createAgentEvidence.js';
import { SupabaseSoftwareAgentCheckpointStore, type SoftwareAgentCheckpoint } from './softwareAgentCheckpoint.js';
import { SoftwareAgentService } from './SoftwareAgentService.js';
import { AgentSoftwareExecutor } from './AgentSoftwareExecutor.js';
import type { SoftwareExecutionContract } from './contracts.js';

test('software checkpoint requires issued authority, immutable ordered snapshots and exact receipt',async()=>{
  const userId=randomUUID(),runId=randomUUID(),prior=[process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY],originalFetch=globalThis.fetch;
  const checkpoint:SoftwareAgentCheckpoint={schemaVersion:'1.0.0',runId,projectId:null,repository:null,baseFingerprint:'fixture',changes:[],evidence:createAgentEvidence(),status:'active',blockers:[],failureCode:null,updatedAt:new Date().toISOString()};
  await assert.rejects(new SupabaseSoftwareAgentCheckpointStore(userId).save(checkpoint),{code:'RUN_STATE_CONFLICT'});
  assert.throws(()=>new SupabaseSoftwareAgentCheckpointStore(userId,{runId,userId,workerId:'fake',generation:randomUUID()}),{code:'RUN_STATE_CONFLICT'});
  process.env.SUPABASE_URL='http://127.0.0.1:49226';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-only';
  const writes:any[]=[];let release:(()=>void)|undefined,accepted=true,unavailable=false;
  globalThis.fetch=async(input,init)=>{
    const path=new URL(String(input)).pathname;
    if(path==='/rest/v1/swarm_runs'&&init?.method==='POST')return new Response(null,{status:201});
    assert.equal(path,'/rest/v1/rpc/persist_software_checkpoint_attempt');writes.push(JSON.parse(String(init?.body)));
    if(writes.length===1)await new Promise<void>(resolve=>{release=resolve;});
    return unavailable ? Response.json({message:'Synthetic outage'},{status:503}) : Response.json(accepted);
  };
  try{
    const attempt=await withRunAttempt(async()=>{await createRunDurable(userId,'Synthetic software checkpoint',runId);return captureAdmittedRunAttempt(runId,userId);});
    assert.throws(()=>new SupabaseSoftwareAgentCheckpointStore(userId,structuredClone(attempt)),{code:'RUN_STATE_CONFLICT'});
    const store=new SupabaseSoftwareAgentCheckpointStore(userId,attempt);
    await assert.rejects(store.save({...checkpoint,runId:randomUUID()}),{code:'RUN_STATE_CONFLICT'});
    const first=store.save(checkpoint);checkpoint.blockers.push('new');const second=store.save(checkpoint);
    while(!release)await new Promise(resolve=>setImmediate(resolve));assert.equal(writes.length,1);assert.deepEqual(writes[0].p_checkpoint.blockers,[]);
    release();await Promise.all([first,second]);assert.deepEqual(writes[1].p_checkpoint.blockers,['new']);assert.equal(writes[0].p_generation,attempt.generation);
    accepted=false;await assert.rejects(store.save(checkpoint),{code:'RUN_STATE_CONFLICT'});
    const count=writes.length;accepted=true;await assert.rejects(store.save(checkpoint),{code:'RUN_STATE_CONFLICT'});assert.equal(writes.length,count);
    unavailable=true;
    await assert.rejects(new SupabaseSoftwareAgentCheckpointStore(userId,attempt).save(checkpoint),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
  }finally{release?.();globalThis.fetch=originalFetch;['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].forEach((key,index)=>{if(prior[index]===undefined)delete process.env[key];else process.env[key]=prior[index];});}
});

for (const code of ['RUN_STATE_CONFLICT','RESOURCE_ACCESS_UNAVAILABLE']) test(`${code} initial checkpoint stops actual service before executor or providers`,async t=>{
  const contract:SoftwareExecutionContract={runId:randomUUID(),projectId:'fixture',taskKind:'web_app',goal:'Synthetic test',
    writePolicy:{allowedPaths:[],deniedPaths:[],allowCreate:true,allowDelete:false,allowRename:false},preview:'not_applicable',verificationAuthority:'agent',persistence:'none',deployment:'forbidden',acceptanceCriteria:[],constraints:[]};
  let calls=0;
  const forbidden=async()=>{calls++;throw new Error('Unexpected provider operation');};
  const executor=new AgentSoftwareExecutor();t.mock.method(executor,'execute',forbidden);
  await assert.rejects(new SoftwareAgentService(executor).execute({contract,model:{routeId:'synthetic'},events:{emit:async()=>{}},initialFiles:[],
    bindings:{userId:randomUUID(),runSandboxCommand:forbidden,runProjectChecks:forbidden,verifyProjectPreview:forbidden,createReviewBranch:forbidden},
    checkpointStore:{load:async()=>null,save:async()=>{throw Object.assign(new Error('Checkpoint unavailable'),{code});}}}),{code});
  assert.equal(calls,0);
});

for (const code of ['RUN_STATE_CONFLICT','RESOURCE_ACCESS_UNAVAILABLE']) test(`actual executor aborts on ${code} caught by tool without publishing its event`,async t=>{
  const contract:SoftwareExecutionContract={runId:randomUUID(),projectId:'fixture',taskKind:'cli',goal:'Synthetic test',
    writePolicy:{allowedPaths:['**'],deniedPaths:[],allowCreate:true,allowDelete:false,allowRename:false},preview:'not_applicable',verificationAuthority:'universal',persistence:'none',deployment:'forbidden',acceptanceCriteria:[],constraints:[]};
  let saves=0,aborts=0,providerCalls=0;const events:string[]=[];
  const forbidden=async()=>{providerCalls++;throw new Error('Unexpected provider operation');};
  t.mock.method(Agent.prototype,'abort',()=>{aborts++;});
  t.mock.method(Agent.prototype,'run',async function(this:Agent){
    // Inspected pinned SDK exposes the registered tools on its constructor config.
    const tools=(this as unknown as {config:{tools:Array<{name:string;execute:(input:unknown)=>Promise<unknown>}>}}).config.tools;
    const tool=tools.find(item=>item.name==='project_write_file');assert.ok(tool);
    const result=await tool.execute({path:'file.txt',content:'synthetic',intent:'create'});
    assert.equal((result as {ok:boolean}).ok,false,'real tool catches callback exception, executor must retain fatal authority latch');
    return {status:'completed',outputText:'not authoritative',iterations:1};
  });
  await assert.rejects(new SoftwareAgentService().execute({contract,model:{routeId:'synthetic',model:{} as never},events:{emit:async event=>{events.push(event.type);}},initialFiles:[],
    bindings:{userId:randomUUID(),runSandboxCommand:forbidden,runProjectChecks:forbidden,verifyProjectPreview:forbidden,createReviewBranch:forbidden},
    checkpointStore:{load:async()=>null,save:async()=>{saves++;if(saves>1)throw Object.assign(new Error('Checkpoint unavailable'),{code});}}}),{code});
  assert.equal(saves,2);assert.equal(aborts,1);assert.equal(providerCalls,0);assert.ok(!events.includes('file.created'));
});

test('executor source preserves authority failure through SDK abort and outward event boundary',()=>{
  const source=readFileSync(new URL('./AgentSoftwareExecutor.ts',import.meta.url),'utf8');
  assert.match(source,/await checkpointSafely\(\);[\s\S]*?await events\.emit/);
  assert.match(source,/checkpointAuthorityFailure = error;\s*abortForCheckpointFailure\?\.\(\);\s*throw error/);
  assert.ok(source.split('if (checkpointAuthorityFailure) throw checkpointAuthorityFailure;').length>=5);
});
