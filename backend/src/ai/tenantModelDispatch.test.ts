import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTenantContext} from '../security/tenantContext.js';
import {runtimeCredentialVault} from '../services/integrations/credentialVaultRuntime.js';
import {withTenantModelReservation,type TenantModelScope} from './tenantModelDispatch.js';
import {chatCompletion,chatCompletionStream,type ChatMessage} from './openaiCompat.js';
import {callBuilderStream,runChatPipeline} from './pipeline.js';
import {goalContractSchema} from './universal/goalContract.js';
import {presentationResponseFormat,type PresentationPlan} from './responsePresentation.js';
import {runArchitectPlan} from './architect.js';
import {convertUserRequest} from './converter.js';
import {createXrogaAgentModel} from './softwareAgent/xrogaAgentModel.js';
import {executeWithProviderFallback,resetModelRuntimeHealth} from './providerRuntime.js';
import {executeAuthorizedAction} from '../security/authority/enforce.js';
import {preparedActionDigest} from '../security/authority/digest.js';
import type {PreparedAuthorityScope} from '../security/authority/types.js';
import {DEFAULT_BUILDER_BUDGET} from './builderAttempt.js';
import {withRunAttempt,createRunDurable,captureAdmittedRunAttempt} from './runStore.js';

test('actual pipeline, completion and SoftwareAgent calls bind tenant, account revision, payload and canonical reservation',async t=>{
  const env={SUPABASE_URL:'http://127.0.0.1:55437',SUPABASE_SERVICE_ROLE_KEY:'synthetic-loopback-only',NODE_ENV:'test',
    ZURELAY_API_KEY:'synthetic-platform-key',ZURELAY_JSON_SCHEMA_VERIFIED:'1',ZURELAY_STREAM_USAGE_VERIFIED:'1',
    XROGA_NATIVE_OPENUI_WORKSPACE:'0',XROGA_DEPLOYMENT_ENVIRONMENT:'staging'};
  const old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
  t.after(()=>{for(const k of Object.keys(env)){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}});
  const owner='11111111-1111-4111-8111-111111111111',foreign='22222222-2222-4222-8222-222222222222',project='33333333-3333-4333-8333-333333333333';
  const context=createTenantContext({userId:owner,via:'remote_getuser'}),revision=randomUUID();
  const metadata={type:'user_api_key',vault_revision:randomUUID()};
  const token=await runtimeCredentialVault().seal(context,{tenant:owner,owner,provider:'zurelay',account:'apikey_zurelay',credentialType:'user_api_key',
    recordId:'apikey_zurelay',revision:metadata.vault_revision,scope:'user-provider-key'},'synthetic-user-current');
  const original={user_id:owner,provider:'apikey_zurelay',access_token:token,metadata,credential_revision:revision};
  let row=structuredClone(original),mode='ok',ownerNow=owner,credentialReads=0,projectReads=0,effects=0;
  const reservations=new Map<string,Record<string,unknown>>(),releases:Array<Record<string,unknown>>=[];
  let mutate:(()=>void)|undefined,expire:(()=>void)|undefined;
  let executionRow:Record<string,unknown>|undefined;
  let atomicReceipts=0;
  let receivedAnswer = '';
  let lastReservedInput = 0;
  let abortDuringResponse:AbortController|undefined;
  const reset=(next='ok')=>{mode=next;row=structuredClone(original);ownerNow=owner;credentialReads=0;projectReads=0;mutate=undefined;expire=undefined;};
  const stringify=JSON.stringify;
  t.mock.method(JSON,'stringify',((value:unknown,...args:unknown[])=>{
    if(mode==='mutatedAgentWire'&&value&&typeof value==='object'&&'model' in value&&'messages' in value){
      value={...value,messages:[{role:'user',content:'foreign source substituted after SDK serialization'}]};
    }
    if(mode==='mutatedSchema'&&value&&typeof value==='object'&&'model' in value&&'response_format' in value){
      value={...value,response_format:{type:'json_object'}};
    }
    return Reflect.apply(stringify,JSON,[value,...args]);
  }) as typeof JSON.stringify);
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
    const url=new URL(String(input));
    if(url.origin==='https://api.zurelay.com'){
      effects++;const body=JSON.parse(String(init?.body));assert.doesNotMatch(JSON.stringify(body),/foreign source|cached-key|SYNTHETIC_CREDENTIAL/);
      abortDuringResponse?.abort();
      assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+(!['platform503','platformPositive'].includes(mode)?'synthetic-user-current':'synthetic-platform-key'));
      assert.equal(init?.redirect,'manual');
      if(mode==='platform503'&&url.origin==='https://api.zurelay.com')return Response.json({error:{message:'Synthetic provider outage'}},{status:503});
      if(mode==='revokeDuringRetry'&&url.origin==='https://api.zurelay.com'){
        row.metadata={...row.metadata,revoked:true} as typeof row.metadata;
        return Response.json({error:{message:'Synthetic retryable outage'}},{status:503});
      }
      if(mode==='presentation') {
        assert.equal(body.response_format.type,'json_schema');
        assert.equal(body.response_format.json_schema.strict,true);
        assert.deepEqual(body.response_format.json_schema.schema.required,['s0','s1']);
      }
      if(mode==='native') {
        assert.equal(body.response_format,undefined,'Native OpenUI uses the same request, without the old JSON schema');
        assert.match(body.messages[0].content,/<<<XROGA_OPENUI_V1>>>/);
      }
      if(mode==='missingUsage')return Response.json({model:body.model,choices:[{message:{content:'must remain unpublished'},finish_reason:'stop'}]},
        {headers:{'x-request-id':'synthetic-unknown-usage','x-zurelay-model':body.model}});
      if(mode==='wrongModel')return Response.json({model:'unapproved-model',usage:{prompt_tokens:2,completion_tokens:2,total_tokens:4},choices:[]},
        {headers:{'x-request-id':'synthetic-wrong-model','x-zurelay-model':body.model}});
      if(mode==='droppedStream')return new Response('data: '+JSON.stringify({model:body.model,choices:[{delta:{content:'unconfirmed bytes'},finish_reason:null}]})+'\n\n',
        {headers:{'content-type':'text/event-stream','x-request-id':'synthetic-drop','x-zurelay-model':body.model}});
      if(body.stream)return new Response('data: '+JSON.stringify({id:'synthetic-provider-receipt',choices:[{delta:{content:['presentation','native'].includes(mode)?receivedAnswer:'owned result'},finish_reason:'stop'}],model:'deepseek-v4.1-flash-1017',usage:{prompt_tokens:2,completion_tokens:2,total_tokens:4}})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream','x-request-id':'synthetic-provider-receipt','x-zurelay-model':'deepseek-v4.1-flash-1017'}});
      return Response.json({id:'synthetic-provider-receipt',choices:[{message:{content:'{"stack":"static","files":[],"notes":[]}'},finish_reason:'stop'}],model:'deepseek-v4.1-flash-1017',usage:{prompt_tokens:2,completion_tokens:2,total_tokens:4}},{headers:{'x-request-id':'synthetic-provider-receipt','x-zurelay-model':'deepseek-v4.1-flash-1017'}});
    }
    assert.equal(url.origin,env.SUPABASE_URL,'Unexpected transport is never allowed');
    const body=init?.body?JSON.parse(String(init.body)):{};
    if(url.pathname==='/rest/v1/swarm_runs'){
      if(init?.method==='POST')return new Response(null,{status:201});
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
      return Response.json(executionRow);
    }
    if(url.pathname==='/rest/v1/projects'){
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner);assert.equal(url.searchParams.get('id'),'eq.'+project);projectReads++;
      if(mode==='revokeAtWire'&&projectReads===2)row.metadata={...row.metadata,revoked:true} as typeof row.metadata;
      return Response.json(ownerNow===owner?{id:project}:null);
    }
    if(url.pathname==='/rest/v1/user_integrations'){
      assert.equal(url.searchParams.get('user_id'),'eq.'+owner);assert.equal(url.searchParams.get('provider'),'eq.apikey_zurelay');credentialReads++;
      if(mode==='projectAtWire'&&credentialReads===5)ownerNow=foreign;
      return Response.json(mode==='foreignCredential'?{...row,user_id:foreign}:row);
    }
    if(url.pathname==='/rest/v1/user_token_usage'){
      mutate?.();mutate=undefined;
      return Response.json({user_id:owner,plan_tier:'spark',plan_budget_usd:20,quota_period_start:new Date().toISOString().slice(0,7)+'-01',input_tokens:0,output_tokens:0,spent_usd:0,rollover_usd:0,model_usage:{}});
    }
    if(url.pathname==='/rest/v1/model_provider_health')return Response.json(null);
    if(url.pathname.endsWith('/reserve_xroga_provider_budget')){
      lastReservedInput = body.p_estimated_input_tokens;
      assert.equal(body.p_user_id,owner);
      const r={id:randomUUID(),user_id:mode==='reservationMismatch'?foreign:owner,status:'reserved',idempotency_key:body.p_idempotency_key,internal_route:body.p_internal_route,
        purpose:body.p_purpose,price_version:body.p_price_version,estimated_input_tokens:body.p_estimated_input_tokens,maximum_output_tokens:body.p_maximum_output_tokens,reserved_micro_usd:body.p_reservation_micro_usd};
      reservations.set(r.id,r);
      if(mode==='rotateAtBudget')row.credential_revision=randomUUID();
      if(mode==='staleRunAtBudget')executionRow={...executionRow,lease_generation:randomUUID()};
      expire?.();return Response.json(r);
    }
    if(url.pathname.endsWith('/settle_xroga_provider_budget')){
      const r=reservations.get(body.p_reservation_id);assert.ok(r);assert.equal(body.p_user_id,r.user_id);
      if(mode==='accountingFailure')return Response.json({message:'synthetic settlement refusal'},{status:400});
      return Response.json({...r,status:'settled',settled_micro_usd:body.p_actual_micro_usd,provider_request_id:body.p_provider_request_id,
        actual_input_tokens:body.p_actual_input_tokens,cached_input_tokens:body.p_cached_input_tokens,output_tokens:body.p_output_tokens,
        reasoning_tokens:body.p_reasoning_tokens,tool_calls:body.p_tool_calls,search_calls:body.p_search_calls});
    }
    if(url.pathname.endsWith('/release_xroga_provider_budget')){releases.push(body);return Response.json(null);}
    if(url.pathname.endsWith('/record_ai_usage_atomic')){
      atomicReceipts++;
      return Response.json({userId:mode==='foreignAtomicReceipt'?foreign:owner,receiptId:body.p_receipt_id,modelId:body.p_model_id,poolRole:body.p_pool_role,inputTokens:body.p_input,
        outputTokens:body.p_output,costUsd:body.p_cost_usd,ledgerId:'1',period:new Date().toISOString().slice(0,7)+'-01',replayed:false,usage:{user_id:owner}});
    }
    assert.ok(['/rest/v1/rpc/increment_user_token_usage','/rest/v1/rpc/merge_user_model_usage','/rest/v1/rpc/insert_ai_usage_ledger'].includes(url.pathname));return Response.json(null);
  });
  const scope:TenantModelScope={context,userId:owner,projectId:project,connectedAccountId:'apikey_zurelay'};
  const messages:ChatMessage[]=[{role:'user',content:'owned source'}];
  const complete=(selected=scope,alter=false)=>withTenantModelReservation({scope:selected,modelId:'deepseek_v4_1_flash_1017',payload:{messages},estimatedInputTokens:10,maximumOutputTokens:64,
    execute:d=>chatCompletion('deepseek_v4_1_flash_1017',alter?[{role:'user',content:'foreign source'}]:d.payload.messages as ChatMessage[],
      {maxTokens:64,credentialOverride:d.credentialOverride,beforeDispatch:d.beforeDispatch})});
  const builder=()=>callBuilderStream('deepseek_v4_1_flash_1017',messages,{userId:owner,tenantContext:context,databaseProjectId:project,maxTokens:64,
    credentialOverrides:{deepseek_v4_1_flash_1017:'never-forward-cached-key'},maxAttempts:1});
  const connectedAgent=async()=>{
    const bound=createXrogaAgentModel({userId:owner,modelId:'deepseek_v4_1_flash_1017',dispatchScope:scope,maximumOutputTokens:1024});
    for await(const _ of await bound.stream({systemPrompt:'owned system',messages:[{role:'user',content:[{type:'text',text:'owned source'}]}],
      tools:[{name:'read_file',description:'Read owned project text',inputSchema:{type:'object',properties:{path:{type:'string',description:undefined}}}}]} as Parameters<typeof bound.stream>[0])){}
  };
  await complete();assert.equal(effects,1);
  reset();await callBuilderStream('deepseek_v4_1_flash_1017',messages,{userId:owner,tenantContext:context,databaseProjectId:project,maxTokens:64,
    credentialOverrides:{deepseek_v4_1_flash_1017:'never-forward-cached-key'},maxAttempts:1});assert.equal(effects,2);
  reset();await runArchitectPlan({userId:owner,brief:'owned brief',userPrompt:'owned request',dispatchScope:scope});assert.equal(effects,3);
  reset();await convertUserRequest(owner,'owned request',undefined,scope);assert.equal(effects,4);
  reset('platformPositive');const agent=createXrogaAgentModel({userId:owner,modelId:'deepseek_v4_1_flash_1017',dispatchScope:{...scope,connectedAccountId:'platform'},maximumOutputTokens:1024});
  for await(const _ of await agent.stream({systemPrompt:'owned system',messages:[{role:'user',content:[{type:'text',text:'owned source'}]}],tools:[]} as Parameters<typeof agent.stream>[0])){}
  assert.equal(effects,5);
  reset();await connectedAgent();assert.equal(effects,6);
  for(const failing of ['foreignCredential','rotateAtBudget','revokeAtWire','projectAtWire','reservationMismatch']){
    for(const invoke of [complete,builder,connectedAgent]){
      reset(failing);const beforeEffects:number=effects;await assert.rejects(invoke());assert.equal(effects,beforeEffects,failing+' must send zero provider bytes');
    }
  }
  reset();ownerNow=foreign;await assert.rejects(complete());
  reset();row.metadata={...row.metadata,revoked:true} as typeof row.metadata;await assert.rejects(complete());
  reset();await assert.rejects(complete({...scope,context:{...context}}),{code:'TENANT_AUTH_REQUIRED'});
  await assert.rejects(complete({...scope,userId:foreign}));await assert.rejects(complete({...scope,connectedAccountId:'foreign-account'}));
  await assert.rejects(runArchitectPlan({userId:foreign,brief:'foreign source',userPrompt:'foreign source',dispatchScope:scope}));
  await assert.rejects(convertUserRequest(foreign,'foreign source',undefined,scope));
  await assert.rejects(complete(scope,true));assert.equal(effects,6);
  reset();const input:ChatMessage[]=[{role:'user',content:'owned source'}];mutate=()=>{input[0].content='foreign source';};
  await callBuilderStream('deepseek_v4_1_flash_1017',input,{userId:owner,tenantContext:context,databaseProjectId:project,maxTokens:64,
    credentialOverrides:{deepseek_v4_1_flash_1017:'never-forward-cached-key'},maxAttempts:1});assert.equal(effects,7);
  reset();const now=Date.now(),expiresAt=new Date(now+60_000).toISOString();
  const authority:PreparedAuthorityScope={version:'1',userId:owner,tenantId:owner,provider:'zurelay',connectedAccountId:'apikey_zurelay',operation:'model:complete',
    targetDigest:preparedActionDigest({messages}),planDigest:'a'.repeat(64),actionClass:'READ',risk:'low',projectId:project,runId:null,
    issuedAt:new Date(now-1000).toISOString(),expiresAt,nonce:randomUUID(),maxSpendMicroUsd:null,currency:null};
  const claim={id:randomUUID(),userId:owner,scopeDigest:preparedActionDigest(authority),expiresAt,claimedAt:new Date(now).toISOString()};
  const clock=t.mock.method(Date,'now',()=>now);expire=()=>clock.mock.mockImplementation(()=>now+120_000);
  try{await assert.rejects(executeAuthorizedAction({context,scope:authority,claim,revalidateBeforeEffect:async()=>claim},permit=>complete({...scope,authority:{permit,binding:{userId:owner,provider:'zurelay',connectedAccountId:'apikey_zurelay',operation:'model:complete',targetDigest:authority.targetDigest,planDigest:authority.planDigest}}})));}
  finally{clock.mock.restore();}
  assert.equal(effects,7);assert.ok(releases.length>0);assert.ok(releases.every(r=>r.p_pending_reconciliation===false),'Pre-provider policy denials release, never fabricate uncertain spend');
  reset();const runId=randomUUID();
  const attempt=await withRunAttempt(async()=>{
    await createRunDurable(owner,'Synthetic model dispatch fixture',runId,project);
    return captureAdmittedRunAttempt(runId,owner);
  });
  const currentRun={id:runId,user_id:owner,project_id:project,status:'running',worker_id:attempt.workerId,lease_generation:attempt.generation};
  executionRow={...currentRun};await complete({...scope,runAttempt:attempt});assert.equal(effects,8);
  await assert.rejects(complete({...scope,runAttempt:{...attempt}}),{code:'RUN_STATE_CONFLICT'});
  for(const change of [{status:'completed'},{worker_id:'foreign-worker'},{lease_generation:randomUUID()},{project_id:randomUUID()},{user_id:foreign}]){
    reset();executionRow={...currentRun,...change};await assert.rejects(complete({...scope,runAttempt:attempt}));assert.equal(effects,8);
  }
  reset('staleRunAtBudget');executionRow={...currentRun};await assert.rejects(complete({...scope,runAttempt:attempt}));assert.equal(effects,8);

  const agentTurn=async(selected:TenantModelScope,signal?:AbortSignal)=>{
    const bound=createXrogaAgentModel({userId:owner,modelId:'deepseek_v4_1_flash_1017',fallbackModelIds:['deepseek_v4_1_flash_1017'],dispatchScope:selected,maximumOutputTokens:1024});
    const events=[];
    for await(const event of bound.stream({systemPrompt:'owned system',messages:[{role:'user',content:[{type:'text',text:'owned source'}]}],tools:[],signal} as Parameters<typeof bound.stream>[0]))events.push(event);
    return events;
  };
  for(const failure of ['foreignCredential','rotateAtBudget','projectAtWire','reservationMismatch','mutatedAgentWire']){
    reset(failure);const before:number=effects;
    await assert.rejects(agentTurn(scope));
    assert.equal(effects,before,'No route may send provider bytes after '+failure);
  }
  reset('revokeDuringRetry');const beforeRetry=effects;
  await assert.rejects(agentTurn(scope),{code:'PROVIDER_UNAVAILABLE'});
  assert.equal(effects,beforeRetry+1,'A failed dispatch cannot retry after revocation or select another model');
  reset('accountingFailure');const beforeAccounting=effects;
  await assert.rejects(agentTurn(scope),{code:'POST_COMPLETION_ACCOUNTING_UNCERTAIN'});
  assert.equal(effects,beforeAccounting+1,'Completed work with failed settlement must not dispatch another model or yield agent events');
  reset('foreignAtomicReceipt');const beforeReceipt=effects;
  await assert.rejects(agentTurn(scope),{code:'POST_COMPLETION_ACCOUNTING_UNCERTAIN'});
  assert.equal(effects,beforeReceipt+1,'A foreign durable receipt must withhold events without replaying the model');
  reset();const controller=new AbortController();controller.abort();const beforeCancel=effects;
  await assert.rejects(agentTurn(scope,controller.signal),{name:'AbortError'});
  assert.equal(effects,beforeCancel,'Caller cancellation must send zero provider bytes');
  reset('platform503');const beforeFallback=effects,beforeReservations=reservations.size;
  await assert.rejects(agentTurn({...scope,connectedAccountId:'platform'}),{code:'PROVIDER_UNAVAILABLE'});
  assert.equal(effects,beforeFallback+1,'Exactly one attempted dispatch, no retry or model substitution');
  assert.equal(reservations.size,beforeReservations+1,'A failed request cannot create a fallback reservation');

  // Exercise BOTH generic SDK entry points through the real tenant issuer.
  // No arbitrary callback, raw ID, alternate account or model may grant access.
  for(const invoke of [chatCompletion,chatCompletionStream]){
    const deltas:string[]=[];
    const controller=new AbortController();
    const request=(signal?:AbortSignal)=>withTenantModelReservation({scope,modelId:'deepseek_v4_1_flash_1017',payload:{messages},estimatedInputTokens:10,maximumOutputTokens:64,
      execute:d=>invoke('deepseek_v4_1_flash_1017',d.payload.messages as ChatMessage[],{maxTokens:64,credentialOverride:d.credentialOverride,beforeDispatch:d.beforeDispatch,signal,
        onDelta:text=>deltas.push(text)})});
    reset();const beforePositive:number=effects,receiptsBefore:number=atomicReceipts;
    assert.ok((await request()).text.length>0);
    assert.equal(effects,beforePositive+1);assert.equal(atomicReceipts,receiptsBefore+1,'Exactly one canonical atomic receipt per completion');
    assert.equal(deltas.length,invoke===chatCompletionStream?1:0);
    for(const failure of ['accountingFailure','foreignAtomicReceipt']){
      reset(failure);deltas.length=0;const before:number=effects;
      await assert.rejects(request(),{code:'POST_COMPLETION_ACCOUNTING_UNCERTAIN'});
      assert.equal(effects,before+1);assert.equal(deltas.length,0,'No successful stream publication without settlement and a valid atomic receipt');
    }
    reset('revokeDuringRetry');deltas.length=0;const beforeRevoke:number=effects;
    await assert.rejects(request());assert.equal(effects,beforeRevoke+1);assert.equal(deltas.length,0);
    reset();controller.abort();const beforeAbort:number=effects;
    await assert.rejects(request(controller.signal),{name:'AbortError'});assert.equal(effects,beforeAbort);
    reset();const during=new AbortController();abortDuringResponse=during;const beforeDuring:number=effects;
    try{await assert.rejects(request(during.signal));assert.equal(effects,beforeDuring+1);assert.equal(deltas.length,0);}
    finally{abortDuringResponse=undefined;}
    reset('platform503');deltas.length=0;resetModelRuntimeHealth();const beforeRecovery:number=effects,receiptRecovery:number=atomicReceipts;
    await assert.rejects(executeWithProviderFallback({routes:['deepseek_v4_1_flash_1017','deepseek_v4_1_flash_1017'],maximumAttemptsPerRoute:1,recordHealth:false,
      execute:modelId=>withTenantModelReservation({scope:{...scope,connectedAccountId:'platform'},modelId,payload:{messages},estimatedInputTokens:10,maximumOutputTokens:64,
        execute:d=>invoke(modelId,d.payload.messages as ChatMessage[],{maxTokens:64,credentialOverride:d.credentialOverride,beforeDispatch:d.beforeDispatch,onDelta:text=>deltas.push(text)})})}),{code:'PROVIDER_UNAVAILABLE'});
    assert.equal(effects,beforeRecovery+1);assert.equal(atomicReceipts,receiptRecovery);
    assert.equal(deltas.length,0,'A failed provider request cannot publish output or switch models');
  }
  reset();resetModelRuntimeHealth();const beforeDelivery:number=effects,receiptDelivery:number=atomicReceipts;
  await assert.rejects(executeWithProviderFallback({routes:['deepseek_v4_1_flash_1017','deepseek_v4_1_flash_1017'],maximumAttemptsPerRoute:1,recordHealth:false,
    execute:modelId=>withTenantModelReservation({scope,modelId,payload:{messages},estimatedInputTokens:10,maximumOutputTokens:64,
      execute:d=>chatCompletionStream(modelId,d.payload.messages as ChatMessage[],{maxTokens:64,credentialOverride:d.credentialOverride,beforeDispatch:d.beforeDispatch,
        onDelta:()=>{throw Error('Synthetic disconnected output consumer');}})})}),{code:'MODEL_PUBLICATION_FAILED',providerCompleted:true,retryable:false});
  assert.equal(effects,beforeDelivery+1);assert.equal(atomicReceipts,receiptDelivery+1,'Delivery failure retains accounting and cannot repeat provider work');
  reset();resetModelRuntimeHealth();const beforeLimit:number=effects;let limitedOutput='';
  await assert.rejects(callBuilderStream('deepseek_v4_1_flash_1017',messages,{userId:owner,tenantContext:context,databaseProjectId:project,maxTokens:64,maxAttempts:1,
    budget:{...DEFAULT_BUILDER_BUDGET,maxOutputChars:4},onDelta:text=>{limitedOutput+=text;}}),{code:'BUILDER_OUTPUT_LIMIT'});
  assert.equal(effects,beforeLimit+1);assert.equal(limitedOutput,'','Buffering public output must preserve the existing active provider output limit');

  for(const failure of ['missingUsage','wrongModel','droppedStream']){
    reset(failure);resetModelRuntimeHealth();const before:number=effects,heldBefore:number=releases.length,receiptsBefore:number=atomicReceipts;let published='';
    await assert.rejects(withTenantModelReservation({scope,modelId:'deepseek_v4_1_flash_1017',payload:{messages},estimatedInputTokens:10,maximumOutputTokens:64,
      execute:d=>chatCompletionStream('deepseek_v4_1_flash_1017',d.payload.messages as ChatMessage[],{maxTokens:64,credentialOverride:d.credentialOverride,
        beforeDispatch:d.beforeDispatch,onDelta:delta=>published+=delta})}));
    assert.equal(effects,before+1,'No retry after uncertain dispatched '+failure);
    assert.equal(published,'');assert.equal(atomicReceipts,receiptsBefore);
    assert.equal(releases.length,heldBefore+1);assert.equal(releases.at(-1)?.p_pending_reconciliation,true,'Unknown post-dispatch cost stays held');
  }

  reset();const imageReservations=reservations.size,imageEffects=effects;
  await assert.rejects(withTenantModelReservation({scope,modelId:'deepseek_v4_1_flash_1017',payload:{messages:[{role:'user',content:[{type:'image_url',image_url:{url:'data:image/png;base64,AA'}}]}]},
    estimatedInputTokens:10,maximumOutputTokens:64,execute:async()=>{throw Error('Must not execute');}}),{code:'MODEL_DESTINATION_DENIED'});
  assert.equal(reservations.size,imageReservations);assert.equal(effects,imageEffects);
  await withTenantModelReservation({scope,modelId:'deepseek_v4_1_flash_1017',payload:{messages:[{role:'user',content:'Explain the JSON key "image_url" as plain text.'}]},
    estimatedInputTokens:10,maximumOutputTokens:64,execute:d=>chatCompletion('deepseek_v4_1_flash_1017',d.payload.messages as ChatMessage[],{maxTokens:64,credentialOverride:d.credentialOverride,beforeDispatch:d.beforeDispatch})});

  // Exercise the real read-only pipeline, SDK transport, canonical settlement
  // and publication boundary together. All external responses are synthetic.
  const presentation:PresentationPlan=[{kind:'prose',heading:'Explanation',instruction:'Preserve the supplied content.',covers:['explanation']},{kind:'graph',heading:'Relationships',instruction:'Connect the supplied systems.',covers:['relationships']}];
  const semantic=goalContractSchema.parse({version:'1.0',goal:'Explain the supplied system',desiredOutcome:'An explanation',semanticIntent:'ANSWER',
    requiredCapabilities:['conversation.respond'],confidence:0.9,presentation,answerObligations:[{id:'explanation',description:'Explain the supplied system.',origin:'requested',formats:['prose']},{id:'relationships',description:'Connect the supplied components.',origin:'requested',formats:['graph']}]});
  const document={s0:{markdown:'Keep `tenant_id` unchanged.',data:null},s1:{markdown:'Client requests reach the server.',data:{nodes:[{id:'client',label:'Client'},{id:'api',label:'API'}],edges:[{id:'request',source:'client',target:'api',label:'Request'}]}}};
  for (const valid of [true,false]) {
    reset('presentation');resetModelRuntimeHealth();receivedAnswer=JSON.stringify(valid?document:{s0:document.s0});
    const before:number=effects,receipts:number=atomicReceipts;let visible='';
    const result=await runChatPipeline({userId:owner,tenantContext:context,modelScope:scope,prompt:'Explain the supplied system. No external research.',goalContract:semantic,onDelta:text=>visible+=text});
    assert.equal(effects,before+1,'No schema repair or second formatting request');
    assert.equal(atomicReceipts,receipts+1,'The partial answer still settles exactly once');
    assert.equal(result.responseSource?.format,'xroga-response-json-v1');assert.equal(result.responseSource?.text,receivedAnswer);assert.deepEqual(result.responseSource?.contract?.requirements,semantic.answerObligations);
    assert.deepEqual(result.completion,valid?{status:'complete'}:{status:'partial',reason:'presentation_contract'});
    assert.equal(result.response,visible);
    assert.match(result.response,/Keep `tenant_id` unchanged/);
    assert.equal(result.response.includes('"type":"graph"'),valid);
    assert.ok(lastReservedInput>JSON.stringify(presentationResponseFormat(presentation)).length/5,'Schema metadata is included in the token reservation');
  }
  reset('presentation');resetModelRuntimeHealth();receivedAnswer=JSON.stringify(document);
  const incompleteSemantic=goalContractSchema.parse({...semantic,answerObligations:[...semantic.answerObligations!,{id:'data-shape',description:'Show the requested data structure.',origin:'requested',formats:['table']}]});
  const beforeCoverage:number=effects,receiptsCoverage:number=atomicReceipts;
  const incomplete=await runChatPipeline({userId:owner,tenantContext:context,modelScope:scope,prompt:'Explain the supplied system and data structure. No external research.',goalContract:incompleteSemantic});
  assert.deepEqual(incomplete.completion,{status:'partial',reason:'presentation_contract'},'A valid document cannot conceal a missing answer obligation');
  assert.equal(effects,beforeCoverage+1,'Coverage failure never triggers a paid formatting repair');
  assert.equal(atomicReceipts,receiptsCoverage+1);
  assert.equal(incomplete.responseSource?.text,receivedAnswer);assert.equal(incomplete.responseSource?.contract?.coverage.complete,false);
  assert.match(incomplete.response,/Keep `tenant_id` unchanged/);
  reset('mutatedSchema');resetModelRuntimeHealth();
  const beforeSchemaDrift:number=effects;
  await assert.rejects(runChatPipeline({userId:owner,tenantContext:context,modelScope:scope,prompt:'Explain the supplied system.',goalContract:semantic}),
    (error:any)=>error.code==='MODEL_DISPATCH_BINDING_DENIED');
  assert.equal(effects,beforeSchemaDrift,'Replacing the admitted schema is denied before any provider bytes');

  process.env.XROGA_NATIVE_OPENUI_WORKSPACE='1';
  const readable='The workshop earns $25 per attendee.';
  const evidence={title:'Workshop evidence',url:'https://example.com/workshop',snippet:readable,source:'parallel'};
  const research={bundle:{query:'Workshop price',summary:readable,provider:'parallel' as const,sources:[evidence]},evidence:readable};
  for (const [kind, program] of [
    ['file','root = Col([Text("The workshop earns $25 per attendee."), Metric("Ticket price (USD)", 25)])'],
    ['research','root = Col([Text("The workshop earns $25 per attendee."), Source("source-1")])'],
    ['invalid-source','root = Col([Text("The workshop earns $25 per attendee."), Source("source-2")])'],
  ] as const) {
    reset('native');resetModelRuntimeHealth();
    receivedAnswer=readable+'\n<<<XROGA_OPENUI_V1>>>\n'+program;
    const before=effects,receipts=atomicReceipts;
    const result=await runChatPipeline({userId:owner,tenantContext:context,modelScope:scope,prompt:'Explain the supplied workshop price. No external research.',
      ...(kind==='file'?{attachments:[{url:'data:text/plain;base64,'+Buffer.from(readable).toString('base64'),mimeType:'text/plain',name:'workshop.txt'}]}:{approvedResearch:research}),
      onDelta:text=>{assert.equal(atomicReceipts,receipts+1,'Publication must follow canonical settlement');assert.equal(text,readable);}});
    assert.equal(result.response,readable);
    assert.equal(effects,before+1);
    assert.equal(atomicReceipts,receipts+1);
    assert.deepEqual(result.responseSource,{format:'xroga-openui-v1',text:kind==='invalid-source'?'':program});
    assert.deepEqual(result.completion,kind==='invalid-source'?{status:'partial',reason:'presentation_contract'}:{status:'complete'});
    if(kind==='file')assert.equal(result.intent,'file_analysis');
    else assert.deepEqual(result.webSources,[evidence]);
  }
});

test('local request security denial cannot fall through to a different provider or account',async()=>{
  resetModelRuntimeHealth();
  for(const code of ['MODEL_DISPATCH_BINDING_DENIED','MODEL_CREDENTIAL_EGRESS_DENIED','MODEL_PAYLOAD_INVALID','MODEL_DESTINATION_DENIED']){
    const routes:string[]=[];
    await assert.rejects(executeWithProviderFallback({routes:['deepseek_v4_1_flash_1017','deepseek_v4_1_flash_1017'],maximumAttemptsPerRoute:1,
      execute:async model=>{routes.push(model);throw Object.assign(Error('Local policy denial'),{code,status:400});}}));
    assert.deepEqual(routes,['deepseek_v4_1_flash_1017']);
  }
});
