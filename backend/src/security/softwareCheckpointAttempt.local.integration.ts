import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { captureAdmittedRunAttempt,createRunDurable,withRunAttempt } from '../ai/runStore.js';
import { createAgentEvidence } from '../ai/softwareAgent/createAgentEvidence.js';
import { SupabaseSoftwareAgentCheckpointStore, type SoftwareAgentCheckpoint } from '../ai/softwareAgent/softwareAgentCheckpoint.js';

export function registerSoftwareCheckpointAttemptTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
  async function fixture(t:TestContext){
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const [owner,other]=getUsers(),runId=randomUUID();
    t.after(async()=>{assert.equal((await admin.from('software_agent_checkpoints').delete().eq('run_id',runId).in('user_id',[owner.id,other.id])).error,null);assert.equal((await admin.from('swarm_runs').delete().eq('id',runId).eq('user_id',owner.id)).error,null);});
    const checkpoint:SoftwareAgentCheckpoint={schemaVersion:'1.0.0',runId,projectId:'fixture',repository:null,baseFingerprint:'fixture-base',changes:[],evidence:createAgentEvidence(),status:'active',blockers:[],failureCode:null,updatedAt:new Date().toISOString()};
    const attempt=await withRunAttempt(async()=>{await createRunDurable(owner.id,'Synthetic software checkpoint',runId);const captured=captureAdmittedRunAttempt(runId,owner.id);await new SupabaseSoftwareAgentCheckpointStore(owner.id,captured).save(checkpoint);return captured;});
    const args={p_run_id:runId,p_owner_id:owner.id,p_worker_id:attempt.workerId,p_generation:attempt.generation,p_checkpoint:checkpoint};
    const saved=await admin.from('software_agent_checkpoints').select('*').eq('run_id',runId).eq('user_id',owner.id).single();assert.equal(saved.error,null);
    return{owner,other,runId,args,saved:saved.data};
  }
  test('real software checkpoint writer binds issued attempt owner epoch and immutable recovery lineage',async t=>{
    const f=await fixture(t);
    for(const patch of [{p_owner_id:f.other.id},{p_generation:null},{p_generation:randomUUID()},{p_worker_id:'other'},
      {p_checkpoint:{...f.args.p_checkpoint,runId:randomUUID()}},{p_checkpoint:{...f.args.p_checkpoint,projectId:'other'}},
      {p_checkpoint:{...f.args.p_checkpoint,repository:{owner:'o',repo:'r',branch:'main'}}},{p_checkpoint:{...f.args.p_checkpoint,baseFingerprint:'other'}}]){
      const denied=await admin.rpc('persist_software_checkpoint_attempt',{...f.args,...patch});assert.equal(denied.error,null);assert.equal(denied.data,false);
    }
    const read=()=>admin.from('software_agent_checkpoints').select('*').eq('run_id',f.runId).eq('user_id',f.owner.id).single();
    assert.deepEqual((await read()).data,f.saved);
    const accepted=await admin.rpc('persist_software_checkpoint_attempt',{...f.args,p_checkpoint:{...f.args.p_checkpoint,blockers:['fresh evidence']}});assert.equal(accepted.error,null);assert.equal(accepted.data,true);
    for(const token of [null,f.owner.token]){
      const client=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{}),auth:{persistSession:false,autoRefreshToken:false}});
      assert.ok((await client.rpc('persist_software_checkpoint_attempt',f.args)).error);
    }
    const loader=new SupabaseSoftwareAgentCheckpointStore(f.owner.id);
    assert.equal((await loader.load(f.runId))?.runId,f.runId);
    assert.equal(await new SupabaseSoftwareAgentCheckpointStore(f.other.id).load(f.runId),null);
    for(const patch of [{runId:randomUUID()},{projectId:'foreign'},{baseFingerprint:'foreign'},{repository:{owner:'o',repo:'r',branch:'other'}},{status:'verified'}]){
      assert.equal((await admin.from('software_agent_checkpoints').update({checkpoint:{...f.args.p_checkpoint,...patch}}).eq('run_id',f.runId).eq('user_id',f.owner.id)).error,null);
      assert.equal(await loader.load(f.runId),null,'loader must reject corrupt embedded identity even within owner-scoped row');
    }
    assert.equal((await admin.from('software_agent_checkpoints').update({checkpoint:f.args.p_checkpoint}).eq('run_id',f.runId).eq('user_id',f.owner.id)).error,null);
    assert.deepEqual(await loader.load(f.runId),f.args.p_checkpoint);
  });
  for(const cancel of [false,true])test(`real software checkpoint stale writer waits for parent then loses to ${cancel?'cancellation':'resume'}`,async t=>{
    const f=await fixture(t),url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const locker=new pg.Client({connectionString:url.href,ssl:false}),writer=new pg.Client({connectionString:url.href,ssl:false});await locker.connect();await writer.connect();let pending:Promise<pg.QueryResult>|undefined;
    try{
      await writer.query('set statement_timeout=10000');const writerPid=(await writer.query('select pg_backend_pid() as pid')).rows[0].pid,lockerPid=(await locker.query('select pg_backend_pid() as pid')).rows[0].pid;
      await writer.query('set role service_role');await locker.query('begin');await locker.query('select id from public.swarm_runs where id=$1 and user_id=$2 for update',[f.runId,f.owner.id]);
      pending=writer.query('select public.persist_software_checkpoint_attempt($1,$2,$3,$4,$5) as ok',[f.runId,f.owner.id,f.args.p_worker_id,f.args.p_generation,JSON.stringify({...f.args.p_checkpoint,blockers:['STALE_CANARY']})]);void pending.catch(()=>{});
      let blocked=false;for(let n=0;n<100;n++){const observed=await locker.query('select pg_blocking_pids($1) as blockers',[writerPid]);if(observed.rows[0].blockers.includes(lockerPid)){blocked=true;break;}await delay(20);}assert.equal(blocked,true);
      if(cancel)await locker.query('select public.cancel_swarm_run_owned($1,$2)',[f.runId,f.owner.id]);else await locker.query("update public.swarm_runs set lease_generation=$3,worker_id='new-worker' where id=$1 and user_id=$2",[f.runId,f.owner.id,randomUUID()]);
      await locker.query('commit');assert.equal((await pending).rows[0].ok,false);
      const retained=await admin.from('software_agent_checkpoints').select('*').eq('run_id',f.runId).eq('user_id',f.owner.id).single();assert.equal(retained.error,null);assert.deepEqual(retained.data,f.saved);
    }finally{await locker.query('rollback');if(pending)await pending.catch(()=>{});await writer.end();await locker.end();}
  });
}
