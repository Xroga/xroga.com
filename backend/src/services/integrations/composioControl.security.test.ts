import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTenantContext} from '../../security/tenantContext.js';
import {createUserCustomMcpToolkit,syncUserCustomMcpToolkit,deleteUserCustomMcpToolkit,xrogaCustomToolkitPrefix,createComposioConnectionLink} from './composioClient.js';
import {createBusinessAutomationRule} from './businessAutomations.js';
import {nativeReleaseFixture} from '../publish/__tests__/nativeReleaseFixture.js';
import {confirmBusinessAction,cancelBusinessActionConfirmation} from './businessActionConfirmations.js';
import {resetCredentialVaultRuntimeForTests} from './credentialVaultRuntime.js';

for(const scenario of ['none','api_key','dcr_oauth','sync','delete','trigger','cancel-at-audit','cancel-after-claim','audit-fail','source-change','credential-change','foreign-account','auth403','provider503','bad-receipt'] as const){
 test(`native Composio control: ${scenario}`,async t=>{
  const owner=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'}),fixture=nativeReleaseFixture(owner),env={NODE_ENV:'test',COMPOSIO_API_KEY:'synthetic-control-key',COMPOSIO_WEBHOOK_SECRET:'synthetic-hook',SUPABASE_URL:'https://connect-control-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-store',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,37).toString('base64url')},prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);resetCredentialVaultRuntimeForTests();
  t.after(()=>{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;});
  const slug=xrogaCustomToolkitPrefix(owner)+'fixture_server',writes:Record<string,unknown>[]=[],request={name:'Fixture server',serverUrl:'https://public.example/mcp',authMode:['api_key','dcr_oauth'].includes(scenario)?scenario as 'api_key'|'dcr_oauth':'none' as const,...(scenario==='dcr_oauth'?{discoveryUrl:'https://public.example/.well-known/oauth-authorization-server'}:{})};
  let accountChanged=false,recover=false,changed=false,registered=['sync','delete','source-change','foreign-account'].includes(scenario),automationWrites=0;
  const metadata=()=>({slug,name:'Fixture server',no_auth:scenario!=='foreign-account',auth_schemes:scenario==='foreign-account'?['API_KEY']:['NO_AUTH'],meta:{app_url:changed?'https://changed.example/mcp':'https://public.example/mcp'}});
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
   const url=new URL(String(input)),method=init?.method??'GET';
   if(url.origin===env.SUPABASE_URL){
    if(url.pathname.endsWith('/user_integrations'))return Response.json(null);
    if(url.pathname.endsWith('/business_automation_rules')){automationWrites++;const body=JSON.parse(String(init?.body));assert.equal(body.user_id,owner);assert.equal(body.enabled,false);return Response.json({...body,id:randomUUID()});}
    const result=await fixture.database(url,init);assert.ok(result,'unexpected database path '+url.pathname);return result;
   }
   assert.equal(url.origin,'https://backend.composio.dev');
   if(method==='DELETE'||method==='POST'&&(url.pathname.includes('/custom/toolkits')||url.pathname.endsWith('/auth_configs')||url.pathname.includes('/trigger_instances/'))){
    const body=init?.body?JSON.parse(String(init.body)):{};writes.push({method,path:url.pathname,body});
    if(!recover&&(scenario==='auth403'||scenario==='provider503'))return Response.json({message:'PRIVATE_PROVIDER_ERROR'},{status:scenario==='auth403'?403:503});
    if(scenario==='bad-receipt')return Response.json({slug:'foreign_toolkit',deleted:true});
    if(url.pathname.endsWith('/auth_configs'))return Response.json({toolkit:{slug},auth_config:{id:'ac_fixture',auth_scheme:scenario==='api_key'?'API_KEY':'DCR_OAUTH',is_composio_managed:false}});
    if(url.pathname.includes('/trigger_instances/')){assert.equal(body.user_id,'xroga:'+owner);assert.equal(body.connected_account_id,'ca_owned');assert.equal(body.egress_url,undefined);return Response.json({trigger_id:'ti_fixture'});}
    registered=true;return Response.json({slug,deleted:method==='DELETE',version:'20261028',synced_count:2});
   }
   if(url.pathname.endsWith('/toolkits')&&!url.pathname.includes('/session/'))return Response.json({items:registered?[metadata()]:[]});
   if(url.pathname.includes('/toolkits/')&&!url.pathname.includes('/session/'))return Response.json(metadata());
   if(url.pathname.includes('/triggers_types/'))return Response.json({toolkit:{slug:'gmail'}});
   if(url.pathname.endsWith('/toolkits'))return Response.json({items:[{slug:scenario==='foreign-account'?slug:'gmail',connected_account:{id:scenario==='foreign-account'?(accountChanged?'ca_other':'ca_foreign'):'ca_owned',status:'ACTIVE'}}]});
   return Response.json({session_id:'trs_owned',config:{user_id:'xroga:'+owner,tags:['readOnlyHint']}});
  });
  const pending=scenario==='trigger'?await createBusinessAutomationRule(owner,{name:'Exact fixture automation',request:'Find messages in Gmail and then send an email',schedule:{kind:'trigger',toolkit:'gmail',triggerSlug:'GMAIL_NEW_GMAIL_MESSAGE',triggerConfig:{label:'Fixture private label'}}},context):scenario==='delete'?await deleteUserCustomMcpToolkit(owner,slug,context):['sync','source-change','foreign-account'].includes(scenario)?await syncUserCustomMcpToolkit(owner,{toolkit:slug,...(scenario==='foreign-account'?{connectedAccountId:'ca_foreign'}:{})},context):await createUserCustomMcpToolkit(owner,request,context);
  assert.ok('needsConfirmation' in pending&&pending.needsConfirmation);assert.equal(writes.length,0);assert.equal(automationWrites,0);assert.ok(fixture.row);
  const confirmation=fixture.row.id;
  if(['cancel-at-audit','cancel-after-claim','audit-fail'].includes(scenario))fixture.mode=scenario;
  if(scenario==='source-change')changed=true;
  if(scenario==='credential-change')process.env.COMPOSIO_API_KEY='changed-platform-key';
  if(scenario==='foreign-account'){
   // A different live connection must not inherit the exact reviewed account.
   accountChanged=true;
  }
  const negative=['cancel-at-audit','cancel-after-claim','audit-fail','source-change','credential-change','foreign-account','auth403','provider503','bad-receipt'].includes(scenario);
  if(negative){await assert.rejects(confirmBusinessAction(context,confirmation));assert.notEqual(fixture.row?.status,'consumed');assert.equal(writes.length,['auth403','provider503','bad-receipt'].includes(scenario)?1:0);await assert.rejects(confirmBusinessAction(context,confirmation));assert.equal(writes.length,['auth403','provider503','bad-receipt'].includes(scenario)?1:0);if(scenario==='provider503'){recover=true;const next=await createUserCustomMcpToolkit(owner,request,context);assert.ok('needsConfirmation' in next);assert.ok(fixture.row);await confirmBusinessAction(context,fixture.row.id);assert.equal(writes.length,2);assert.equal(fixture.row?.status,'consumed');}}
  else{const result=await confirmBusinessAction(context,confirmation);assert.equal(fixture.row?.status,'consumed');assert.ok(result.execution);assert.equal(writes.length,['api_key','dcr_oauth'].includes(scenario)?2:1);assert.ok(fixture.audits>0);assert.equal(automationWrites,scenario==='trigger'?1:0);await assert.rejects(confirmBusinessAction(context,confirmation));}
 });
}

test('foreign configuration deletion and untrusted callbacks fail before provider access',async t=>{
 const owner=randomUUID(),actor=createTenantContext({userId:owner,via:'remote_getuser'}),prior=process.env.COMPOSIO_API_KEY;process.env.COMPOSIO_API_KEY='synthetic-boundary-key';let calls=0;
 t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('No network permitted');});
 try{await assert.rejects(deleteUserCustomMcpToolkit(owner,'gmail',actor));await assert.rejects(createComposioConnectionLink(owner,{sessionId:'trs_owned',toolkit:'gmail',callbackUrl:'https://attacker.example/capture'},actor));assert.equal(calls,0);}
 finally{if(prior===undefined)delete process.env.COMPOSIO_API_KEY;else process.env.COMPOSIO_API_KEY=prior;}
});
