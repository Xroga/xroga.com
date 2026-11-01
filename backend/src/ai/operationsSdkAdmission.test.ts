import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {withOperationsProviderReservation} from './providerBudget.js';
import {chatCompletion,chatCompletionStream,type ChatMessage} from './openaiCompat.js';

test('actual Operations generic SDK path rechecks the admitted-action reservation on each wire and requires settlement plus atomic accounting',async t=>{
  const env={NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55439',SUPABASE_SERVICE_ROLE_KEY:'synthetic-loopback-only',GLM_API_KEY:'synthetic-ops-key'};
  const previous=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  t.after(()=>{for(const k of Object.keys(env))previous[k]===undefined?delete process.env[k]:process.env[k]=previous[k];});
  const owner='11111111-1111-4111-8111-111111111111',actor='22222222-2222-4222-8222-222222222222',action={id:randomUUID(),user_id:owner,requested_by:actor,status:'running'};
  const messages:ChatMessage[]=[{role:'user',content:'Synthetic approved benchmark'}];
  let mode='ok',wire=0,reserves=0,atomic=0,revoked=false,reservation:Record<string,unknown>;
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input)),b=JSON.parse(String(init?.body??'{}'));
    if(url.origin==='https://open.bigmodel.cn'){
      assert.equal(url.href,'https://open.bigmodel.cn/api/paas/v4/chat/completions');wire++;
      assert.ok(reserves>=2,'Initial reservation and current pre-wire authority are both verified');
      if(mode==='revokedRetry'){revoked=true;return Response.json({error:{message:'Synthetic outage'}},{status:503});}
      const result={id:'synthetic-ops-receipt',choices:[b.stream?{delta:{content:'Synthetic result'},finish_reason:'stop'}:{message:{content:'Synthetic result'},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:2}};
      return b.stream?new Response('data: '+JSON.stringify(result)+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}}):Response.json(result);
    }
    assert.equal(url.origin,env.SUPABASE_URL);
    if(url.pathname.endsWith('/reserve_operations_provider_budget')){
      reserves++;assert.deepEqual(b.p_expected,action);assert.equal(b.p_actor,actor);
      if(mode==='denied'||revoked)return Response.json({message:'Synthetic admission denial'},{status:403});
      reservation??={id:randomUUID(),user_id:owner,status:'reserved',idempotency_key:b.p_idempotency_key,internal_route:b.p_internal_route,purpose:'completion',authority_action_id:action.id,
        price_version:b.p_price_version,estimated_input_tokens:b.p_estimated_input_tokens,maximum_output_tokens:b.p_maximum_output_tokens,reserved_micro_usd:b.p_reservation_micro_usd};
      return Response.json(reservation);
    }
    if(url.pathname.endsWith('/settle_xroga_provider_budget')){
      if(mode==='settlement')return Response.json({message:'Synthetic settlement failure'},{status:400});
      return Response.json({...reservation,status:'settled',settled_micro_usd:b.p_actual_micro_usd,provider_request_id:b.p_provider_request_id,actual_input_tokens:b.p_actual_input_tokens,
        cached_input_tokens:b.p_cached_input_tokens,output_tokens:b.p_output_tokens,reasoning_tokens:b.p_reasoning_tokens,tool_calls:b.p_tool_calls,search_calls:b.p_search_calls});
    }
    if(url.pathname.endsWith('/record_ai_usage_atomic')){atomic++;return Response.json({userId:mode==='receipt'?actor:owner,receiptId:b.p_receipt_id,modelId:b.p_model_id,poolRole:b.p_pool_role,inputTokens:b.p_input,outputTokens:b.p_output,
      costUsd:b.p_cost_usd,ledgerId:'1',period:new Date().toISOString().slice(0,7)+'-01',replayed:false,usage:{user_id:owner}});}
    if(url.pathname==='/rest/v1/user_token_usage')return Response.json({user_id:owner,plan_tier:'free',input_tokens:0,output_tokens:0,spent_usd:0,model_usage:{},plan_budget_usd:1.65,rollover_usd:0,quota_period_start:new Date().toISOString().slice(0,7)+'-01'});
    assert.ok(['/rest/v1/rpc/release_xroga_provider_budget','/rest/v1/model_provider_health'].includes(url.pathname));return Response.json(null);
  });
  for(const invoke of [chatCompletion,chatCompletionStream]){
    for(const failure of ['ok','denied','revokedRetry','settlement','receipt']){
      mode=failure;revoked=false;reserves=0;reservation=undefined!;const deltas:string[]=[],before=wire,beforeAtomic=atomic;
      const run=()=>withOperationsProviderReservation({ownerId:owner,actorId:actor,admittedAction:action,modelId:'glm_5_3_flash',estimatedInputTokens:100,maximumOutputTokens:64,idempotencyKey:randomUUID(),payload:{messages},
        execute:d=>{assert.ok(d);return invoke('glm_5_3_flash',d.payload.messages as ChatMessage[],{maxTokens:64,beforeDispatch:d.beforeDispatch,credentialOverride:d.credentialOverride,onDelta:text=>deltas.push(text)});}});
      if(failure==='ok'){assert.equal((await run()).text,'Synthetic result');assert.equal(atomic,beforeAtomic+1);assert.equal(deltas.length,invoke===chatCompletionStream?1:0);}
      else{await assert.rejects(run(),{code:failure==='denied'?'PROVIDER_RESERVATION_DENIED':failure==='revokedRetry'?'MODEL_DISPATCH_BINDING_DENIED':'POST_COMPLETION_ACCOUNTING_UNCERTAIN'});assert.equal(deltas.length,0);}
      assert.equal(wire,before+(failure==='denied'?0:1),'No unauthorized retry, fallback or unaccounted publication');
    }
  }
});
