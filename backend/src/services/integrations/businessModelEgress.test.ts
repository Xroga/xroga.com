import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTenantContext } from '../../security/tenantContext.js';
import { readBusinessData } from './businessRead.js';
import { prepareBusinessAction } from './businessAction.js';

function fixture(t: TestContext) {
  const owner='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
  const context=createTenantContext({userId:owner,via:'remote_getuser'});
  const env={NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55438',SUPABASE_SERVICE_ROLE_KEY:'synthetic-business-db-only',
    OPENROUTER_API_KEY:'synthetic-business-platform-credential',GLM_API_KEY:'synthetic-business-glm-credential',
    COMPOSIO_API_KEY:'synthetic-business-composio-credential'};
  const prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  t.after(()=>{for(const k of Object.keys(env))prior[k]===undefined?delete process.env[k]:process.env[k]=prior[k];});
  const state={lane:'read',mode:'ok',effects:0,reservations:0,settlements:0,receipts:0,releases:0,composio:0,readExecutions:0,mutate:undefined as undefined|(()=>void)};
  const held=new Map<string,Record<string,unknown>>();let config:Record<string,unknown>={};
  const slug=()=>state.lane==='read'?'SLACK_LIST_MESSAGES':'SLACK_DELETE_MESSAGE';
  const usage={user_id:owner,plan_tier:'spark',plan_budget_usd:20,quota_period_start:new Date().toISOString().slice(0,7)+'-01',
    input_tokens:0,output_tokens:0,spent_usd:0,rollover_usd:0,model_usage:{}};
  const stringify=JSON.stringify;
  t.mock.method(JSON,'stringify',((value:unknown,...args:unknown[])=>{
    if(state.mode==='wire'&&value&&typeof value==='object'&&'model' in value&&'messages' in value&&Array.isArray(value.messages)){
      value={...value,messages:value.messages.map((m,i)=>i===0?{...m,content:'SYNTHETIC_CHANGED_WIRE'}:m)};
    }
    return Reflect.apply(stringify,JSON,[value,...args]);
  }) as typeof JSON.stringify);
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input instanceof Request?input.url:input)),body=init?.body?JSON.parse(String(init.body)):{};
    if(['https://openrouter.ai','https://open.bigmodel.cn'].includes(url.origin)){
      state.effects++;assert.ok(state.reservations>state.settlements);
      assert.equal(init?.redirect,'manual');assert.ok(body.messages.some((m:{content:string})=>m.content.includes('selected synthetic message')));
      if(state.mode==='outage'&&url.origin==='https://openrouter.ai')return Response.json({error:{message:'Synthetic provider outage'}},{status:503});
      assert.doesNotMatch(JSON.stringify(body),/synthetic-business-platform-credential|synthetic-business-glm-credential/);
      return Response.json({id:'synthetic-model-result',choices:[{message:{content:JSON.stringify({toolSlug:slug(),arguments:{},summary:'Delete the selected synthetic message'})},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:2}});
    }
    if(url.origin==='https://backend.composio.dev'){
      state.composio++;
      if(url.pathname.endsWith('/session')){assert.equal(body.user_id,'xroga:'+owner);config=body;state.mutate?.();state.mutate=undefined;return Response.json({session_id:'trs_business_model_fixture',config});}
      if(url.pathname.endsWith('/trs_business_model_fixture'))return Response.json({session_id:'trs_business_model_fixture',config});
      if(url.pathname.endsWith('/search'))return Response.json({tool_schemas:{fixture:{tool_slug:slug(),toolkit:'slack',
        description:state.mode==='descriptor'?env.OPENROUTER_API_KEY:'Synthetic owned tool metadata',input_schema:{type:'object',properties:{}}}}});
      if(url.pathname.endsWith('/toolkits'))return Response.json({items:[{slug:'slack',name:'Slack',connected_account:{id:'ca_synthetic_owner',status:'ACTIVE'}}]});
      if(url.pathname.includes('/tools/'))return Response.json({slug:slug(),toolkit:{slug:'slack'},tags:[state.lane==='read'?'readOnlyHint':'destructiveHint'],input_parameters:{type:'object'},scopes:['fixture.message']});
      if(url.pathname.endsWith('/execute')){assert.equal(state.lane,'read','Preparation must never execute an external action');state.readExecutions++;return Response.json({data:{messages:['SYNTHETIC_READ_RESULT']},error:null});}
      assert.fail('Unexpected Composio operation: '+url.pathname);
    }
    assert.equal(url.origin,env.SUPABASE_URL,'No actual provider or production request is allowed');
    if(url.pathname==='/rest/v1/user_token_usage'){assert.equal(url.searchParams.get('user_id'),'eq.'+owner);return Response.json(usage);}
    if(url.pathname==='/rest/v1/model_provider_health')return Response.json(null);
    if(url.pathname.endsWith('/reserve_xroga_provider_budget')){
      state.reservations++;assert.equal(body.p_user_id,owner);
      const row={id:randomUUID(),user_id:state.mode==='foreign-reservation'?foreign:owner,status:'reserved',idempotency_key:body.p_idempotency_key,
        internal_route:body.p_internal_route,purpose:body.p_purpose,price_version:body.p_price_version,estimated_input_tokens:body.p_estimated_input_tokens,
        maximum_output_tokens:body.p_maximum_output_tokens,reserved_micro_usd:body.p_reservation_micro_usd};held.set(row.id,row);return Response.json(row);
    }
    if(url.pathname.endsWith('/settle_xroga_provider_budget')){
      state.settlements++;const row=held.get(body.p_reservation_id);assert.ok(row);assert.equal(body.p_user_id,owner);
      return Response.json({...row,status:'settled',settled_micro_usd:body.p_actual_micro_usd,provider_request_id:body.p_provider_request_id,
        actual_input_tokens:body.p_actual_input_tokens,cached_input_tokens:body.p_cached_input_tokens,output_tokens:body.p_output_tokens,
        reasoning_tokens:body.p_reasoning_tokens,tool_calls:body.p_tool_calls,search_calls:body.p_search_calls});
    }
    if(url.pathname.endsWith('/release_xroga_provider_budget')){state.releases++;return Response.json(null);}
    if(url.pathname.endsWith('/record_ai_usage_atomic')){
      state.receipts++;assert.equal(body.p_user_id,owner);if(state.mode==='accounting')return Response.json(null);
      return Response.json({userId:owner,receiptId:body.p_receipt_id,modelId:body.p_model_id,poolRole:body.p_pool_role,inputTokens:body.p_input,
        outputTokens:body.p_output,costUsd:body.p_cost_usd,ledgerId:'1',period:usage.quota_period_start,replayed:false,usage});
    }
    assert.fail('Unexpected database operation: '+url.pathname);
  });
  const request=()=>({userId:owner,tenantContext:context,useCase:'Read or delete the selected synthetic message'});
  const call=(input=request())=>state.lane==='read'?readBusinessData(input):prepareBusinessAction(input);
  return {state,request,call,context,owner,foreign};
}

