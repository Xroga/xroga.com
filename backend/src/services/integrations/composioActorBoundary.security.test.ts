import test from 'node:test';import assert from 'node:assert/strict';
import {createTenantContext} from '../../security/tenantContext.js';
import {getComposioCatalogToolkit,listComposioCatalog} from './composioClient.js';
import {createReadOnlyComposioSession,createActionComposioSession,getComposioSession,assertComposioSession,assertReadOnlyComposioSession,searchComposioTools,searchComposioActionTools,listComposioToolkits,listConnectedComposioToolkits,createComposioConnectionLink,listUserCustomMcpToolkits,createUserCustomMcpToolkit,syncUserCustomMcpToolkit,deleteUserCustomMcpToolkit,upsertComposioTriggerForUser,xrogaCustomToolkitPrefix} from './composioClient.js';

test('every tenant Composio entry rejects a raw user ID before any provider request',async t=>{
 const owner='11111111-1111-4111-8111-111111111111',sessionId='trs_owned',toolkit=xrogaCustomToolkitPrefix(owner)+'fixture',prior=process.env.COMPOSIO_API_KEY;process.env.COMPOSIO_API_KEY='synthetic-platform-key';let effects=0;
 t.mock.method(globalThis,'fetch',async()=>{effects++;return Response.json({session_id:sessionId,config:{user_id:'xroga:'+owner,tags:['readOnlyHint']},items:[],tool_schemas:{},toolkits:[],toolkit:{slug:'slack'}});});
 const entries:Array<[string,()=>Promise<unknown>]>=[
  ['create read session',()=>createReadOnlyComposioSession(owner)],['create action session',()=>createActionComposioSession(owner)],
  ['get session',()=>getComposioSession(sessionId)],['assert session',()=>assertComposioSession(owner,sessionId,'read')],['assert read session',()=>assertReadOnlyComposioSession(owner,sessionId)],
  ['tool search',()=>searchComposioTools(owner,{query:'Find Slack messages'})],['action search',()=>searchComposioActionTools(owner,{query:'Send a Slack message'})],
  ['toolkits',()=>listComposioToolkits(owner,{sessionId})],['connected toolkits',()=>listConnectedComposioToolkits(owner,{sessionId})],
  ['connection link',()=>createComposioConnectionLink(owner,{sessionId,toolkit:'slack',callbackUrl:'https://xroga.com/dashboard/integrations'})],
  ['custom list',()=>listUserCustomMcpToolkits(owner)],['custom create',()=>createUserCustomMcpToolkit(owner,{name:'Fixture server',serverUrl:'https://public.example/mcp',authMode:'none'})],
  ['custom sync',()=>syncUserCustomMcpToolkit(owner,{toolkit})],['custom delete',()=>deleteUserCustomMcpToolkit(owner,toolkit)],
  ['trigger upsert',()=>upsertComposioTriggerForUser(owner,{toolkit:'slack',triggerSlug:'SLACK_NEW_MESSAGE',triggerConfig:{channel:'approved-channel'}})],
 ];
 try{for(const[name,run]of entries)await t.test(name,async()=>{const before=effects;await assert.rejects(run(),{code:'TENANT_AUTH_REQUIRED'});assert.equal(effects,before,'No provider request before original actor admission');});}
 finally{if(prior===undefined)delete process.env.COMPOSIO_API_KEY;else process.env.COMPOSIO_API_KEY=prior;}
});

test('catalog search text and credential canaries never leave in metadata requests',async t=>{
 const prior=process.env.COMPOSIO_API_KEY;process.env.COMPOSIO_API_KEY='synthetic-catalog-key';const sent:string[]=[];
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>{sent.push(String(input));return Response.json({items:[{slug:'gmail',name:'Gmail',meta:{description:'Email messages'}}]});});
 try{
  const found=await listComposioCatalog({search:'Gmail'});assert.equal(found.items[0]?.slug,'gmail');
  await listComposioCatalog({search:'Unreleased private acquisition 918273'});assert.ok(!sent.some(url=>/Unreleased|acquisition|918273|search=/i.test(url)));
  const before=sent.length;await assert.rejects(getComposioCatalogToolkit('synthetic-catalog-key'));assert.equal(sent.length,before);
 }finally{if(prior===undefined)delete process.env.COMPOSIO_API_KEY;else process.env.COMPOSIO_API_KEY=prior;}
});

