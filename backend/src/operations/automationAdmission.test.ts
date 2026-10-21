import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { OperationsService, OperationsServiceError } from './operationsService.js';

const signal={triggerType:'fixture',triggerId:'trigger',targetType:'automation',targetId:'project',targetVersion:1,attributes:{level:'original'},evidenceReference:'proof'};
function fixture(){
  const state={mode:'fresh',calls:0,actions:0,audits:0,updates:[] as Record<string,unknown>[],lastRun:null as Record<string,unknown>|null,
    errorCode:null as string|null,createError:null as Error|null,linkMode:'valid',patch:{} as Record<string,unknown>,runPatch:{} as Record<string,unknown>,actionPatch:{} as Record<string,unknown>,
    rule:{id:'rule',user_id:'actor',project_id:'project',trigger_type:'fixture',action_type:'resume_automation',risk_level:'high',enabled:true,
      emergency_stopped:false,conditions:{level:'original'},exclusions:{},rate_limit:{maxRuns:1,windowSeconds:60}}};
  const db={from(table:string){
    const q={select(){return q;},eq(){return q;},
      update(){assert.fail('Automation linking must use the current-parent transaction');},
      insert(){assert.fail('Automation audit must commit in the same guarded transaction');},
      async maybeSingle(){
        if(table==='projects')return {data:{id:'project',user_id:'actor'},error:null};
        assert.equal(table,'profiles');return {data:{role:'member'},error:null};
      },then(resolve:(value:unknown)=>unknown){
        assert.equal(table,'operations_automation_rules');
        return Promise.resolve(resolve({data:[state.rule],error:null}));
      }};return q;
  },async rpc(name:string,args:Record<string,unknown>){
    if(name==='finalize_operations_automation_run'){
      assert.equal(args.p_actor,'actor');assert.equal(args.p_owner,'actor');assert.equal(args.p_project,'project');
      assert.deepEqual(args.p_expected_rule,state.rule);assert.deepEqual(args.p_expected_run,state.lastRun);
      assert.deepEqual(args.p_attributes,{level:'original'});assert.equal(args.p_environment,null);
      const action=args.p_action as Record<string,unknown>|null;
      const patch=action?{status:'approval_required',action_id:action.id,completed_at:null}:{};
      if(action){assert.equal(action.user_id,'actor');assert.equal(action.idempotency_key,'run');state.updates.push(patch);}
      const rows=state.linkMode==='empty'?[]:[{...state.lastRun,...patch,...(state.linkMode==='foreign'?{user_id:'foreign'}:{})}];
      if(state.linkMode==='valid')state.audits++;
      return{data:rows,error:null};
    }
    state.calls++;assert.equal(name,'admit_operations_automation_run');
    assert.equal(args.p_actor,'actor');assert.equal(args.p_owner,'actor');assert.equal(args.p_project,'project');
    assert.deepEqual(args.p_expected_rule,state.rule);assert.deepEqual(args.p_attributes,{level:'original'});assert.equal(args.p_evidence,'proof');assert.match(String(args.p_digest),/^[0-9a-f]{64}$/);
    const replayed=state.mode.startsWith('replay'),limited=state.mode==='limited',waiting=state.mode==='replay_waiting';
    const run={id:'run',user_id:'actor',rule_id:'rule',trigger_digest:args.p_digest,evidence_reference:'proof',started_at:new Date().toISOString(),
      status:replayed&&!waiting?'approval_required':limited?'rate_limited':'evaluating',action_id:replayed&&!waiting?'action':null,
      completed_at:limited?new Date().toISOString():null,safe_error:limited?'rate_limited':null,...state.runPatch};
    state.lastRun=run;
    return {data:{run,decision:replayed?'duplicate':limited?'rate_limited':'approval_required',replayed,...state.patch},error:state.errorCode?{code:state.errorCode}:null};
  }};
  const service=new OperationsService(db as unknown as SupabaseClient);
  service.createAction=async(actor,input)=>{
    state.actions++;assert.equal(actor,'actor');assert.equal(input.idempotencyKey,'run');assert.equal(input.confirmed,true);assert.equal(input.targetId,'project');
    if(state.createError)throw state.createError;return {id:'action',status:'approval_required',user_id:'actor',project_id:'project',requested_by:'actor',
      action_type:'resume_automation',idempotency_key:'run',target_type:'automation',target_id:'project',target_version:1,environment_id:null,...state.actionPatch};
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

test('an evaluating replay reconciles the same run idempotency namespace before atomic linking',async()=>{
  const {state,evaluate}=fixture();state.mode='replay_waiting';
  const [run]=await evaluate();assert.equal(run.id,'run');assert.equal(run.action_id,'action');assert.equal(run.status,'approval_required');
  assert.equal(state.actions,1);assert.equal(state.updates.length,1);assert.equal(state.audits,1);
});

test('foreign or substituted automation action receipts cannot reach the finalization transaction',async()=>{
  for(const patch of [{id:''},{user_id:'foreign'},{project_id:'foreign'},{requested_by:'foreign'},{action_type:'other'},
    {idempotency_key:'other'},{target_type:'other'},{target_id:'other'},{target_version:2},{environment_id:'other'}]){
    const {state,evaluate}=fixture();state.actionPatch=patch;await assert.rejects(evaluate(),{code:'unknown',statusCode:503});
    assert.equal(state.actions,1);assert.equal(state.updates.length,0);assert.equal(state.audits,0);
  }
});
