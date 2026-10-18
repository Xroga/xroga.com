import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';
import { actionPlanDigest } from './operationsEngine.js';
import { httpVerificationAdapter, type ProviderAdapterRegistry } from './providerAdapters.js';

export function registerVerificationTargetTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;project:string}[]):void{
  test('real HTTP target changes during the claim wait cannot reach a provider adapter',async t=>{
    assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');
    assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
    const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
    const [owner,other]=getUsers(),resourceId=randomUUID(),ids:string[]=[],service=new OperationsService(admin);let effects=0;
    (service as unknown as {registry:ProviderAdapterRegistry}).registry.register({...httpVerificationAdapter,async execute(){
      effects++;return {status:'unsupported',safeSummary:'Fixture must never contact a provider'};
    }});
    t.after(async()=>{
      if(ids.length)assert.equal((await admin.from('operations_actions').delete().in('id',ids)).error,null);
      assert.equal((await admin.from('operations_resources').delete().eq('id',resourceId)).error,null);
    });
    assert.equal((await admin.from('operations_resources').insert({id:resourceId,user_id:owner.id,project_id:owner.project,
      kind:'service',provider:'fixture',name:'Disposable target',source:'fixture',version:1,observed_state:{url:'https://fixture.invalid'}})).error,null);
    const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let pending:Promise<any>|undefined;
    try{
      for(const mutation of [{version:2},{user_id:other.id,project_id:other.project}]){
        const request={actionType:'refresh_health',projectId:owner.project,targetType:'service',targetId:resourceId,targetVersion:1,idempotencyKey:randomUUID(),confirmed:false};
        const action=await admin.from('operations_actions').insert({user_id:owner.id,project_id:owner.project,requested_by:owner.id,
          action_type:request.actionType,target_type:request.targetType,target_id:resourceId,target_version:1,permission_required:'view_health',
          risk_level:'read_only',status:'queued',idempotency_key:request.idempotencyKey,action_plan_digest:actionPlanDigest(request),
          execution_plan:{},max_attempts:2}).select('id').single();
        assert.equal(action.error,null);ids.push(action.data.id);
        await db.query('begin');await db.query('select id from profiles where id=$1 for update',[owner.id]);
        pending=service.executeAction(owner.id,action.data.id);void pending.catch(()=>{});let waiting=false;
        for(let i=0;i<150;i++){
          await db.query('select pg_stat_clear_snapshot()');
          const result=await db.query("select pid from pg_stat_activity where pid<>pg_backend_pid() and wait_event_type='Lock' and query like '%claim_operations_action_admitted%'");
          if(result.rowCount){waiting=true;break;}await delay(20);
        }
        assert.equal(waiting,true,'actual execution claim reached the held profile lock after target preflight');
        await db.query('update operations_resources set version=$2,user_id=$3,project_id=$4 where id=$1',
          [resourceId,mutation.version??1,mutation.user_id??owner.id,mutation.project_id??owner.project]);await db.query('commit');
        const result=await pending;pending=undefined;assert.equal(result.status,'blocked');assert.equal(result.attempt_count,1);assert.equal(effects,0);
        const runs=await admin.from('operations_action_runs').select('status,error_category').eq('action_id',action.data.id);
        assert.equal(runs.error,null);assert.deepEqual(runs.data,[{status:'blocked',error_category:mutation.version?'invalid_state':'not_found'}]);
        const evidence=await admin.from('production_evidence').select('status').eq('action_id',action.data.id);
        assert.equal(evidence.error,null);assert.deepEqual(evidence.data,[{status:'blocked'}]);
        assert.equal((await admin.from('operations_resources').update({version:1,user_id:owner.id,project_id:owner.project}).eq('id',resourceId)).error,null);
      }
    }finally{await db.query('rollback');if(pending)await Promise.allSettled([pending]);await db.end();}
  });
}
