import assert from 'node:assert/strict';
import test from 'node:test';
import {createTenantContext} from '../../security/tenantContext.js';
import {getBusinessWorkflowRun} from './businessWorkflowRuns.js';

test('workflow merge adapter requires issued context before access and verifies returned ownership', async () => {
  const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
  const runId='33333333-3333-4333-8333-333333333333';
  const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
  const previous=keys.map(k=>process.env[k]),original=globalThis.fetch;
  process.env.SUPABASE_URL='http://127.0.0.1:49194';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-merge-only';
  let reads=0,returnedOwner=owner;
  globalThis.fetch=async(input)=>{
    reads++;const u=new URL(String(input instanceof Request?input.url:input));
    assert.equal(u.pathname,'/rest/v1/business_workflow_runs');
    assert.equal(u.searchParams.get('user_id'),'eq.'+owner);
    assert.equal(u.searchParams.get('id'),'eq.'+runId);
    return new Response(JSON.stringify([{id:runId,user_id:returnedOwner,request:'Review two app actions',steps:[
      {kind:'action',request:'First action',dependsOnPrevious:false},{kind:'action',request:'Second action',dependsOnPrevious:false},
    ],outcomes:[],step_index:0,status:'awaiting_confirmation',current_confirmation_id:null,failure_code:null}]),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    await assert.rejects(getBusinessWorkflowRun(owner as never,runId),{code:'TENANT_AUTH_REQUIRED'});
    await assert.rejects(getBusinessWorkflowRun({userId:owner,tenantId:owner} as never,runId),{code:'TENANT_AUTH_REQUIRED'});
    assert.equal(reads,0);
    const actor=createTenantContext({userId:owner,via:'local_jwt'});
    assert.equal((await getBusinessWorkflowRun(actor,runId)).id,runId);
    assert.equal(reads,1);
    returnedOwner=other;
    await assert.rejects(getBusinessWorkflowRun(actor,runId),/not found or could not be loaded/);
    assert.equal(reads,2);
  }finally{globalThis.fetch=original;keys.forEach((k,i)=>previous[i]===undefined?delete process.env[k]:process.env[k]=previous[i]);}
});
