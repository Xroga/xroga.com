import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {prepareSonnetApproval,requestedSonnetReason,SONNET_TASK_MAXIMUM_MICRO_USD} from './sonnetApproval.js';
import {confirmBusinessAction,getBusinessActionConfirmation} from '../services/integrations/businessActionConfirmations.js';
import {readModelResult} from '../services/integrations/modelResult.js';
import {setStorageServiceForTests} from '../storage/runtime.js';
import {createTenantContext} from '../security/tenantContext.js';
import {actionPlanDigest} from '../services/integrations/businessAction.js';
import {planSemanticRequest} from './universal/semanticRequestPlanner.js';

test('only an explicit complex engineering request proposes Sonnet, never formatting or frustration',()=>{
 assert.equal(requestedSonnetReason('Use Sonnet to debug this complex concurrency race condition.'),'user_requested_complex_work');
 for(const text of ['Hello','This is still wrong. Fix it!','Should I use Sonnet for this repository?','Explain multi-file concurrency.',"Don't use Sonnet for this complex concurrency code."])assert.equal(requestedSonnetReason(text),null);
 assert.throws(()=>requestedSonnetReason('Use Sonnet to say hello.'));
 assert.throws(()=>requestedSonnetReason('Use Sonnet to just format a complex code chart.'));
});

