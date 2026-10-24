import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService } from './operationsService.js';

function fixture(){
  const state={calls:0,error:null as string|null,rows:'valid',patch:{} as Record<string,unknown>,args:{} as Record<string,any>};
  const db={from(table:string){
    const q={select(){return q;},eq(){return q;},async maybeSingle(){
      if(table==='projects')return {data:{id:'project',user_id:'owner'},error:null};
      assert.equal(table,'profiles');return {data:{role:'member'},error:null};
    }};return q;
  },async rpc(name:string,args:Record<string,any>){
    state.calls++;state.args=args;assert.equal(name,'create_operations_automation_rule');
    assert.equal(args.p_actor,'owner');assert.equal(args.p_owner,'owner');assert.equal(args.p_project,'project');
    return {data:state.rows==='empty'?[]:state.rows==='duplicate'?[args.p_rule,args.p_rule]:[{...args.p_rule,...state.patch}],error:state.error?{code:state.error}:null};
  }};
  return {state,service:new OperationsService(db as unknown as SupabaseClient)};
}
const input=()=>({ruleKey:'rule.fixture',name:'Fixture rule',triggerType:'fixture',riskLevel:'high' as const,actionType:'resume_automation',
  conditions:{level:'original',apiKey:'never copy to audit'},exclusions:{},maxRuns:2,windowSeconds:60,enabled:false});

test('automation creation uses one current-authority transaction with canonical approval and exact receipt',async()=>{
  const {state,service}=fixture();const row=await service.createAutomationRule('owner','project',input());
  assert.match(row.id,/^[0-9a-f-]{36}$/);assert.equal(state.calls,1);assert.equal(state.args.p_approval_role,'recovery_manager');
  assert.deepEqual(row.approval_policy,{requiredRole:'recovery_manager'});assert.equal(row.conditions.apiKey,'[REDACTED]');
  assert.deepEqual(row.rate_limit,{maxRuns:2,windowSeconds:60});assert.equal(row.emergency_stopped,false);assert.equal(row.version,1);
});

test('automation creation rejects substituted missing and duplicate receipts without a fallback write',async()=>{
  const {state,service}=fixture();
  for(state.patch of [{id:'other'},{user_id:'other'},{project_id:'other'},{environment_id:'other'},{rule_key:'other'},
    {name:'other'},{trigger_type:'other'},{risk_level:'low'},{action_type:'other'},{version:2},{emergency_stopped:true},
    {enabled:true},{approval_policy:{}},{verification_plan:{}},{conditions:{}},{exclusions:{other:true}},{rate_limit:{maxRuns:20,windowSeconds:60}}]){
    await assert.rejects(service.createAutomationRule('owner','project',input()),{code:'unknown',statusCode:503});
  }
  state.patch={};for(state.rows of ['empty','duplicate'])await assert.rejects(service.createAutomationRule('owner','project',input()),{code:'unknown'});
});

test('automation creation preserves typed database denials and existing high-risk policy',async()=>{
  const {state,service}=fixture();
  for(const [code,expected,statusCode]of [['42501','forbidden',403],['23505','conflict',409],['22023','precondition_failed',400],['08006','unknown',503]] as const){
    state.error=code;await assert.rejects(service.createAutomationRule('owner','project',input()),{code:expected,statusCode});
  }
  const before=state.calls;
  for(const actionType of ['unknown','emergency_stop'])await assert.rejects(service.createAutomationRule('owner','project',{...input(),actionType}),{code:'precondition_failed'});
  assert.equal(state.calls,before);
});