test('custom metadata caches never substitute another actor or an old platform credential',async t=>{
 const owner='33333333-3333-4333-8333-333333333333',other='44444444-4444-4444-8444-444444444444',actor=createTenantContext({userId:owner,via:'remote_getuser'}),foreign=createTenantContext({userId:other,via:'remote_getuser'}),prior=process.env.COMPOSIO_API_KEY,slug=xrogaCustomToolkitPrefix(owner)+'cache_fixture';process.env.COMPOSIO_API_KEY='synthetic-cache-key';let calls=0;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>{calls++;return String(input).includes('/toolkits/'+slug)?Response.json({slug,name:'Owned fixture',no_auth:true,meta:{app_url:'https://public.example/mcp'}}):Response.json({items:[{slug,name:'Owned fixture'},{slug:'gmail',name:'Gmail'}]});});
 try{
  assert.equal((await getComposioCatalogToolkit(slug,actor)).slug,slug);const before=calls;
  await assert.rejects(getComposioCatalogToolkit(slug,foreign));await assert.rejects(getComposioCatalogToolkit(slug));assert.equal(calls,before);
  assert.ok((await listComposioCatalog({},actor)).items.some(item=>item.slug===slug));assert.ok(!(await listComposioCatalog({},foreign)).items.some(item=>item.slug===slug));
  process.env.COMPOSIO_API_KEY='rotated-cache-key';const pinned=calls;await assert.rejects(getComposioCatalogToolkit('gmail',actor),{code:'COMPOSIO_CREDENTIAL_CHANGED'});assert.equal(calls,pinned);
  assert.equal((await listComposioCatalog({},createTenantContext({userId:owner,via:'remote_getuser'}))).items.length,2);
 }finally{if(prior===undefined)delete process.env.COMPOSIO_API_KEY;else process.env.COMPOSIO_API_KEY=prior;}
});

test('archived Composio session config cannot restore read authority',async t=>{
 const owner='11111111-1111-4111-8111-111111111111',context=createTenantContext({userId:owner,via:'remote_getuser'}),prior=process.env.COMPOSIO_API_KEY;process.env.COMPOSIO_API_KEY='synthetic-platform-key';
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0])=>String(input).includes('/config_history')?Response.json({items:[{is_current:false,config:{user_id:'xroga:'+owner,tags:['readOnlyHint']}}]}):Response.json({session_id:'trs_owned',config:{user_id:'xroga:'+owner}}));
 try{await assert.rejects(assertReadOnlyComposioSession(owner,'trs_owned',context));}
 finally{if(prior===undefined)delete process.env.COMPOSIO_API_KEY;else process.env.COMPOSIO_API_KEY=prior;}
});

test('Composio private entries keep the original actor and terminal provider authorization errors',async t=>{
 const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',context=createTenantContext({userId:owner,via:'remote_getuser'}),prior=process.env.COMPOSIO_API_KEY;process.env.COMPOSIO_API_KEY='synthetic-platform-key';let calls=0,foreign=false,status=200;
 t.mock.method(globalThis,'fetch',async()=>{calls++;return Response.json({session_id:'trs_owned',config:{user_id:'xroga:'+(foreign?other:owner),tags:['readOnlyHint']}},{status});});
 try{
  for(const invalid of [{...context},JSON.parse(JSON.stringify(context))])await assert.rejects(createReadOnlyComposioSession(owner,invalid),{code:'TENANT_AUTH_REQUIRED'});
  assert.equal(calls,0);await assert.rejects(createReadOnlyComposioSession(other,context));assert.equal(calls,0);
  assert.equal((await createReadOnlyComposioSession(owner,context)).session_id,'trs_owned');
  foreign=true;await assert.rejects(getComposioSession('trs_owned',context));await assert.rejects(createReadOnlyComposioSession(owner,context));foreign=false;
  for(status of [401,403])await assert.rejects(getComposioSession('trs_owned',context),{code:'COMPOSIO_PROVIDER_AUTHORIZATION_DENIED'});
 }finally{if(prior===undefined)delete process.env.COMPOSIO_API_KEY;else process.env.COMPOSIO_API_KEY=prior;}
});
