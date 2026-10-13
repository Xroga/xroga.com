import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { prepareBusinessAction, executePreparedBusinessAction, type BusinessActionPlan } from '../services/integrations/businessAction.js';
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
type Mode = 'success' | 'failure' | 'timeout' | 'empty';

/** Intercepts actual adapter calls, not a replacement runtime. Never forwards a request. */
function providerStub(t: TestContext, mode: Mode = 'success') {
  const previous = new Map(['COMPOSIO_API_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_JWT_SECRET'].map(key=>[key,process.env[key]]));
  process.env.COMPOSIO_API_KEY = 'golden-test-canary-not-a-real-key';
  delete process.env.SUPABASE_SERVICE_ROLE_KEY; delete process.env.SUPABASE_URL; delete process.env.SUPABASE_JWT_SECRET;
  t.after(()=>{for(const[key,value]of previous)value===undefined?delete process.env[key]:process.env[key]=value;});
  const paths: string[] = [];
  t.mock.method(globalThis,'fetch',async (input: string | URL | Request) => {
    const url = new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
    assert.equal(url.origin,'https://backend.composio.dev','No unexpected provider/production traffic is allowed');
    const path=url.pathname; paths.push(path);
    const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
    if(path.endsWith('/execute')) {
      if(mode==='timeout')throw new DOMException('Fixture timeout','AbortError');
      return response(mode==='failure'?{error:'SIMULATED_PROVIDER_FAILURE',data:null}:{data:{fixture:true,reference:'fixture-deletion-1'},error:null});
    }
    if(path.includes('/tools/'))return response({slug:TOOL,toolkit:{slug:'slack'},tags:['destructiveHint'],input_parameters:{type:'object'},scopes:['fixture.message.delete']});
    if(path.endsWith('/search'))return response({tool_schemas:mode==='empty'?{}:{fixture:{tool_slug:TOOL,toolkit:'slack',description:'Fixture deletion only',input_schema:{type:'object'}}}});
    if(path.endsWith('/toolkits'))return response({items:[{slug:'slack',name:'Slack',connected_account:null}]});
    if(path.endsWith('/session')||path.endsWith(`/${SESSION}`))return response({session_id:SESSION,config:{user_id:`xroga:${OWNER}`,workbench:{enable:false,enable_proxy_execution:false},execute:{enable_multi_execute:false},tags:['readOnlyHint']}});
    assert.fail('Unexpected adapter path: no call is forwarded');
  });
  return paths;
}

function canonical(value: unknown): unknown {
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,child])=>[key,canonical(child)]));
  return value;
}
/** Fixture digest follows the existing wire contract; it is NOT a newly issued authority grant. */
function preparedPlan(): BusinessActionPlan {
  const unsigned = {version:'1.0' as const,sessionId:SESSION,useCase:'Delete the selected fixture Slack message',toolkit:'slack',toolSlug:TOOL,arguments:{message_id:'fixture-message'},risk:'destructive' as const,requiresConfirmation:true,requiredScopes:['fixture.message.delete'],scopeRequirements:null};
  return {...unsigned,summary:'Delete fixture message',planDigest:createHash('sha256').update(JSON.stringify(canonical(unsigned))).digest('hex')};
}
const code = (expected:string)=>(error:unknown)=>Boolean(error&&typeof error==='object'&&(error as {code?:string}).code===expected);

