import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import {nativeReleaseFixture} from '../services/publish/__tests__/nativeReleaseFixture.js';
import {confirmBusinessAction} from '../services/integrations/businessActionConfirmations.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { prepareBusinessAction, executePreparedBusinessAction, businessActionAuthorityScope, type BusinessActionPlan } from '../services/integrations/businessAction.js';
import { createTenantContext } from '../security/tenantContext.js';
import { executeAuthorizedAction } from '../security/authority/enforce.js';
import { preparedActionDigest } from '../security/authority/digest.js';
import { createActionComposioSession, executeComposioActionTool, executeComposioReadTool } from '../services/integrations/composioClient.js';
import { goalContractSchema } from '../ai/universal/goalContract.js';
import { dispatchForGoal } from '../ai/universal/semanticRequestPlanner.js';
import { artifactStatusFor } from '../ai/engineeringArtifact.js';
import { publicRuntimeFailure, RuntimeFailure } from '../ai/universal/runtimeFailure.js';
import { bindBuildStreamDisconnect } from '../lib/buildStreamLifecycle.js';
import { initSSE, sendSSE, endSSE } from '../lib/sse.js';
import { authMiddleware } from '../middleware/auth.js';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OUTSIDER = '22222222-2222-4222-8222-222222222222';
const SESSION = 'trs_golden_fixture';
const TOOL = 'SLACK_DELETE_MESSAGE';
type Mode = 'success' | 'failure' | 'timeout' | 'empty' | 'input_required' | 'incomplete' | 'malformed';

/** Intercepts actual adapter calls, not a replacement runtime. Never forwards a request. */
function providerStub(t: TestContext, mode: Mode = 'success', connected = false, slug = TOOL,events?:{onSearch?:()=>void;onAudit?:()=>void;sessionOwner?:()=>string;fixture?:ReturnType<typeof nativeReleaseFixture>}) {
  const previous = new Map(['COMPOSIO_API_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_JWT_SECRET'].map(key=>[key,process.env[key]]));
  process.env.COMPOSIO_API_KEY = 'golden-test-canary-not-a-real-key';
  process.env.SUPABASE_URL='http://127.0.0.1:54321';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-offline-service-role';delete process.env.SUPABASE_JWT_SECRET;
  t.after(()=>{for(const[key,value]of previous)value===undefined?delete process.env[key]:process.env[key]=value;});
  const paths: string[] = [];
  const auditCorrelations:string[]=[];
  t.mock.method(globalThis,'fetch',async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    if(url.origin==='http://127.0.0.1:54321'){
      if(url.pathname==='/rest/v1/user_integrations'&&(!init?.method||init.method==='GET'))return new Response('[]',{headers:{'Content-Type':'application/json'}});
      if(url.pathname==='/rest/v1/production_audit_log'&&init?.method==='POST'){
        const row=JSON.parse(String(init.body));assert.equal(row.user_id,OWNER);assert.equal(row.actor_id,OWNER);
        auditCorrelations.push(row.correlation_id);
        events?.onAudit?.();
        assert.equal(row.action,'egress_decision');assert.equal(row.outcome,'ALLOW');
        assert.match(row.metadata.payloadDigest,/^[a-f0-9]{64}$/);assert.equal(row.metadata.policyVersion,'xroga-egress-1');
        assert.doesNotMatch(JSON.stringify(row),/SYNTHETIC_PROVIDER_RESULT_CREDENTIAL|fixture-account-A|fixture-message/);
        return new Response(JSON.stringify(row),{headers:{'Content-Type':'application/json'}});
      }
      const receipt=await events?.fixture?.database(url,init);if(receipt)return receipt;
      assert.fail('Unexpected local security receipt request');
    }
    assert.equal(url.origin,'https://backend.composio.dev','No unexpected provider/production traffic is allowed');
    const path=url.pathname; paths.push(path);
    const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
    if(path.endsWith('/execute')) {
      if(slug===TOOL)assert.equal(JSON.parse(String(init?.body)).account,'fixture-account-A','Actual adapter must explicitly select the approved account');
      if(mode==='timeout')throw new DOMException('Fixture timeout','AbortError');
      if(mode==='input_required')return response({result_type:'input_required',request_state:'SYNTHETIC_PROVIDER_STATE',input_requests:[],data:{}});
      if(mode==='incomplete')return response({result_type:'failed',error:null,data:{}});
      if(mode==='malformed')return response({unexpected:true});
      return response(mode==='failure'?{error:'SIMULATED_PROVIDER_FAILURE',data:null}:{data:{fixture:true,reference:'fixture-deletion-1',
        access_token:'SYNTHETIC_PROVIDER_RESULT_CREDENTIAL',credentials:{secret:'SYNTHETIC_NESTED_CREDENTIAL'},url:'https://example.invalid/fixture-result'},error:null});
    }
    if(path.includes('/tools/'))return response({slug,toolkit:{slug:'slack'},tags:[slug===TOOL?'destructiveHint':'readOnlyHint'],input_parameters:{type:'object'},scopes:['fixture.message.delete']});
    if(path.endsWith('/search')){events?.onSearch?.();return response({tool_schemas:mode==='empty'?{}:{fixture:{tool_slug:slug,toolkit:'slack',description:'Synthetic fixture only',input_schema:{type:'object'}}}});}
    if(path.endsWith('/toolkits'))return response({items:[{slug:'slack',name:'Slack',connected_account:connected?{id:'fixture-account-A',status:'ACTIVE'}:null}]});
    if(path.endsWith('/session')||path.endsWith(`/${SESSION}`))return response({session_id:SESSION,config:{user_id:`xroga:${events?.sessionOwner?.()??OWNER}`,workbench:{enable:false,enable_proxy_execution:false},execute:{enable_multi_execute:false},tags:['readOnlyHint']}});
    assert.fail('Unexpected adapter path: no call is forwarded');
  });
  return Object.assign(paths,{auditCorrelations});
}

