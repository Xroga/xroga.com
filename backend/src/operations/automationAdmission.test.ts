import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService, OperationsServiceError } from './operationsService.js';

const signal={triggerType:'fixture',triggerId:'trigger',targetType:'automation',targetId:'project',targetVersion:1,attributes:{level:'original'},evidenceReference:'proof'};
function fixture(){
  const state={mode:'fresh',calls:0,actions:0,audits:0,updates:[] as Record<string,unknown>[],lastRun:null as Record<string,unknown>|null,
    errorCode:null as string|null,createError:null as Error|null,linkMode:'valid',patch:{} as Record<string,unknown>,runPatch:{} as Record<string,unknown>,
    rule:{id:'rule',user_id:'actor',project_id:'project',trigger_type:'fixture',action_type:'resume_automation',risk_level:'high',enabled:true,
      emergency_stopped:false,conditions:{level:'original'},exclusions:{},rate_limit:{maxRuns:1,windowSeconds:60}}};
  const db={from(table:string){
    let patch:Record<string,unknown>={},filters:Record<string,unknown>={};
    const q={select(){return q;},eq(key:string,value:unknown){filters[key]=value;return q;},is(key:string,value:unknown){filters[key]=value;return q;},
      update(value:Record<string,unknown>){assert.equal(table,'operations_automation_runs');state.updates.push(value);patch=value;return q;},
      insert(){assert.equal(table,'production_audit_log');state.audits++;return q;},
      async maybeSingle(){
        if(table==='projects')return {data:{id:'project',user_id:'actor'},error:null};
        assert.equal(table,'profiles');return {data:{role:'member'},error:null};
      },then(resolve:(value:unknown)=>unknown){
        let data:unknown=[];
        if(table==='operations_automation_rules')data=[state.rule];
        if(table==='operations_automation_runs'){
          assert.deepEqual(filters,{id:'run',user_id:'actor',rule_id:'rule',trigger_digest:state.lastRun?.trigger_digest,status:'evaluating',action_id:null});
          data=state.linkMode==='empty'?[]:[{...state.lastRun,...patch,...(state.linkMode==='foreign'?{user_id:'foreign'}:{})}];
        }
        return Promise.resolve(resolve({data,error:null}));
      }};return q;
  },async rpc(name:string,args:Record<string,unknown>){
    state.calls++;assert.equal(name,'admit_operations_automation_run');
    assert.equal(args.p_actor,'actor');assert.equal(args.p_owner,'actor');assert.equal(args.p_project,'project');
    assert.deepEqual(args.p_expected_rule,state.rule);assert.deepEqual(args.p_attributes,{level:'original'});assert.equal(args.p_evidence,'proof');assert.match(String(args.p_digest),/^[0-9a-f]{64}$/);
    const replayed=state.mode==='replay',limited=state.mode==='limited';
    const run={id:'run',user_id:'actor',rule_id:'rule',trigger_digest:args.p_digest,evidence_reference:'proof',started_at:new Date().toISOString(),
      status:replayed?'approval_required':limited?'rate_limited':'evaluating',action_id:replayed?'action':null,
      completed_at:limited?new Date().toISOString():null,safe_error:limited?'rate_limited':null,...state.runPatch};
    state.lastRun=run;
    return {data:{run,decision:replayed?'duplicate':limited?'rate_limited':'approval_required',replayed,...state.patch},error:state.errorCode?{code:state.errorCode}:null};
  }};
  const service=new OperationsService(db as unknown as SupabaseClient);
  service.createAction=async(actor,input)=>{
    state.actions++;assert.equal(actor,'actor');assert.equal(input.idempotencyKey,'run');assert.equal(input.confirmed,true);assert.equal(input.targetId,'project');
    if(state.createError)throw state.createError;return {id:'action',status:'approval_required'};
  };
  return {state,evaluate:()=>service.evaluateAutomationSignal('actor','project',signal)};
}

test('fresh automation admission creates one run-bound action while replay and limits cannot execute',async()=>{
  const {state,evaluate}=fixture();assert.equal((await evaluate())[0].status,'approval_required');
  assert.equal(state.actions,1);assert.equal(state.updates.length,1);assert.equal(state.audits,1);
  state.mode='replay';assert.equal((await evaluate())[0].id,'run');assert.equal(state.actions,1);assert.equal(state.updates.length,1);assert.equal(state.audits,1);
  state.mode='limited';assert.equal((await evaluate())[0].status,'rate_limited');assert.equal(state.actions,1);assert.equal(state.updates.length,1);assert.equal(state.audits,2);
});

test('malformed automation admission and changed rule receipts stop before effects',async()=>{
  const {state,evaluate}=fixture();
  for(state.runPatch of [{user_id:'foreign'},{rule_id:'foreign'},{trigger_digest:'changed'},{evidence_reference:'changed'},{id:''},{status:'verified'},{action_id:'already-linked'},{completed_at:'2026-01-01'},{safe_error:'changed'},{started_at:null}]){
    await assert.rejects(evaluate(),{code:'unknown',statusCode:503});assert.equal(state.actions,0);assert.equal(state.updates.length,0);
  }
  state.runPatch={};
  for(state.patch of [{replayed:'yes'},{decision:'duplicate'},{decision:'execute'},{run:null}])await assert.rejects(evaluate(),{code:'unknown',statusCode:503});
  state.patch={};
  for(const [code,expected]of [['42501','forbidden'],['40001','conflict'],['22023','precondition_failed'],['08006','unknown']]){state.errorCode=code;await assert.rejects(evaluate(),{code:expected});}
  state.errorCode=null;const before=state.calls;state.rule.project_id='foreign';await assert.rejects(evaluate(),{code:'unknown'});assert.equal(state.calls,before);assert.equal(state.actions,0);
});

test('uncertain action creation or linking preserves admission instead of falsely failing or retrying',async()=>{
  for(const mode of ['creation','empty','foreign']){
    const {state,evaluate}=fixture();
    if(mode==='creation')state.createError=new OperationsServiceError('unknown','Synthetic uncertain action',503);else state.linkMode=mode;
    await assert.rejects(evaluate(),{code:'unknown',statusCode:503});assert.equal(state.actions,1);
    assert.equal(state.updates.some(row=>row.status==='failed'),false);assert.equal(state.audits,0);
  }
});

test('a 4xx after action persistence cannot falsely fail the pending automation run',async()=>{
  const {state,evaluate}=fixture();state.createError=new OperationsServiceError('forbidden','Synthetic denial',403);
  await assert.rejects(evaluate(),{code:'unknown',statusCode:503});
  assert.equal(state.actions,1);assert.equal(state.updates.length,0);assert.equal(state.audits,0);
});
