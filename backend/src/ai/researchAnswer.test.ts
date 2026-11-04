import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {researchAnswerRequestSchema,RESEARCH_ANSWER_MAXIMUM_MICRO_USD,researchCitationIssues} from './researchAnswer.js';
import {runChatPipeline} from './pipeline.js';
import {goalContractSchema} from './universal/goalContract.js';
import {confirmBusinessAction,getBusinessActionConfirmation} from '../services/integrations/businessActionConfirmations.js';
import {readResearchResult} from '../services/integrations/researchResult.js';
import {createTenantContext} from '../security/tenantContext.js';
import {nativeReleaseFixture} from '../services/publish/__tests__/nativeReleaseFixture.js';
import {harness} from '../storage/testing/harness.js';
import {setStorageServiceForTests} from '../storage/runtime.js';
import {actionPlanDigest} from '../services/integrations/businessAction.js';
import {presentResearchResult} from '../services/integrations/researchResult.js';

test('research attribution binds canonical pages without treating code or chart arrays as citations',()=>{
 const sources=[{url:'https://example.com/docs'},{url:'https://example.com/other'}];
 assert.deepEqual(researchCitationIssues('Supported statement [1]. Another statement [2].',sources),[]);
 assert.deepEqual(researchCitationIssues('[1](https://example.com/docs#heading)',sources),[]);
 assert.deepEqual(researchCitationIssues('[1](https://example.com/not-retrieved)',sources),['mismatched-source:1','missing-source-attribution']);
 assert.deepEqual(researchCitationIssues('Unsupported claim [3].',sources),['unresolved-source:3','missing-source-attribution']);
 assert.deepEqual(researchCitationIssues('Supported [1].\n```ts\narray[99]\n```\n```xroga-ui\n{"type":"chart","values":[99],"summary":"Documented [2]"}\n```',sources),[]);
 assert.deepEqual(researchCitationIssues('No citations supplied.',sources),['missing-source-attribution']);
});

