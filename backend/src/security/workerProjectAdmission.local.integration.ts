import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {captureAdmittedRunAttempt,createRunDurable,getRunAsync,requestRunCancellation,resumeRunDurable,withRunAttempt} from '../ai/runStore.js';
import {createCanonicalExecutionState,SupabaseExecutionStateStore} from '../ai/executionRuntime.js';
import {SupabaseSoftwareAgentCheckpointStore,type SoftwareAgentCheckpoint} from '../ai/softwareAgent/softwareAgentCheckpoint.js';
import {createAgentEvidence} from '../ai/softwareAgent/createAgentEvidence.js';
import {SupabaseProjectRuntimeStore} from '../synthesis/projectRuntime/store.js';
import type {SoftwareProject} from '../synthesis/softwareProject.js';

export function registerWorkerProjectAdmissionTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;token:string}[]):void{
  test('real worker admission preserves database project lineage through create resume checkpoints and contended ownership changes',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const [owner,other]=getUsers(),project=randomUUID(),run=randomUUID(),extraRuns:string[]=[];
    t.after(async()=>{
      for(const table of ['project_runtime_revisions','software_agent_checkpoints','execution_runs'])assert.equal((await admin.from(table).delete().in('run_id',[run,...extraRuns])).error,null);
      assert.equal((await admin.from('swarm_runs').delete().in('id',[run,...extraRuns])).error,null);
      assert.equal((await admin.from('projects').delete().eq('id',project)).error,null);
    });
    assert.equal((await admin.from('projects').insert({id:project,user_id:owner.id,name:'Worker admission fixture',type:'app'})).error,null);
    const attempt=await withRunAttempt(async()=>{const record=await createRunDurable(owner.id,'Synthetic project worker',run,project);assert.equal(record.databaseProjectId,project);return captureAdmittedRunAttempt(run,owner.id);});
    assert.equal((await getRunAsync(run,owner.id,true))?.databaseProjectId,project);assert.equal(await getRunAsync(run,other.id,true),null);
    const state=createCanonicalExecutionState({runId:run,projectId:project,databaseProjectId:project});
    const execution=new SupabaseExecutionStateStore(owner.id,attempt);await execution.save(state);
    const checkpoint:SoftwareAgentCheckpoint={schemaVersion:'1.0.0',runId:run,projectId:project,repository:null,baseFingerprint:'fixture-base',changes:[],evidence:createAgentEvidence(),status:'active',blockers:[],failureCode:null,updatedAt:new Date().toISOString()};
    const software=new SupabaseSoftwareAgentCheckpointStore(owner.id,attempt);await software.save(checkpoint);
    const runtime=new SupabaseProjectRuntimeStore(attempt);
    await runtime.saveRevision(owner.id,{projectId:project,runId:run,contract:{projectId:project,runId:run},workspace:{files:[]}} as unknown as SoftwareProject);
    for(const token of [undefined,owner.token,other.token]){
      const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{autoRefreshToken:false,persistSession:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
      const shared={p_run_id:run,p_owner_id:owner.id,p_worker_id:attempt.workerId,p_generation:attempt.generation};
      assert.equal((await browser.rpc('persist_execution_checkpoint_attempt',{...shared,p_state:state,p_status:'completed'})).error?.code,'42501');
      assert.equal((await browser.rpc('persist_software_checkpoint_attempt',{...shared,p_checkpoint:checkpoint})).error?.code,'42501');
    }
    const snapshots=async()=>{
      const result:unknown[][]=[];for(const [table,key]of [['swarm_runs','id'],['execution_runs','run_id'],['software_agent_checkpoints','run_id'],['project_runtime_revisions','run_id']]){
        const read=await admin.from(table).select('*').eq(key,run);assert.equal(read.error,null);assert.ok(read.data);result.push(read.data);
      }return result;
    };
    const before=await snapshots();assert.ok(before.every(rows=>rows?.length===1));
    assert.equal((await admin.from('projects').update({user_id:other.id}).eq('id',project)).error,null);
    assert.equal((await admin.from('swarm_runs').update({user_id:other.id}).eq('id',run)).error?.code,'42501');
    await assert.rejects(execution.save({...state,blockers:['denied']}),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    await assert.rejects(software.save({...checkpoint,blockers:['denied']}),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    await assert.rejects(runtime.saveRevision(owner.id,{projectId:project,runId:run,contract:{projectId:project,runId:run},workspace:{files:[]}} as unknown as SoftwareProject),{code:'RESOURCE_ACCESS_UNAVAILABLE'});
    assert.deepEqual(await snapshots(),before,'Lost project authority cannot change any worker receipt');
    assert.equal(await requestRunCancellation(run,owner.id),true,'A lost parent must not prevent stopping the existing owner run');
    await assert.rejects(withRunAttempt(()=>resumeRunDurable(owner.id,'Denied resume',run,project)),{status:404});
    assert.equal((await getRunAsync(run,owner.id,true))?.status,'cancelled');
    assert.equal((await admin.from('projects').update({user_id:owner.id}).eq('id',project)).error,null);
    await withRunAttempt(async()=>{await resumeRunDurable(owner.id,'Allowed resume',run,project);const current=captureAdmittedRunAttempt(run,owner.id);assert.notEqual(current.generation,attempt.generation);await new SupabaseExecutionStateStore(owner.id,current).save(state);});
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const locker=new pg.Client({connectionString:url.href,ssl:false}),writer=new pg.Client({connectionString:url.href,ssl:false});await locker.connect();await writer.connect();let pending:Promise<pg.QueryResult>|undefined;
    try{
      await writer.query('set statement_timeout=10000');await writer.query('set role service_role');
      const pid=(await writer.query('select pg_backend_pid() as pid')).rows[0].pid,lockPid=(await locker.query('select pg_backend_pid() as pid')).rows[0].pid;
      for(const mode of ['create','resume','execution','software','revision']){
        assert.equal((await admin.from('projects').update({user_id:owner.id}).eq('id',project)).error,null);
        let target=run;
        if(mode==='create'||mode==='resume'){
          target=randomUUID();extraRuns.push(target);
          if(mode==='resume')assert.equal((await admin.from('swarm_runs').insert({id:target,user_id:owner.id,project_id:project,prompt:'Retained cancellation',status:'cancelled'})).error,null);
        }
        const receipts=await snapshots();await locker.query('begin');await locker.query('select id from projects where id=$1 for update',[project]);
        if(mode==='create')pending=writer.query("insert into swarm_runs(id,user_id,project_id,prompt,status) values($1,$2,$3,'Denied admission','running')",[target,owner.id,project]);
        else if(mode==='resume')pending=writer.query("update swarm_runs set status='running',worker_id='fixture',lease_generation=$2 where id=$1",[target,randomUUID()]);
        else {const table=mode==='execution'?'execution_runs':mode==='software'?'software_agent_checkpoints':'project_runtime_revisions';pending=writer.query(`update ${table} set user_id=user_id where run_id=$1`,[run]);}
        void pending.catch(()=>{});let observed=false;
        for(let count=0;count<100;count++){if((await locker.query('select pg_blocking_pids($1) as blockers',[pid])).rows[0].blockers.includes(lockPid)){observed=true;break;}await delay(20);}
        assert.equal(observed,true,`Observe actual ${mode} project lock wait`);
        await locker.query('update projects set user_id=$2 where id=$1',[project,other.id]);await locker.query('commit');await assert.rejects(pending,{code:'42501'});pending=undefined;
        assert.deepEqual(await snapshots(),receipts);
        if(mode==='create'){const absent=await admin.from('swarm_runs').select('id').eq('id',target);assert.equal(absent.error,null);assert.deepEqual(absent.data,[]);}
        if(mode==='resume'){const retained=await admin.from('swarm_runs').select('status,worker_id,lease_generation').eq('id',target).single();assert.equal(retained.error,null);assert.deepEqual(retained.data,{status:'cancelled',worker_id:null,lease_generation:null});}
      }
      assert.equal((await admin.from('projects').update({user_id:owner.id}).eq('id',project)).error,null);
      const receipt=await snapshots();await writer.query('begin');await writer.query("update swarm_runs set status='error',worker_id=null,lease_generation=null,output='{\"type\":\"error\"}' where id=$1",[run]);await writer.query('rollback');assert.deepEqual(await snapshots(),receipt);
      // Preserve the original FK deletion behavior, without clearing a binding
      // while its project still exists or silently moving a run to another one.
      assert.equal((await admin.from('swarm_runs').update({project_id:null}).eq('id',run)).error?.code,'42501');
    }finally{await locker.query('rollback');await writer.query('rollback');if(pending)await pending.catch(()=>{});await writer.end();await locker.end();}
  });
}