test('actual confirmation adapter resumes pending approval once, persists its result and never replays a paid effect',async t=>{
 const env={SUPABASE_URL:'http://127.0.0.1:55437',SUPABASE_SERVICE_ROLE_KEY:'synthetic-loopback-only',NODE_ENV:'test',ZURELAY_API_KEY:'synthetic-platform-key'};
 const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{setStorageServiceForTests(undefined);for(const k of Object.keys(env)){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}});
 const owner='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
 const context=createTenantContext({userId:owner,via:'remote_getuser'}),scope={context,userId:owner,connectedAccountId:'platform'};
 const rows=new Map<string,any>(),reservations=new Map<string,any>(),objects=new Map<string,Buffer>();
 let effects=0,settlements=0,unknown=0,failMode='',storageWrites=0;
 setStorageServiceForTests({
  putServerObject:async(_actor:unknown,input:any)=>{if(failMode==='storage')throw Error('Synthetic private storage outage');storageWrites++;objects.set(input.filename,Buffer.from(input.body));},
  listObjects:async(_actor:unknown,input:any)=>objects.has(input.safeFilename)?[{id:input.safeFilename}]:[],
  readObjectBytes:async(_actor:unknown,id:string)=>({bytes:objects.get(id)!}),
 } as never);
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));const body=init?.body?JSON.parse(String(init.body)):{};
  if(url.origin==='https://api.zurelay.com'){
   effects++;assert.equal(body.model,'claude-sonnet-5-5');assert.equal(body.max_tokens,4096);assert.equal(body.temperature,undefined);
   assert.equal(new Headers(init?.headers).get('x-zurelay-fallback'),'off');assert.equal(init?.redirect,'manual');
   if(failMode==='drop')throw Object.assign(Error('Synthetic connection lost after dispatch'),{name:'AbortError'});
   return Response.json({id:'synthetic-sonnet-trace',model:body.model,usage:{prompt_tokens:100,completion_tokens:20,total_tokens:120},
    choices:[{index:0,message:{role:'assistant',content:'## Diagnosis\n\nCheck the transaction boundary and current membership before privileged writes.'},finish_reason:'stop'}]},
    {headers:{'x-request-id':'synthetic-sonnet-trace','x-zurelay-model':body.model}});
  }
  assert.equal(url.origin,'http://127.0.0.1:55437','Offline test must never contact another service');
  if(url.pathname.endsWith('/business_action_confirmations')){
   if(init?.method==='POST'){
    const id=randomUUID(),row={...body,id,created_at:new Date().toISOString(),claimed_at:null,completed_at:null,failure_code:null};rows.set(id,row);return Response.json(row);
   }
   const id=url.searchParams.get('id')?.slice(3);const row=rows.get(id??'');
   return Response.json(row&&url.searchParams.get('user_id')==='eq.'+row.user_id?row:null);
  }
  if(url.pathname.endsWith('/claim_business_action_confirmation')){
   const row=rows.get(body.p_id);if(!row||row.status!=='pending'||row.user_id!==body.p_owner)return Response.json(null);
   row.status='executing';row.claimed_at=new Date().toISOString();return Response.json(row);
  }
  if(url.pathname.endsWith('/authorize_business_action_dispatch')){
   const row=rows.get(body.p_expected.id);assert.equal(row.status,'executing');row.effect_started_at=new Date().toISOString();return Response.json(row);
  }
  if(url.pathname.endsWith('/finish_business_action_confirmation')){
   const row=rows.get(body.p_expected.id);Object.assign(row,{status:body.p_status,failure_code:body.p_failure_code,completed_at:new Date().toISOString(),
    effect_receipt:{...body.p_expected.effect_receipt,recordedAt:new Date().toISOString(),outcome:body.p_status==='consumed'?'provider_reported_success':row.effect_started_at?'dispatch_uncertain':'not_dispatched'}});return Response.json(row);
  }
  if(url.pathname.endsWith('/reserve_xroga_provider_budget')){
   if(failMode==='budget')return Response.json({message:'Insufficient provider budget',code:'P0001'},{status:400});
   assert.ok(body.p_reservation_micro_usd<=SONNET_TASK_MAXIMUM_MICRO_USD);
   assert.ok(![...reservations.values()].some(v=>v.idempotency_key===body.p_idempotency_key),'A task must not reserve twice');
   const row={id:randomUUID(),user_id:body.p_user_id,idempotency_key:body.p_idempotency_key,status:'reserved',purpose:body.p_purpose,
    internal_route:body.p_internal_route,price_version:body.p_price_version,estimated_input_tokens:body.p_estimated_input_tokens,
    maximum_output_tokens:body.p_maximum_output_tokens,reserved_micro_usd:body.p_reservation_micro_usd};reservations.set(row.id,row);return Response.json(row);
  }
  if(url.pathname.endsWith('/settle_xroga_provider_budget')){
   settlements++;const row=reservations.get(body.p_reservation_id);Object.assign(row,{status:'settled',settled_micro_usd:body.p_actual_micro_usd,provider_request_id:body.p_provider_request_id,
    actual_input_tokens:body.p_actual_input_tokens,cached_input_tokens:body.p_cached_input_tokens,output_tokens:body.p_output_tokens,reasoning_tokens:body.p_reasoning_tokens,tool_calls:body.p_tool_calls,search_calls:body.p_search_calls});return Response.json(row);
  }
  if(url.pathname.endsWith('/release_xroga_provider_budget')){assert.equal(body.p_pending_reconciliation,true);unknown++;return Response.json(null);}
  if(url.pathname.endsWith('/record_ai_usage_atomic'))return Response.json({userId:owner,receiptId:body.p_receipt_id,modelId:body.p_model_id,poolRole:body.p_pool_role,inputTokens:body.p_input,outputTokens:body.p_output,costUsd:body.p_cost_usd,ledgerId:'1',period:new Date().toISOString().slice(0,7)+'-01',replayed:false,usage:{user_id:owner}});
  if(url.pathname.endsWith('/user_token_usage'))return Response.json({user_id:owner,plan_tier:'spark',plan_budget_usd:20,quota_period_start:new Date().toISOString().slice(0,7)+'-01',input_tokens:0,output_tokens:0,spent_usd:0,rollover_usd:0,model_usage:{}});
  if(url.pathname.endsWith('/model_provider_health'))return Response.json(null);
  throw Error('Unexpected offline fixture URL '+url.pathname);
 });
 const messages=[{role:'system' as const,content:'Review only. No actions are authorized.'},{role:'user' as const,content:'Use Sonnet to debug this complex multi-file concurrency race condition.'}];
 const workspacePlan=await planSemanticRequest({userId:owner,tenantContext:context,message:messages[1].content,history:['USER: The failure is a concurrency regression.','ASSISTANT: Inspect the transaction boundary.']});
 assert.equal(workspacePlan.dispatch,'chat');assert.deepEqual(workspacePlan.capabilityIds,['conversation.respond']);
 assert.match(workspacePlan.directResponse!,/separate capped spending approval/);
 const pending={confirmationId:workspacePlan.directResponse!.match(/\/confirm\/([a-f0-9-]{36})/)![1]};
 assert.equal(effects,0);assert.equal(rows.get(pending.confirmationId).status,'pending');
 await assert.rejects(confirmBusinessAction(createTenantContext({userId:foreign,via:'remote_getuser'}),pending.confirmationId));assert.equal(effects,0);
 const approved=await confirmBusinessAction(context,pending.confirmationId);
 assert.equal(effects,1);assert.equal(settlements,1);assert.equal(storageWrites,1);assert.equal(approved.confirmation.status,'consumed');
 // Simulate loss of the initial HTTP response. A fresh owner-scoped lookup
 // reads the durable receipt and private object, without another dispatch.
 const reopened=await getBusinessActionConfirmation(owner,pending.confirmationId);
 const saved=await readModelResult(context,reopened);
 assert.match(saved!.text,/transaction boundary/);assert.equal(saved!.receiptId,pending.confirmationId);
 await assert.rejects(confirmBusinessAction(context,pending.confirmationId));assert.equal(effects,1);
 const cancelled=await prepareSonnetApproval(scope,messages);rows.get(cancelled.confirmationId).status='cancelled';
 await assert.rejects(confirmBusinessAction(context,cancelled.confirmationId));assert.equal(effects,1);
 const tampered=await prepareSonnetApproval(scope,messages),bad=rows.get(tampered.confirmationId);
 bad.plan.arguments.target.payload.messages[1].content+=' Changed target';bad.plan.planDigest=actionPlanDigest(bad.plan);bad.plan_digest=bad.plan.planDigest;
 await assert.rejects(confirmBusinessAction(context,tampered.confirmationId));assert.equal(effects,1,'A recomputed public digest cannot replace the sealed preparation proof');
 await assert.rejects(prepareSonnetApproval(scope,[messages[0],{...messages[1],content:messages[1].content+'x'.repeat(40_000)}]));assert.equal(effects,1);
 const deniedBudget=await prepareSonnetApproval(scope,messages);failMode='budget';
 await assert.rejects(confirmBusinessAction(context,deniedBudget.confirmationId));assert.equal(effects,1,'A stored approval cannot replace budget admission');
 failMode='';const storageFailure=await prepareSonnetApproval(scope,messages);failMode='storage';
 await assert.rejects(confirmBusinessAction(context,storageFailure.confirmationId));assert.equal(effects,2);assert.equal(settlements,2);
 await assert.rejects(confirmBusinessAction(context,storageFailure.confirmationId));assert.equal(effects,2,'A paid result publication failure must never create a replay');
 assert.equal(await readModelResult(context,(await getBusinessActionConfirmation(owner,storageFailure.confirmationId))!),null);
 failMode='';
 const uncertain=await prepareSonnetApproval(scope,messages);failMode='drop';
 await assert.rejects(confirmBusinessAction(context,uncertain.confirmationId));assert.equal(effects,3);assert.equal(unknown,1);
 await assert.rejects(confirmBusinessAction(context,uncertain.confirmationId));assert.equal(effects,3,'Unknown dispatch must not be replayed after restart');
});