test('dependent business evidence requires explicit review before discovery or model dispatch',async t=>{
  const f=fixture(t);f.state.lane='action';
  await assert.rejects(prepareBusinessAction({...f.request(),referenceEvidence:[{
    sourceRequest:'Owned preceding read',toolkit:'slack',toolSlug:'SLACK_LIST_MESSAGES',data:'Synthetic owned result',
  }]}),{code:'BUSINESS_ACTION_REFERENCE_REVIEW_REQUIRED'});
  assert.equal(f.state.composio,0);assert.equal(f.state.reservations,0);assert.equal(f.state.effects,0);
});

test('explicitly reviewed dependent action keeps confirmation and a snapshot of its evidence',async t=>{
  const f=fixture(t);f.state.lane='action';
  const referenceEvidence=[{sourceRequest:'Owned preceding read',toolkit:'slack',toolSlug:'SLACK_LIST_MESSAGES',data:'Synthetic owned result'}];
  f.state.mutate=()=>{referenceEvidence[0]!.data='synthetic-business-platform-credential';};
  const result=await prepareBusinessAction({...f.request(),forceConfirmation:true,referenceEvidence});
  assert.equal(result.status,'ready');
  if(result.status==='ready'){assert.equal(result.plan.requiresConfirmation,true);assert.equal(result.plan.forceConfirmation,true);}
  assert.equal(f.state.effects,1);assert.equal(f.state.readExecutions,0);
});

