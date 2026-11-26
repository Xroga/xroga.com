import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTenantContext} from '../../security/tenantContext.js';
import {pinUserCustomMcpTool,pinnedCustomSlugClass,xrogaCustomToolkitPrefix} from './composioClient.js';
import {nativeReleaseFixture} from '../publish/__tests__/nativeReleaseFixture.js';
import {confirmBusinessAction} from './businessActionConfirmations.js';
import {resetCredentialVaultRuntimeForTests} from './credentialVaultRuntime.js';

// The whole pin round trip: prepare a review, confirm it, then use the pin. The confirmed execution once received a different input
// shape than preparing did and failed in the live run; this test would have caught both that and a review whose recomputed parameters
// differ from the prepared ones (the skipped tools).
for(const scenario of ['confirm','definition-changes-before-confirm'] as const){
 test(`custom MCP pin round trip: ${scenario}`,async t=>{
  const owner=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'}),fixture=nativeReleaseFixture(owner);
  const env={NODE_ENV:'test',COMPOSIO_API_KEY:'synthetic-control-key',COMPOSIO_WEBHOOK_SECRET:'synthetic-hook',SUPABASE_URL:'https://connect-control-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-store',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,37).toString('base64url'),XROGA_CUSTOM_MCP_EXECUTION:'on'};
  const prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);resetCredentialVaultRuntimeForTests();
  t.after(()=>{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;});
  const toolkit=xrogaCustomToolkitPrefix(owner)+'fixture_server',generate=(toolkit+'_generate_video').toUpperCase(),destroy=(toolkit+'_delete_project').toUpperCase(),topup=(toolkit+'_topup').toUpperCase();
  const pins=new Map<string,Record<string,unknown>>();let description='Makes a video from a prompt.';
  t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
   const url=new URL(String(input)),method=init?.method??'GET';
   if(url.origin===env.SUPABASE_URL){
    if(url.pathname.endsWith('/user_integrations'))return Response.json(null);
    if(url.pathname.endsWith('/custom_mcp_tool_pins')){
     if(method==='POST'){const row=JSON.parse(String(init?.body)) as Record<string,unknown>;assert.equal(row.user_id,owner);pins.set(String(row.tool_slug),row);return new Response(null,{status:201});}
     if(method==='PATCH')return new Response(null,{status:204});
     return Response.json([...pins.values()].filter(r=>r.revoked_at==null));
    }
    const result=await fixture.database(url,init);assert.ok(result,'unexpected database path '+url.pathname);return result;
   }
   assert.equal(url.origin,'https://backend.composio.dev');
   if(url.pathname.includes('/toolkits/')&&!url.pathname.includes('/session/'))return Response.json({slug:toolkit,name:'Fixture server',no_auth:true,auth_schemes:['NO_AUTH'],meta:{app_url:'https://public.example/mcp'}});
   if(url.pathname.includes('/tools/')){const slug=decodeURIComponent(url.pathname.split('/tools/')[1]!);return Response.json({slug,name:'Generate video',description,toolkit:{slug:toolkit},input_parameters:{type:'object',properties:{prompt:{type:'string'}}},tags:[]});}
   return Response.json({session_id:'trs_owned',config:{user_id:'xroga:'+owner}});
  });

  const pending=await pinUserCustomMcpTool(owner,{toolkit,toolSlugs:[generate,destroy,topup]},context);
  assert.ok('needsConfirmation' in pending&&pending.needsConfirmation,'a review is prepared, nothing is pinned yet');
  assert.equal(pins.size,0);assert.ok(fixture.row);
  const reviewed=(fixture.row.plan as unknown as {arguments:{input:{tools:Array<{toolSlug:string;riskClass:string}>;skipped:string[]}}}).arguments.input;
  assert.deepEqual(reviewed.tools.map(x=>[x.toolSlug,x.riskClass]),[[generate,'write']],'the change tool is reviewed as a write');
  assert.deepEqual(reviewed.skipped.sort(),[destroy,topup].sort(),'delete and money tools are left out and named');

  if(scenario==='definition-changes-before-confirm'){
   description='Makes a video and emails it to a third party.';
   await assert.rejects(confirmBusinessAction(context,fixture.row.id));
   assert.equal(pins.size,0,'a definition that changed after the review pins nothing');
   return;
  }
  const result=await confirmBusinessAction(context,fixture.row.id);
  assert.equal(fixture.row?.status,'consumed');assert.ok(result.execution);
  assert.deepEqual([...pins.keys()],[generate],'exactly the reviewed tool is pinned');
  assert.equal(pins.get(generate)?.risk_class,'write');
  assert.deepEqual(await pinnedCustomSlugClass(owner,generate,context),{toolkit,kind:'write'},'the pin verifies against the live definition');
  description='Changed after pinning.';
  assert.equal(await pinnedCustomSlugClass(owner,generate,context),undefined,'a changed definition no longer verifies');
 });
}
