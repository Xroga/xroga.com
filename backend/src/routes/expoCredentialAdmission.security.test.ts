import test from'node:test';import assert from'node:assert/strict';import express from'express';import{randomUUID}from'node:crypto';
import router from'./publish.js';import type{AuthRequest}from'../middleware/auth.js';import{createTenantContext}from'../security/tenantContext.js';import{resetCredentialVaultRuntimeForTests}from'../services/integrations/credentialVaultRuntime.js';

test('actual Expo connection captures credential CAS before identity verification',async t=>{
 const env={NODE_ENV:'test',SUPABASE_URL:'https://expo-manual-epoch.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,19).toString('base64url')},old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);resetCredentialVaultRuntimeForTests();
 t.after(()=>{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const owner=randomUUID(),account=randomUUID(),project=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'}),wire=globalThis.fetch;
 let revision=randomUUID(),mode='revoke',saved=0,projectWrites=0,row:Record<string,unknown>|null=null;const order:string[]=[];
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.hostname==='exp.host'){order.push('verify');if(mode==='revoke')revision=randomUUID();return Response.json({data:{user:{username:'fixture'}}});}
  if(url.origin===env.SUPABASE_URL){
   if(url.pathname.endsWith('/prepare_provider_key_write')){order.push('prepare');return Response.json(revision);}
   if(url.pathname.endsWith('/save_provider_key_if_current')){const body=JSON.parse(String(init?.body));assert.equal(body.p_owner_id,owner);assert.ok(['apikey_expo','apikey_expo_project_id'].includes(body.p_provider));assert.match(body.p_access_token,/^vault:v3:/);assert.doesNotMatch(String(init?.body),/fixture-expo-private-token/);const accepted=body.p_revision===revision;if(accepted){if(body.p_provider==='apikey_expo'){saved++;row={user_id:owner,provider:body.p_provider,access_token:body.p_access_token,metadata:body.p_metadata,credential_revision:revision};}else projectWrites++;}return Response.json(accepted);}
   if(url.pathname.endsWith('/user_integrations')){const provider=url.searchParams.get('provider')?.slice(3);return Response.json(provider==='apikey_expo'?row:null);}
   if(url.pathname.startsWith('/storage/v1/bucket'))return Response.json({public:true});
  }
  if(url.origin==='https://api.expo.dev'){
   order.push('metadata');const body=JSON.parse(String(init?.body));assert.match(body.query,/^\s*query/);
   if(mode==='project-revoke')revision=randomUUID();
   if(mode==='expo-revoke-at-project'&&row)(row.metadata as Record<string,unknown>).revoked=true;
   return Response.json({data:{me:{accounts:[{id:account,name:'fixture',apps:[{id:project,name:'fixture',slug:'fixture'}]}]},app:{byId:{id:mode==='foreign-project'?randomUUID():project,name:'fixture',slug:'fixture',ownerAccount:{id:account,name:'fixture'}}}}});
  }
  throw new Error('Unexpected Expo connection fixture operation '+url.pathname);
 });
 const app=express();app.use(express.json());app.use((req:AuthRequest,_res,next)=>{req.userId=owner;req.tenantContext=context;next();});app.use(router);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));const address=server.address();assert.ok(address&&typeof address!=='string');t.after(()=>new Promise<void>(resolve=>{server.closeAllConnections();server.close(()=>resolve());}));
 for(mode of ['revoke','ok'])await t.test(mode,async()=>{revision=randomUUID();saved=0;row=null;order.length=0;const response=await wire(`http://127.0.0.1:${address.port}/expo-token`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'fixture-expo-private-token'})});assert.equal(order[0],'prepare');assert.equal(saved,mode==='revoke'?0:1);assert.equal(response.status,mode==='revoke'?400:200);const body=await response.json();assert.doesNotMatch(JSON.stringify(body),/fixture-expo-private-token/);await new Promise<void>(resolve=>setImmediate(resolve));});
 const connected=structuredClone(row);
 for(mode of ['project-ok','foreign-project','project-revoke','expo-revoke-at-project'])await t.test(mode,async()=>{
  row=structuredClone(connected);revision=randomUUID();projectWrites=0;order.length=0;
  const response=await wire(`http://127.0.0.1:${address.port}/eas-project`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({projectId:project})});
  assert.equal(order[0],'prepare');assert.equal(projectWrites,mode==='project-ok'?1:0);assert.equal(response.status,mode==='project-ok'?200:400);assert.doesNotMatch(JSON.stringify(await response.json()),/fixture-expo-private-token/);await new Promise<void>(resolve=>setImmediate(resolve));
 });
});
