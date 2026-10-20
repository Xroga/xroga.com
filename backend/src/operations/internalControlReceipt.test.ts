import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

test('single-rule controls reject empty, substituted and duplicate mutation receipts', async () => {
  let rows: Record<string,unknown>[]=[];
  let completion: Record<string,unknown>|null=null;
  let args:Record<string,unknown>={};
  const db={async rpc(name:string,input:Record<string,unknown>){
    assert.equal(name,'mutate_operations_internal_target');args=input;return {data:{rows,completion},error:null};
  }};
  const service=new OperationsService(db as unknown as SupabaseClient) as unknown as {
    executeInternal(capability:string,input:Record<string,unknown>):Promise<{status:string}>;
  };
  for(const capability of ['emergency_stop','resume_automation']){
    const action={id:'action',attempt_count:1,action_type:capability,user_id:'owner',project_id:'project',target_id:'rule',target_version:5,status:'running',lease_owner:'api:actor',lease_expires_at:new Date(Date.now()+60_000).toISOString()};
    const input={userId:'owner',actorId:'actor',projectId:'project',targetId:'rule',targetVersion:5,admittedAction:action,evidenceId:'ev_00000000-0000-4000-8000-000000000001'};
    completion=null;
    rows=[];assert.equal((await service.executeInternal(capability,input)).status,'blocked');
    assert.deepEqual(args,{p_capability:capability,p_actor:'actor',p_expected:action,p_evidence_id:input.evidenceId,p_allowed_roles:['operator','release_manager','recovery_manager','admin'],p_approval_role:capability==='resume_automation'?'recovery_manager':null,p_confirmation_required:true});
    const valid={id:'rule',user_id:'owner',project_id:'project',emergency_stopped:capability==='emergency_stop',version:6};
    for(rows of [[{...valid,id:'other'}],[valid,valid],[{...valid,user_id:'foreign'}],[{...valid,project_id:'foreign'}],[{...valid,version:5}],[{...valid,emergency_stopped:capability!=='emergency_stop'}]])await assert.rejects(service.executeInternal(capability,input),{code:'unknown',statusCode:503});
    rows=[valid];await assert.rejects(service.executeInternal(capability,input),{code:'unknown',statusCode:503});
    completion={...action,status:'verified',evidence_reference:input.evidenceId,lease_owner:null,lease_expires_at:null};
    assert.equal((await service.executeInternal(capability,input)).status,'verified');
    const original=completion;
    for(const patch of [{id:'other'},{attempt_count:2},{evidence_reference:'other'},{status:'failed'},{user_id:'foreign'},{project_id:'foreign'},{target_id:'other'},{lease_owner:'api:actor'}]){
      completion={...original,...patch};await assert.rejects(service.executeInternal(capability,input),{code:'unknown',statusCode:503});
    }
    await assert.rejects(service.executeInternal(capability,{...input,admittedAction:undefined}),{code:'precondition_failed'});
  }
});

test('stale target preflight never overwrites a concurrently completed action or its approval',async()=>{
  const original={id:'action',user_id:'owner',project_id:'project',requested_by:'owner',action_type:'emergency_stop',
    target_type:'automation',target_id:'rule',target_version:1,status:'queued',confirmation_digest:'digest',action_plan_digest:'digest'};
  let storedStatus='queued';
  const db={from(table:string){
    const q={select(){return q;},eq(){return q;},async maybeSingle(){
      if(table==='operations_actions')return {data:{...original},error:null};
      if(table==='projects')return {data:{id:'project',user_id:'owner'},error:null};
      if(table==='profiles')return {data:{role:'member'},error:null};
      assert.equal(table,'operations_automation_rules');
      storedStatus='verified';return {data:{version:2},error:null};
    },update(){assert.fail('failed preflight must never mutate action or approval');}};return q;
  },rpc(){assert.fail('stale target cannot reach a claim or completion');}};
  await assert.rejects(new OperationsService(db as unknown as SupabaseClient).executeAction('owner','action'),{code:'invalid_state',statusCode:409});
  assert.equal(storedStatus,'verified');
});