function canonical(value: unknown): unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>[key,canonical(child)]));
  return value;
}
/** Fixture digest follows the existing wire contract; it is NOT a newly issued authority grant. */
function preparedPlan(userId = OWNER): BusinessActionPlan {
  const authority: NonNullable<BusinessActionPlan['authority']> = {version:'1',userId,tenantId:userId,
    connectedAccountId:'fixture-account-A',actionClass:'DELETE',projectId:null,runId:null,
    issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString(),nonce:'fixture-server-nonce',maxSpendMicroUsd:null,currency:null};
  const unsigned = {version:'1.0' as const,sessionId:SESSION,useCase:'Delete the selected fixture Slack message',toolkit:'slack',toolSlug:TOOL,arguments:{message_id:'fixture-message'},risk:'destructive' as const,requiresConfirmation:true,requiredScopes:['fixture.message.delete'],scopeRequirements:null,summary:'Delete fixture message',authority};
  return {...unsigned,planDigest:createHash('sha256').update(JSON.stringify(canonical(unsigned))).digest('hex')};
}
/** Unit-only durable adapter receipt. Real claim/cancellation races require DB tests. */
async function executeFixture(plan = preparedPlan(), userId = OWNER) {
  const scope=businessActionAuthorityScope(plan),context=createTenantContext({userId,via:'remote_getuser'});
  const claim={id:'fixture-claimed-confirmation',userId,scopeDigest:preparedActionDigest(scope),expiresAt:scope.expiresAt,claimedAt:new Date().toISOString()};
  return executeAuthorizedAction({context,scope,claim,revalidateBeforeEffect:async()=>claim},authorityPermit=>
    executePreparedBusinessAction({userId,plan,authorization:{explicitUserAuthorization:true,confirmedHighRisk:true},authorityPermit}));
}
const code = (expected:string)=>(error:unknown)=>Boolean(error&&typeof error==='object'&&(error as {code?:string}).code===expected);

test('GJ action egress retains the original issued actor context rather than rebuilding one from a user ID',async t=>{
  const paths=providerStub(t,'success',true),plan=preparedPlan(),context=createTenantContext({userId:OWNER,via:'remote_getuser'}),scope=businessActionAuthorityScope(plan);
  const claim={id:'fixture-original-context',userId:OWNER,scopeDigest:preparedActionDigest(scope),expiresAt:scope.expiresAt,claimedAt:new Date().toISOString()};
  await executeAuthorizedAction({context,scope,claim,revalidateBeforeEffect:async()=>claim},authorityPermit=>
    executePreparedBusinessAction({userId:OWNER,plan,authorization:{explicitUserAuthorization:true,confirmedHighRisk:true},authorityPermit}));
  assert.deepEqual(paths.auditCorrelations,[context.correlationId,context.correlationId]);
});

