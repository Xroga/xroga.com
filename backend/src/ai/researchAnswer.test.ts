import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {researchAnswerRequestSchema,RESEARCH_ANSWER_MAXIMUM_MICRO_USD,researchCitationIssues,bindCitationLinks} from './researchAnswer.js';
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
import {workspacePublicSearchQuery} from './workspacePublicSearch.js';

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
 const env={NODE_ENV:'test',SUPABASE_URL:'http://127.0.0.1:55437',SUPABASE_SERVICE_ROLE_KEY:'synthetic-loopback',DEEPSEEK_WEBSEARCH_FETCH_API:'synthetic-retrieval',ZURELAY_API_KEY:'synthetic-model',ZURELAY_STREAM_USAGE_VERIFIED:'1',
  XROGA_NATIVE_OPENUI_WORKSPACE:'0',XROGA_DEPLOYMENT_ENVIRONMENT:'staging'};
 const before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 const storage=harness(),confirmation=nativeReleaseFixture(owner),reservations=new Map<string,any>();setStorageServiceForTests(storage.svc);
 t.after(()=>{setStorageServiceForTests(undefined);for(const k of Object.keys(env)){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}});
 let searches=0,models=0,unknown=0,mode='ok';
 let automaticAuditCount=0;
 const unrelatedHistory='Earlier NASA mission discussion UNRELATED_PRIOR_NASA_TURN';
 const raw=JSON.stringify({s0:{markdown:'The retrieved page documents the supplied option [1].',data:{columns:['Option','Evidence'],rows:[['Documented option','Public source excerpt [1]']]}}});
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input)),body=init?.body?JSON.parse(String(init.body)):{};
  if(url.origin==='https://api.deepseek.com'&&url.pathname==='/v1/tools/search'){
   searches++;assert.equal(init?.redirect,'manual');assert.ok(!JSON.stringify(body).includes('answerRequest'));
   if(mode.startsWith('automatic')){
    if(mode==='automatic-official'){
      assert.deepEqual(Object.keys(body).sort(),['count','query']);
      assert.equal(body.count,10);
      assert.match(body.query,/difference between solar and lunar eclipses/);
      assert.match(body.query,/ site:nasa\.gov$/);
      assert.ok([...body.query].length<=128);
    }else assert.deepEqual(body,{query:'price of btc currently',count:10});
    assert.doesNotMatch(JSON.stringify(body),/UNRELATED_PRIOR|MUST_NOT_LEAVE|substituted planner context|evil.example/);
   }
   const results=mode==='automatic-no-sources'?[]:[
    ...(mode==='automatic-official'?[{title:'NASA Eclipses',url:'https://science.nasa.gov/eclipses/',summary:'Public source excerpt',
      site_name:'NASA Science',site_icon:'https://cdn.deepseek.com/site-icons/science.nasa.gov'}]:[]),
    {title:'Public documentation',url:'https://example.com/docs',summary:'Public source excerpt',
     site_name:'Example Exchange',site_icon:'https://cdn.deepseek.com/site-icons/example.com'},
    {title:'Same page',url:'https://example.com/docs#section',summary:'Public source excerpt'},
   ];
   return Response.json({results},{headers:{'x-ds-trace-id':'synthetic-search-'+searches}});
  }
  if(url.origin==='https://api.zurelay.com'){
   models++;assert.equal(body.model,'deepseek-v4.1-flash-1017');assert.equal(new Headers(init?.headers).get('x-zurelay-fallback'),'off');
   assert.match(JSON.stringify(body.messages),/Public source excerpt/);assert.match(JSON.stringify(body.messages),/untrusted|external data/i);
   if(mode==='automatic'||mode==='automatic-official'){
    assert.doesNotMatch(JSON.stringify(body.messages),/MUST_NOT_LEAVE|substituted planner context/);
    assert.match(JSON.stringify(body.messages),/UNRELATED_PRIOR_NASA_TURN/);
    assert.equal(body.messages.length,3);
    assert.match(body.messages[0].content,/<<<XROGA_OPENUI_V1>>>/);
   }else{
    assert.equal(body.max_tokens,4096);
    assert.ok(['json_object','json_schema'].includes(body.response_format.type));
   }
   if(mode==='drop')throw Object.assign(Error('Synthetic dispatch uncertainty'),{name:'AbortError'});
   const sse='data: '+JSON.stringify({id:'synthetic-answer-'+models,model:body.model,
    choices:[{index:0,delta:{content:mode.startsWith('automatic')?'The public page documents the answer [1](https://wrong.example/page).':raw},finish_reason:'stop'}],
    usage:{prompt_tokens:100,completion_tokens:40,total_tokens:140}})+'\n\ndata: [DONE]\n\n';
   return new Response(sse,{headers:{'content-type':'text/event-stream','x-request-id':'synthetic-answer-'+models,'x-zurelay-model':body.model}});
  }
  assert.equal(url.origin,env.SUPABASE_URL,'All network is synthetic and bounded');
  if(url.pathname.endsWith('/user_token_usage'))return Response.json({user_id:owner,plan_tier:'spark',plan_budget_usd:20,quota_period_start:new Date().toISOString().slice(0,7)+'-01',input_tokens:0,output_tokens:0,spent_usd:0,rollover_usd:0,model_usage:{}});
  if(url.pathname.endsWith('/model_provider_health'))return Response.json(null);
  if(url.pathname.endsWith('/reserve_xroga_provider_budget')){
   assert.ok(body.p_reservation_micro_usd<=(body.p_internal_route.startsWith('web.')?750:RESEARCH_ANSWER_MAXIMUM_MICRO_USD));
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
  if(url.pathname.endsWith('/production_audit_log')&&mode.startsWith('automatic')){
   assert.equal(body.metadata.classification,'PUBLIC');
   assert.equal(body.outcome,'ALLOW');
   assert.equal(body.user_id,owner);
   assert.doesNotMatch(JSON.stringify(body),/NASA|price of btc|substituted planner context/);
   automaticAuditCount++;
   if(mode==='automatic-audit-failure')return Response.json({message:'synthetic unavailable'},{status:503});
  }
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
 assert.equal(confirmation.row!.plan.authority!.maxSpendMicroUsd,'5750');assert.match(String(confirmation.row!.summary),/ONE DeepSeek answer/);
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

 const currentPrompt='price of btc currently';
 const currentGoal=goalContractSchema.parse({...goal,goal:'substituted planner context',desiredOutcome:'substituted planner context',
  requiredCapabilities:['conversation.respond']});
 const automaticRequest={userId:owner,tenantContext:context,prompt:currentPrompt,goalContract:currentGoal,autoPublicSearch:true as const,
  history:[{role:'user' as const,content:unrelatedHistory},{role:'assistant' as const,content:'SYNTHETIC_CREDENTIAL_MUST_NOT_LEAVE'}]};
 const confirmedRow=confirmation.row;
 process.env.XROGA_NATIVE_OPENUI_WORKSPACE='1';
 mode='automatic';
 const automatic=await runChatPipeline(automaticRequest);
 assert.equal(automatic.publicWebRetrieved,true);assert.equal(automatic.intent,'research');
 assert.equal(automatic.webSources?.[0]?.siteName,'Example Exchange');assert.equal(automatic.webSources?.[0]?.siteIconDomain,'example.com');
 assert.equal(automatic.responseSource?.format,'xroga-openui-v1');
 assert.match(automatic.response,/https:\/\/example.com\/docs/);assert.doesNotMatch(automatic.response,/wrong.example|Review action/);
 assert.equal(searches,4);assert.equal(models,3);assert.equal(automaticAuditCount,1);assert.equal(confirmation.row,confirmedRow);
 const automaticSearch=[...reservations.values()].find(row=>row.provider_request_id==='synthetic-search-4');
 assert.equal(automaticSearch?.settled_micro_usd,750);assert.equal(automaticSearch?.search_calls,1);

 mode='ok';
 const privatePending=await runChatPipeline({...automaticRequest,history:[],prompt:'Search my confidential client notes for latest account details'});
 assert.equal(privatePending.intent,'confirmation_required');assert.equal(privatePending.publicWebRetrieved,undefined);
 assert.equal(confirmation.row?.plan.authority?.actionClass,'SENSITIVE_DATA_EXPORT');
 assert.equal(searches,4);assert.equal(models,3);

 mode='automatic-no-sources';
 await assert.rejects(runChatPipeline(automaticRequest),{code:'TOOL_UNAVAILABLE'});
 assert.equal(searches,5);assert.equal(models,3);assert.equal(automaticAuditCount,2);
 const emptySearch=[...reservations.values()].find(row=>row.provider_request_id==='synthetic-search-5');
 assert.equal(emptySearch?.settled_micro_usd,0);assert.equal(emptySearch?.search_calls,1);

 mode='automatic-audit-failure';const beforeDeniedReservation=reservations.size;
 await assert.rejects(runChatPipeline(automaticRequest));
 assert.equal(searches,5);assert.equal(models,3);assert.equal(reservations.size,beforeDeniedReservation);
 const abort=new AbortController();abort.abort();
 await assert.rejects(runChatPipeline({...automaticRequest,autoPublicSearchSignal:abort.signal}));
 assert.equal(searches,5);assert.equal(models,3);assert.equal(reservations.size,beforeDeniedReservation);

 mode='automatic-official';
 const nasaPrompt='Search the web using only official NASA sources (nasa.gov). Explain the difference between solar and lunar eclipses, why they don’t happen every month, and cite the NASA pages inline beside the claims.';
 const nasaGoal=goalContractSchema.parse({...currentGoal,sourcePolicy:{mode:'official_only',scope:'public_web',officialDomains:['evil.example']}});
 const nasa=await runChatPipeline({...automaticRequest,prompt:nasaPrompt,goalContract:nasaGoal});
 assert.equal(nasa.publicWebRetrieved,true);assert.equal(nasa.webSources?.length,1);
 assert.equal(nasa.webSources?.[0]?.siteIconDomain,'science.nasa.gov');
 assert.match(nasa.response,/https:\/\/science.nasa.gov\/eclipses\//);
 assert.equal(searches,6);assert.equal(models,4);

 const heldBeforeStorage=reservations.size, auditsBeforeStorage=automaticAuditCount;
 setStorageServiceForTests(undefined);
 try { await assert.rejects(runChatPipeline(automaticRequest),{code:'PROVIDER_UNAVAILABLE'}); }
 finally { setStorageServiceForTests(storage.svc); }
 assert.equal(searches,6);assert.equal(models,4);
 assert.equal(automaticAuditCount,auditsBeforeStorage);assert.equal(reservations.size,heldBeforeStorage);
});