test('one exact research approval completes its original rich answer, saves evidence and cannot replay either provider',async t=>{
 const owner='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222';
 const context=createTenantContext({userId:owner,via:'remote_getuser'});
 const env={NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55437',SUPABASE_SERVICE_ROLE_KEY:'synthetic-loopback',PARALLEL_API_KEY:'synthetic-retrieval',ZURELAY_API_KEY:'synthetic-model'};
 const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const storage=harness(),confirmation=nativeReleaseFixture(owner),reservations=new Map<string,any>();setStorageServiceForTests(storage.svc);
 t.after(()=>{setStorageServiceForTests(undefined);for(const k of Object.keys(env)){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}});
 let searches=0,models=0,unknown=0,mode='ok';
 const raw=JSON.stringify({s0:{markdown:'The retrieved page documents the supplied option [1].',data:{columns:['Option','Evidence'],rows:[['Documented option','Public source excerpt [1]']]}}});
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input)),body=init?.body?JSON.parse(String(init.body)):{};
  if(url.origin==='https://api.parallel.ai'){
   searches++;assert.equal(init?.redirect,'manual');assert.ok(!JSON.stringify(body).includes('answerRequest'));
   return Response.json({search_id:'synthetic-search-'+searches,results:[{title:'Public documentation',url:'https://example.com/docs',excerpts:['Public source excerpt']},{title:'Same page',url:'https://example.com/docs#section',excerpts:['Public source excerpt']}]});
  }
  if(url.origin==='https://api.zurelay.com'){
   models++;assert.equal(body.model,'deepseek-v4.1-flash-1017');assert.equal(body.max_tokens,4096);assert.equal(new Headers(init?.headers).get('x-zurelay-fallback'),'off');
   assert.match(JSON.stringify(body.messages),/Public source excerpt/);assert.match(JSON.stringify(body.messages),/untrusted|external data/i);
   assert.ok(['json_object','json_schema'].includes(body.response_format.type));
   if(mode==='drop')throw Object.assign(Error('Synthetic dispatch uncertainty'),{name:'AbortError'});
   const sse='data: '+JSON.stringify({id:'synthetic-answer-'+models,model:body.model,choices:[{index:0,delta:{content:raw},finish_reason:'stop'}],usage:{prompt_tokens:100,completion_tokens:40,total_tokens:140}})+'\n\ndata: [DONE]\n\n';
   return new Response(sse,{headers:{'content-type':'text/event-stream','x-request-id':'synthetic-answer-'+models,'x-zurelay-model':body.model}});
  }
  assert.equal(url.origin,env.SUPABASE_URL,'All network is synthetic and bounded');
  if(url.pathname.endsWith('/user_token_usage'))return Response.json({user_id:owner,plan_tier:'spark',plan_budget_usd:20,quota_period_start:new Date().toISOString().slice(0,7)+'-01',input_tokens:0,output_tokens:0,spent_usd:0,rollover_usd:0,model_usage:{}});
  if(url.pathname.endsWith('/model_provider_health'))return Response.json(null);
  if(url.pathname.endsWith('/reserve_xroga_provider_budget')){
   assert.ok(body.p_reservation_micro_usd<=(body.p_internal_route.startsWith('web.')?1000:RESEARCH_ANSWER_MAXIMUM_MICRO_USD));
   const row={id:randomUUID(),user_id:owner,idempotency_key:body.p_idempotency_key,status:'reserved',purpose:body.p_purpose,internal_route:body.p_internal_route,price_version:body.p_price_version,
    estimated_input_tokens:body.p_estimated_input_tokens,maximum_output_tokens:body.p_maximum_output_tokens,reserved_micro_usd:body.p_reservation_micro_usd};reservations.set(row.id,row);
   if(mode==='cancel-at-model-reservation'&&!body.p_internal_route.startsWith('web.'))confirmation.row!.status='cancelled';
   return Response.json(row);
  }
  if(url.pathname.endsWith('/settle_xroga_provider_budget')){
   const row=reservations.get(body.p_reservation_id);Object.assign(row,{status:'settled',settled_micro_usd:body.p_actual_micro_usd,provider_request_id:body.p_provider_request_id,
    actual_input_tokens:body.p_actual_input_tokens,cached_input_tokens:body.p_cached_input_tokens,output_tokens:body.p_output_tokens,reasoning_tokens:body.p_reasoning_tokens,tool_calls:body.p_tool_calls,search_calls:body.p_search_calls});return Response.json(row);
  }
  if(url.pathname.endsWith('/release_xroga_provider_budget')){
   if(mode==='cancel-at-model-reservation')assert.equal(body.p_pending_reconciliation,false);else{assert.equal(body.p_pending_reconciliation,true);unknown++;}
   return Response.json(null);
  }
  if(url.pathname.endsWith('/record_ai_usage_atomic'))return Response.json({userId:owner,receiptId:body.p_receipt_id,modelId:body.p_model_id,poolRole:body.p_pool_role,inputTokens:body.p_input,outputTokens:body.p_output,costUsd:body.p_cost_usd,ledgerId:'1',period:new Date().toISOString().slice(0,7)+'-01',replayed:false,usage:{user_id:owner}});
  if(url.pathname.endsWith('/xroga_web_usage'))return new Response(null,{status:201});
  const response=await confirmation.database(url,init);if(response)return response;
  throw Error('Unexpected fixture request '+url.pathname);
 });
 const prompt='Show a table of documented options with citations.';
 const goal=goalContractSchema.parse({version:'1.0',goal:prompt,desiredOutcome:prompt,semanticIntent:'INVESTIGATE',requiredCapabilities:['conversation.respond','research.public-web'],requiredAuthorities:[],
  freshnessRequirement:'CURRENT_REQUIRED',sourcePolicy:{mode:'any',scope:'public_web',officialDomains:[]},confidence:1,blockers:[]});
 assert.equal(researchAnswerRequestSchema.safeParse({prompt,goalContract:{...goal,semanticIntent:'EXTERNAL_ACTION'}}).success,false);
 assert.equal(researchAnswerRequestSchema.safeParse({prompt,goalContract:{...goal,requiredCapabilities:[...goal.requiredCapabilities,'repository.read']},projectEvidence:'Authorized read-only repository snapshot'}).success,true);
 const pending=await runChatPipeline({userId:owner,tenantContext:context,prompt,goalContract:goal});
 assert.equal(pending.intent,'confirmation_required');assert.equal(searches,0);assert.equal(models,0);
 const id=confirmation.row!.id;
 assert.equal(confirmation.row!.plan.authority!.maxSpendMicroUsd,'6000');assert.match(String(confirmation.row!.summary),/ONE DeepSeek answer/);
 await assert.rejects(confirmBusinessAction(createTenantContext({userId:foreign,via:'remote_getuser'}),id));assert.equal(searches,0);
 await confirmBusinessAction(context,id);assert.equal(searches,1);assert.equal(models,1);assert.equal(unknown,0);
 const saved=await readResearchResult(context,await getBusinessActionConfirmation(owner,id));
 assert.ok(saved?.answer,JSON.stringify(saved));assert.equal(saved.sources.length,1);assert.equal(saved.answer.completion.status,'complete');
 assert.match(saved.answer.response,/xroga-ui/);assert.equal(saved.answer.responseSource?.text,raw);assert.equal(saved.answer.webSources.length,1);
 await assert.rejects(confirmBusinessAction(context,id));assert.equal(searches,1);assert.equal(models,1);
 // Reopening independently reads the private stored answer, not a provider.
 assert.deepEqual(await readResearchResult(context,await getBusinessActionConfirmation(owner,id)),saved);
 assert.equal(searches,1);assert.equal(models,1);
 mode='drop';await runChatPipeline({userId:owner,tenantContext:context,prompt,goalContract:goal});const uncertain=confirmation.row!.id;
 await confirmBusinessAction(context,uncertain);assert.equal(searches,2);assert.equal(models,2);assert.equal(unknown,1);
 const failed=await readResearchResult(context,await getBusinessActionConfirmation(owner,uncertain));
 assert.equal(failed?.answerFailure,'SYNTHESIS_UNAVAILABLE');assert.equal(failed?.sources.length,1);assert.equal(failed?.answer,undefined);
 await assert.rejects(confirmBusinessAction(context,uncertain));assert.equal(searches,2);assert.equal(models,2);
 mode='ok';const held=reservations.size;
 await assert.rejects(runChatPipeline({userId:owner,tenantContext:context,prompt,goalContract:goal,modelScope:{context,userId:owner,connectedAccountId:'platform',maximumCostMicroUsd:1},
  approvedResearch:{bundle:{query:prompt,summary:'Retrieved data',provider:'parallel',sources:saved.answer.webSources},evidence:'Untrusted retrieved data'}}));
 assert.equal(models,2);assert.equal(reservations.size,held,'A restrictive synthesis cap must fail before reservation and HTTP');
 await runChatPipeline({userId:owner,tenantContext:context,prompt,goalContract:goal});const changed=confirmation.row!;
 changed.plan.arguments.answerRequest={...(changed.plan.arguments.answerRequest as object),prompt:'A substituted original request'};
 changed.plan.planDigest=actionPlanDigest(changed.plan);changed.plan_digest=changed.plan.planDigest;
 await assert.rejects(confirmBusinessAction(context,changed.id));assert.equal(searches,2);assert.equal(models,2);
 await runChatPipeline({userId:owner,tenantContext:context,prompt,goalContract:goal});const revoked=confirmation.row!.id;mode='cancel-at-model-reservation';
 await assert.rejects(confirmBusinessAction(context,revoked));assert.equal(searches,3);assert.equal(models,2,'Revalidate original claim after budget wait, immediately before model bytes');
 const forged=presentResearchResult({ok:true,operation:'search',result:{results:[{url:'https://example.com/docs',title:'Actual source',excerpts:['Actual excerpt']}]},
  answer:{...saved.answer,webSources:[{...saved.answer.webSources[0],url:'https://unretrieved.example/page'}]}});
 assert.equal(forged.answer,undefined);assert.equal(forged.answerFailure,'INVALID_SAVED_ANSWER');assert.equal(forged.sources.length,1);
 mode='ok';const reservedBeforeSecret=reservations.size;
 await assert.rejects(runChatPipeline({userId:owner,tenantContext:context,prompt,goalContract:goal,
  history:[{role:'user',content:'SYNTHETIC_CREDENTIAL_CANARY_MUST_NOT_LEAVE'}]}));
 assert.equal(searches,3);assert.equal(models,2);assert.equal(reservations.size,reservedBeforeSecret,'Credential-bearing continuation context cannot acquire approval or dispatch');
});