test('actual business selectors preserve invalid reservation denial before trying another model',async t=>{
  const f=fixture(t);
  for(const lane of ['read','action']){
    f.state.lane=lane;f.state.mode='foreign-reservation';const before={...f.state};
    await assert.rejects(f.call(),{code:'PROVIDER_RESERVATION_DENIED'});
    assert.equal(f.state.reservations,before.reservations+1);assert.equal(f.state.effects,before.effects);assert.equal(f.state.readExecutions,0);
  }
});

test('actual business model callers bind issued owner and immutable input through SDK and canonical accounting',async t=>{
  const f=fixture(t);
  for(const lane of ['read','action']){
    f.state.lane=lane;f.state.mode='ok';let before={...f.state};
    const result=await f.call();assert.equal(result.status,lane==='read'?'success':'ready');
    assert.equal(f.state.effects,before.effects+1);assert.equal(f.state.reservations,before.reservations+1);
    assert.equal(f.state.settlements,before.settlements+1);assert.equal(f.state.receipts,before.receipts+1);
    if(result.status==='ready'){assert.equal(result.plan.requiresConfirmation,true);assert.equal(result.plan.authority?.userId,f.owner);}
    before={...f.state};
    await assert.rejects(f.call({...f.request(),tenantContext:{...f.context}}),{code:'TENANT_AUTH_REQUIRED'});
    await assert.rejects(f.call({...f.request(),userId:f.foreign}),{code:'RESOURCE_NOT_FOUND'});
    assert.equal(f.state.composio,before.composio);assert.equal(f.state.effects,before.effects);
    const mutable=f.request();f.state.mutate=()=>{mutable.userId=f.foreign;mutable.useCase='Foreign replacement must not enter the model';};
    assert.equal((await f.call(mutable)).status,lane==='read'?'success':'ready');
    f.state.mode='descriptor';before={...f.state};
    await assert.rejects(f.call(),{code:'MODEL_CREDENTIAL_EGRESS_DENIED'});
    assert.equal(f.state.effects,before.effects);assert.equal(f.state.reservations,before.reservations+1);assert.equal(f.state.releases,before.releases+1);
    f.state.mode='wire';before={...f.state};
    await assert.rejects(f.call(),{code:'MODEL_DISPATCH_BINDING_DENIED'});
    assert.equal(f.state.effects,before.effects);assert.equal(f.state.reservations,before.reservations+1);assert.equal(f.state.releases,before.releases+1);
    f.state.mode='accounting';before={...f.state};
    await assert.rejects(f.call(),{code:'POST_COMPLETION_ACCOUNTING_UNCERTAIN'});
    assert.equal(f.state.effects,before.effects+1);assert.equal(f.state.reservations,before.reservations+1);assert.equal(f.state.readExecutions,before.readExecutions);
  }
});

test('business model selectors still recover from an ordinary provider outage without duplicating completion accounting',async t=>{
  const f=fixture(t);
  for(const lane of ['read','action']){
    f.state.lane=lane;f.state.mode='outage';const before={...f.state};
    const result=await f.call();assert.equal(result.status,lane==='read'?'success':'ready');
    assert.ok(f.state.effects>=before.effects+2,'A real provider outage may use the bounded alternate model');
    assert.equal(f.state.reservations,before.reservations+2);assert.equal(f.state.settlements,before.settlements+1);
    assert.equal(f.state.receipts,before.receipts+1);assert.equal(f.state.releases,before.releases+1);
    assert.equal(f.state.readExecutions,before.readExecutions+(lane==='read'?1:0));
  }
});