test('GJ raw-user-ID connected read cannot dispatch without the original issued context',async t=>{
  const slug='SLACK_FETCH_MESSAGE',paths=providerStub(t,'success',true,slug);
  await assert.rejects(executeComposioReadTool(OWNER,{sessionId:SESSION,useCase:'Read the isolated fixture',toolSlug:slug,arguments:{message_id:'fixture-message'}}));
  assert.equal(paths.length,0);
});

test('GJ unknown tool metadata cannot create a connected read capability',async t=>{
  const slug='OPAQUE_PROVIDER_OPERATION',paths=providerStub(t,'success',true,slug);
  await assert.rejects(executeComposioReadTool(OWNER,{tenantContext:createTenantContext({userId:OWNER,via:'remote_getuser'}),sessionId:SESSION,useCase:'Read the isolated fixture',toolSlug:slug,arguments:{}}),code('COMPOSIO_MUTATION_BLOCKED'));
  assert.equal(paths.length,0);
});

test('GJ connected read refuses credential canaries before discovery or execution',async t=>{
  const slug='SLACK_GET_MESSAGE',paths=providerStub(t,'success',true,slug);
  await assert.rejects(executeComposioReadTool(OWNER,{tenantContext:createTenantContext({userId:OWNER,via:'remote_getuser'}),sessionId:SESSION,useCase:'Read the fixture',toolSlug:slug,arguments:{query:'SYNTHETIC_CREDENTIAL_MUST_NOT_LEAVE'}}));
  assert.equal(paths.length,0);
});

test('GJ changed remote session ownership during egress receipt prevents the confirmed action',async t=>{
  let revoked=false;const paths=providerStub(t,'success',true,TOOL,{onAudit:()=>{revoked=true;},sessionOwner:()=>revoked?OUTSIDER:OWNER});
  await assert.rejects(executeFixture(),code('COMPOSIO_SESSION_FORBIDDEN'));
  assert.equal(paths.filter(path=>path.endsWith('/execute')).length,0);
});

test('GJ cancellation during tool discovery prevents connected execution and fallback',async t=>{
  const controller=new AbortController(),slug='SLACK_GET_MESSAGE',paths=providerStub(t,'success',true,slug,{onSearch:()=>controller.abort()});
  const request={tenantContext:createTenantContext({userId:OWNER,via:'remote_getuser'}),signal:controller.signal,sessionId:SESSION,useCase:'Read the fixture',toolSlug:slug,arguments:{}};
  await assert.rejects(executeComposioReadTool(OWNER,request),{name:'AbortError'});
  assert.equal(paths.filter(path=>path.endsWith('/execute')).length,0);
});