test('automatic Search eligibility uses only the current public lookup with ambiguous inputs held for review',()=>{
 assert.deepEqual(workspacePublicSearchQuery('price of btc currently'),{query:'price of btc currently',officialDomains:[]});
 assert.deepEqual(workspacePublicSearchQuery('Research the latest NASA lunar mission schedule.'),
  {query:'the latest NASA lunar mission schedule',officialDomains:[]});
 for(const prompt of ['Current notes in my inbox','What is the latest private customer list',
  'Search the web for John Smith','Who is Jane Doe currently working for',
  'Search for name associated with 123-45-6789','Search the latest details on https://example.org/query',
  'Search the web using only official sources (edge.local). Explain the public topic.',
  'Search the web using only official sources (staging.example.com). Explain a public topic.',
  'Search latest NASA data from wikipedia.org',
  'Search realistic explanations of lunar phases and eclipses using orbital geometry and the distance to the moon throughout the year. Here is the customer account number 123-45-6789.',
  'Search earlier chat for confidential data','Do not search the web for the current exchange rate',
  'Explain photosynthesis','Search the web for'])assert.equal(workspacePublicSearchQuery(prompt),undefined,prompt);
});

test('citation links always point at the retrieved source they number, never at a model-written address',()=>{
 const sources=[{url:'https://nextjs.org/blog/next-16'},{url:'https://github.com/vercel/next.js/releases'}];
 const out=bindCitationLinks('See [1](https://evil.example/x) and [2](<https://github.com/vercel/next.js/releases?x=1>), also [3](https://other.example/y).\n```\n[1](https://keep.example/code)\n```\n',sources);
 assert.match(out,/\[1\]\(https:\/\/nextjs\.org\/blog\/next-16\)/);
 assert.match(out,/\[2\]\(https:\/\/github\.com\/vercel\/next\.js\/releases\)/);
 assert.match(out,/\[3\]\(https:\/\/other\.example\/y\)/,'a number with no retrieved source is left alone');
 assert.match(out,/```\n\[1\]\(https:\/\/keep\.example\/code\)\n```/,'fenced code is never rewritten');
 assert.deepEqual(researchCitationIssues(bindCitationLinks('Claim [1](https://wrong.example) and [2].',sources),sources),[]);
 const code='Use `[1](https://keep.example/code)` and ``example `[77]` [1](https://keep.example/more)``.';
 const withInlineCode=bindCitationLinks('Claim [1](https://wrong.example). '+code,sources);
 assert.equal(withInlineCode,'Claim [1](https://nextjs.org/blog/next-16). '+code);
 assert.deepEqual(researchCitationIssues(withInlineCode,sources),[]);
 assert.ok(researchCitationIssues(bindCitationLinks('Claim [3](https://wrong.example).',sources),sources).includes('mismatched-source:3'),'an unmatched number is still reported');
});