test('GJ contracts use the real typed GoalContract boundary and conversational planning dispatch',()=>{
  const fixtures=JSON.parse(readFileSync(new URL('../../../tests/golden/fixtures/goals.json',import.meta.url),'utf8')) as Array<{id:string;goal:unknown}>;
  assert.equal(fixtures.length,12);
  for(const fixture of fixtures){const goal=goalContractSchema.parse(fixture.goal);assert.ok(goal.goal);assert.ok(goal.constraints.includes('Fixture only; no external side effects'));}
  const chat=goalContractSchema.parse(fixtures.find(row=>row.id==='GJ-CHAT')!.goal);
  assert.equal(dispatchForGoal(chat,chat.requiredCapabilities),'chat');
});
test('GJ business preparation finds only the relevant disconnected provider and never executes',async t=>{
  const paths=providerStub(t);
  const result=await prepareBusinessAction({userId:OWNER,useCase:'Delete the selected Slack message'});
  assert.equal(result.status,'connection_required');
  if(result.status==='connection_required')assert.equal(result.toolkit,'slack');
  assert.equal(paths.filter(path=>path.endsWith('/execute')).length,0);
});
test('GJ unsupported action remains unavailable instead of a fabricated success',async t=>{
  providerStub(t,'empty'); assert.equal((await prepareBusinessAction({userId:OWNER,useCase:'Unsupported fixture operation'})).status,'unavailable');
});
test('GJ business write rejects absent user authority and changed prepared arguments',async t=>{
  const paths=providerStub(t),plan=preparedPlan();
  await assert.rejects(executePreparedBusinessAction({userId:OWNER,plan,authorization:{explicitUserAuthorization:false as unknown as true}}),code('BUSINESS_ACTION_USER_AUTHORIZATION_REQUIRED'));
  await assert.rejects(executePreparedBusinessAction({userId:OWNER,plan:{...plan,arguments:{message_id:'other-message'}},authorization:{explicitUserAuthorization:true,confirmedHighRisk:true}}),code('BUSINESS_ACTION_PLAN_CHANGED'));
  assert.equal(paths.length,0);
});
test('GJ exact prepared destructive action requires confirmation before the actual adapter executes',async t=>{
  const paths=providerStub(t),plan=preparedPlan();
  const blocked=await executePreparedBusinessAction({userId:OWNER,plan,authorization:{explicitUserAuthorization:true}});
  assert.equal(blocked.status,'confirmation_required'); assert.equal(paths.filter(path=>path.endsWith('/execute')).length,0);
  const accepted=await executePreparedBusinessAction({userId:OWNER,plan,authorization:{explicitUserAuthorization:true,confirmedHighRisk:true}});
  assert.equal(accepted.status,'success'); if(accepted.status==='success')assert.match(accepted.resultText,/fixture-deletion-1/);
  assert.equal(paths.filter(path=>path.endsWith('/execute')).length,1);
  // This does not certify durable confirmation consumption/replay: that needs an isolated DB.
});
test('GJ second tenant cannot execute through the owner session; read lane rejects mutations',async t=>{
  const paths=providerStub(t);
  await assert.rejects(executePreparedBusinessAction({userId:OUTSIDER,plan:preparedPlan(),authorization:{explicitUserAuthorization:true,confirmedHighRisk:true}}),code('COMPOSIO_SESSION_FORBIDDEN'));
  await assert.rejects(executeComposioReadTool(OWNER,{sessionId:SESSION,useCase:'Delete fixture',toolSlug:TOOL,arguments:{}}),code('COMPOSIO_MUTATION_BLOCKED'));
  assert.equal(paths.filter(path=>path.endsWith('/execute')).length,0);
});
test('GJ anonymous identity and unconfirmed direct provider action are rejected',async t=>{
  const paths=providerStub(t);
  await assert.rejects(createActionComposioSession(''),code('XROGA_USER_REQUIRED'));
  await assert.rejects(executeComposioActionTool(OWNER,{sessionId:SESSION,useCase:'Delete fixture',toolSlug:TOOL,arguments:{},authorization:{confirmed:false as unknown as true}}),code('COMPOSIO_ACTION_CONFIRMATION_REQUIRED'));
  assert.equal(paths.length,0);
});
test('GJ provider failure is sanitized and cannot become a success receipt',async t=>{
  providerStub(t,'failure'); await assert.rejects(executePreparedBusinessAction({userId:OWNER,plan:preparedPlan(),authorization:{explicitUserAuthorization:true,confirmedHighRisk:true}}),code('BUSINESS_ACTION_EXECUTION_FAILED'));
});
test('GJ provider timeout is classified; uncertain writes are not blindly replayed',async t=>{
  const paths=providerStub(t,'timeout'); await assert.rejects(executePreparedBusinessAction({userId:OWNER,plan:preparedPlan(),authorization:{explicitUserAuthorization:true,confirmedHighRisk:true}}),code('COMPOSIO_TIMEOUT'));
  assert.equal(paths.filter(path=>path.endsWith('/execute')).length,1);
});
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