test('GJ contracts use the real typed GoalContract boundary and conversational planning dispatch',()=>{
  const fixtures=JSON.parse(readFileSync(new URL('../../../tests/golden/fixtures/goals.json',import.meta.url),'utf8')) as Array<{id:string;goal:unknown}>;
  assert.equal(fixtures.length,12);
  for(const fixture of fixtures){const goal=goalContractSchema.parse(fixture.goal);assert.ok(goal.goal);assert.ok(goal.constraints.includes('Fixture only; no external side effects'));}
  const chat=goalContractSchema.parse(fixtures.find(row=>row.id==='GJ-CHAT')!.goal);
  assert.equal(dispatchForGoal(chat,chat.requiredCapabilities),'chat');
  assert.equal(goalContractSchema.parse(fixtures.find(row=>row.id==='GJ-WEB-RESEARCH')!.goal).freshnessRequirement,'CURRENT_REQUIRED');
});
test('GJ business preparation finds only the relevant disconnected provider and never executes',async t=>{
  const paths=providerStub(t);
  const result=await prepareBusinessAction({userId:OWNER,tenantContext:createTenantContext({userId:OWNER,via:'remote_getuser'}),useCase:'Delete the selected Slack message'});
  assert.equal(result.status,'connection_required');
  if(result.status==='connection_required')assert.equal(result.toolkit,'slack');
  assert.equal(paths.filter(path=>path.endsWith('/execute')).length,0);
});
test('GJ unsupported action remains unavailable instead of a fabricated success',async t=>{
  providerStub(t,'empty'); assert.equal((await prepareBusinessAction({userId:OWNER,tenantContext:createTenantContext({userId:OWNER,via:'remote_getuser'}),useCase:'Unsupported fixture operation'})).status,'unavailable');
});
test('GJ business write rejects absent user authority and changed prepared arguments',async t=>{
  const paths=providerStub(t,'success',true),plan=preparedPlan();
  await assert.rejects(executePreparedBusinessAction({userId:OWNER,plan,authorization:{explicitUserAuthorization:false as unknown as true}}),code('BUSINESS_ACTION_USER_AUTHORIZATION_REQUIRED'));
  await assert.rejects(executePreparedBusinessAction({userId:OWNER,plan:{...plan,arguments:{message_id:'other-message'}},authorization:{explicitUserAuthorization:true,confirmedHighRisk:true}}),code('BUSINESS_ACTION_PLAN_CHANGED'));
  assert.equal(paths.length,0);
});
test('GJ exact prepared destructive action requires confirmation before the actual adapter executes',async t=>{
  const paths=providerStub(t,'success',true),plan=preparedPlan();
  const blocked=await executePreparedBusinessAction({userId:OWNER,plan,authorization:{explicitUserAuthorization:true}});
  assert.equal(blocked.status,'confirmation_required'); assert.equal(paths.filter(path=>path.endsWith('/execute')).length,0);
  const booleanOnly=await executePreparedBusinessAction({userId:OWNER,plan,authorization:{explicitUserAuthorization:true,confirmedHighRisk:true}});
  assert.equal(booleanOnly.status,'confirmation_required');
  const accepted=await executeFixture(plan);
  assert.equal(accepted.status,'success'); if(accepted.status==='success')assert.match(accepted.resultText,/fixture-deletion-1/);
  if(accepted.status==='success'){
    assert.doesNotMatch(accepted.resultText,/SYNTHETIC_PROVIDER_RESULT_CREDENTIAL|SYNTHETIC_NESTED_CREDENTIAL/);
    assert.match(accepted.resultText,/https:\/\/example.invalid\/fixture-result/);
    assert.notEqual(accepted.resultDigest,createHash('sha256').update(JSON.stringify(JSON.parse(accepted.resultText))).digest('hex'),'Receipt binds the full original response, not just its redacted projection');
  }
  assert.equal(paths.filter(path=>path.endsWith('/execute')).length,1);
  // This does not certify durable confirmation consumption/replay: that needs an isolated DB.
});
test('GJ second tenant cannot execute through the owner session; read lane rejects mutations',async t=>{
  const paths=providerStub(t);
  await assert.rejects(executeFixture(preparedPlan(OUTSIDER),OUTSIDER),code('COMPOSIO_SESSION_FORBIDDEN'));
  await assert.rejects(executeComposioReadTool(OWNER,{sessionId:SESSION,useCase:'Delete fixture',toolSlug:TOOL,arguments:{}}),code('COMPOSIO_MUTATION_BLOCKED'));
  assert.equal(paths.filter(path=>path.endsWith('/execute')).length,0);
});

test('GJ changed or disconnected account blocks the real action adapter before dispatch',async t=>{
  const paths=providerStub(t,'success',false);
  await assert.rejects(executeFixture(),code('COMPOSIO_ACTION_ACCOUNT_CHANGED'));
  assert.equal(paths.filter(path=>path.endsWith('/execute')).length,0);
});

test('GJ legitimate private read waits for exact consent and strips provider credentials before publication',async t=>{
  const slug='SLACK_GET_MESSAGE',fixture=nativeReleaseFixture(OWNER),paths=providerStub(t,'success',true,slug,{fixture}),actor=createTenantContext({userId:OWNER,via:'remote_getuser'});
  const result=await executeComposioReadTool(OWNER,{tenantContext:actor,sessionId:SESSION,useCase:'Read the isolated fixture message',toolSlug:slug,arguments:{message_id:'fixture-message'}});
  assert.equal(result.needsConfirmation,true);assert.equal(paths.filter(path=>path.endsWith('/execute')).length,0);assert.ok(fixture.row);
  const accepted=(await confirmBusinessAction(actor,fixture.row.id)).execution;
  assert.match(accepted.resultText,/fixture-deletion-1/);
  assert.doesNotMatch(accepted.resultText,/SYNTHETIC_PROVIDER_RESULT_CREDENTIAL|SYNTHETIC_NESTED_CREDENTIAL/);
  assert.match(accepted.resultText,/https:\/\/example.invalid\/fixture-result/);
  assert.match(accepted.resultDigest!,/^[a-f0-9]{64}$/);assert.equal(paths.filter(path=>path.endsWith('/execute')).length,1);
});

