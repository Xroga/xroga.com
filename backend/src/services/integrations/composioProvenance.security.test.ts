import test from 'node:test';import assert from 'node:assert/strict';
import {createTenantContext} from '../../security/tenantContext.js';
import {searchComposioTools,executeComposioReadTool,createUserCustomMcpToolkit,xrogaCustomToolkitPrefix} from './composioClient.js';
import {nativeReleaseFixture} from '../publish/__tests__/nativeReleaseFixture.js';
import {confirmBusinessAction} from './businessActionConfirmations.js';
test('private tool-discovery request text stays local while supported metadata remains available',async t=>{
 const owner='11111111-1111-4111-8111-111111111111',context=createTenantContext({userId:owner,via:'remote_getuser'}),prior=process.env.COMPOSIO_API_KEY;process.env.COMPOSIO_API_KEY='synthetic-platform-key';const env={SUPABASE_URL:'https://composio-provenance-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-audit-store'},before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);const sent:string[]=[];
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{const url=new URL(String(input));if(url.origin===env.SUPABASE_URL){assert.equal(url.pathname,'/rest/v1/production_audit_log');return Response.json(JSON.parse(String(init?.body)));}sent.push(String(init?.body??''));if(url.pathname.endsWith('/search'))return Response.json({tool_schemas:{tool:{toolkit:'slack',tool_slug:'SLACK_GET_MESSAGES',description:'Get messages',input_schema:{type:'object'}}}});if(url.pathname.endsWith('/toolkits'))return Response.json({items:[{slug:'slack',name:'Slack',connected_account:{id:'ca_owned',status:'ACTIVE'}}]});return Response.json({session_id:'trs_owned',config:{user_id:'xroga:'+owner,tags:['readOnlyHint']}});});
 try{const value=await searchComposioTools(owner,{sessionId:'trs_owned',query:'Search Slack messages about the unreleased Acme acquisition amount 918273'},context);assert.equal(value.tools[0]?.slug,'SLACK_GET_MESSAGES');assert.ok(!sent.some(body=>/unreleased|Acme|918273/i.test(body)));}
 finally{for(const[k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v;if(prior===undefined)delete process.env.COMPOSIO_API_KEY;else process.env.COMPOSIO_API_KEY=prior;}
});
test('private connected-app read uses exact existing consent and preserves verified result redaction',async t=>{
 const owner='33333333-3333-4333-8333-333333333333',context=createTenantContext({userId:owner,via:'remote_getuser'}),fixture=nativeReleaseFixture(owner),env={COMPOSIO_API_KEY:'synthetic-composio-key',SUPABASE_URL:'https://composio-provenance-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-store'},prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);let effects=0;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));if(url.origin===env.SUPABASE_URL){if(url.pathname.endsWith('/user_integrations'))return Response.json(null);return(await fixture.database(url,init))!;}
  if(url.pathname.endsWith('/execute')){effects++;return Response.json({result_type:'completed',data:{message:'Verified fixture message',access_token:'SYNTHETIC_PROVIDER_RESULT_CREDENTIAL'}});}
  if(url.pathname.includes('/tools/'))return Response.json({slug:'SLACK_GET_MESSAGES',toolkit:{slug:'slack'},tags:['readOnlyHint']});
  if(url.pathname.endsWith('/search'))return Response.json({tool_schemas:{tool:{toolkit:'slack',tool_slug:'SLACK_GET_MESSAGES',input_schema:{type:'object'}}}});
  if(url.pathname.endsWith('/toolkits'))return Response.json({items:[{slug:'slack',connected_account:{id:'ca_owned',status:'ACTIVE'}}]});
  return Response.json({session_id:'trs_owned',config:{user_id:'xroga:'+owner,tags:['readOnlyHint']}});
 });
 try{
  const pending=await executeComposioReadTool(owner,{tenantContext:context,sessionId:'trs_owned',useCase:'Search Slack messages',toolSlug:'SLACK_GET_MESSAGES',arguments:{query:'Unreleased customer acquisition'}});
  assert.equal(pending.needsConfirmation,true);assert.equal(effects,0);assert.ok(fixture.row);
  const result=await confirmBusinessAction(context,fixture.row.id);assert.equal(effects,1);assert.match(result.execution.resultText,/Verified fixture message/);assert.doesNotMatch(result.execution.resultText,/SYNTHETIC_PROVIDER_RESULT_CREDENTIAL/);
 }finally{for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