test('GJ a forged permit fails before provider metadata or execution',async t=>{
  const paths=providerStub(t,'success',true);
  await assert.rejects(executePreparedBusinessAction({userId:OWNER,plan:preparedPlan(),authorization:{explicitUserAuthorization:true,confirmedHighRisk:true},authorityPermit:{grantId:'forged'}}),code('AUTHORITY_ALREADY_USED_OR_MISSING'));
  assert.equal(paths.length,0);
});
test('GJ anonymous identity and unconfirmed direct provider action are rejected',async t=>{
  const paths=providerStub(t);
  await assert.rejects(createActionComposioSession(''),code('TENANT_AUTH_REQUIRED'));
  await assert.rejects(executeComposioActionTool(OWNER,{sessionId:SESSION,useCase:'Delete fixture',toolSlug:TOOL,arguments:{},authorization:{confirmed:false as unknown as true}}),code('COMPOSIO_ACTION_CONFIRMATION_REQUIRED'));
  assert.equal(paths.length,0);
});
test('GJ provider failure is sanitized and cannot become a success receipt',async t=>{
  providerStub(t,'failure',true); await assert.rejects(executeFixture(),code('BUSINESS_ACTION_EXECUTION_FAILED'));
});
test('GJ provider timeout is classified; uncertain writes are not blindly replayed',async t=>{
  const paths=providerStub(t,'timeout',true); await assert.rejects(executeFixture(),code('COMPOSIO_TIMEOUT'));
  assert.equal(paths.filter(path=>path.endsWith('/execute')).length,1);
});

for(const mode of ['input_required','incomplete','malformed'] as const){
  test(`GJ ${mode} provider response cannot be recorded as completion or automatically resubmitted`,async t=>{
    const paths=providerStub(t,mode,true);
    await assert.rejects(executeFixture(),code('COMPOSIO_EXECUTION_NOT_COMPLETED'));
    assert.equal(paths.filter(path=>path.endsWith('/execute')).length,1);
  });
}
test('GJ false-success and runtime diagnostic leakage are refused by existing output helpers',()=>{
  assert.equal(artifactStatusFor('completed',false,2),'blocked');
  assert.equal(artifactStatusFor('failed',false,0),'failed');
  const publicResult=publicRuntimeFailure(new RuntimeFailure('PROVIDER_UNAVAILABLE','Please retry later.',{cause:new Error('fixture-private-provider-trace'),details:{fixtureSecret:'not-public'}}));
  assert.doesNotMatch(JSON.stringify(publicResult),/fixture-private-provider-trace|fixtureSecret|not-public/);
  assert.doesNotMatch(JSON.stringify(publicRuntimeFailure(new Error('fixture-private-stack'))),/fixture-private-stack/);
});
test('GJ browser refresh detaches transport once without cancelling execution',()=>{
  const request=new EventEmitter(),response=new EventEmitter();let detached=0;
  const cleanup=bindBuildStreamDisconnect(request,response,()=>{detached+=1;});
  response.emit('close');request.emit('aborted');assert.equal(detached,1);cleanup();assert.equal(response.listenerCount('close'),0);
});
test('GJ actual HTTP auth denial and SSE serialization use loopback only',async()=>{
  const app=express(); app.post('/private',authMiddleware,(_req,res)=>res.json({unexpected:true}));
  app.get('/fixture-stream',(_req,res)=>{initSSE(res);sendSSE(res,{event:'progress',data:{runId:'fixture-run',sequence:1,swarmActivity:'Fixture task running'}});endSSE(res);});
  const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const origin=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const denied=await fetch(`${origin}/private`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({userId:OWNER})});
    assert.equal(denied.status,401);const denial=await denied.json();assert.ok(denial&&typeof denial==='object'&&'code'in denial);assert.equal(denial.code,'NO_TOKEN');
    const stream=await fetch(`${origin}/fixture-stream`);assert.match(stream.headers.get('content-type')!,/text\/event-stream/);
    const body=await stream.text();assert.match(body,/event: progress\ndata:/);assert.match(body,/event: done/);assert.doesNotMatch(body,/verified/);
  }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
