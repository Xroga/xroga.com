import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import{createServer}from'node:http';import{randomUUID}from'node:crypto';
import router from './publish.js';import type{AuthRequest}from'../middleware/auth.js';import{createTenantContext}from'../security/tenantContext.js';
import{resetCredentialVaultRuntimeForTests}from'../services/integrations/credentialVaultRuntime.js';

test('actual CWS manual connection pins credential write admission before Google validation',async t=>{
 const env={NODE_ENV:'test',SUPABASE_URL:'https://cws-manual-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,13).toString('base64url')},old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);resetCredentialVaultRuntimeForTests();
 t.after(()=>{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const owner=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'}),native=globalThis.fetch;
 let revision=randomUUID(),mode='ok',saved=0;const order:string[]=[];
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.hostname==='oauth2.googleapis.com'){order.push('google');if(mode==='revoke')revision=randomUUID();return Response.json({access_token:'synthetic-manual-access'});}
  if(url.origin!==env.SUPABASE_URL)return native(input,init);
  if(url.pathname.endsWith('/prepare_provider_key_write')){order.push('prepare');return Response.json(revision);}
  if(url.pathname.endsWith('/save_provider_key_if_current')){
   const body=JSON.parse(String(init?.body));assert.equal(body.p_owner_id,owner);assert.equal(body.p_provider,'apikey_cws_oauth');assert.match(body.p_access_token,/^vault:v3:/);assert.doesNotMatch(String(init?.body),/opaque-client-fixture|opaque-refresh-fixture/);
   const accepted=body.p_revision===revision;if(accepted)saved++;return Response.json(accepted);
  }
  if(url.pathname.startsWith('/storage/v1/bucket'))return Response.json({public:true});
  throw new Error('Unexpected manual CWS fixture operation '+url.pathname);
 });
 const app=express();app.use(express.json());app.use((req:AuthRequest,_res,next)=>{req.userId=owner;req.tenantContext=context;next();});app.use(router);
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
 for(mode of ['ok','revoke'])await t.test(mode,async()=>{
  order.length=0;saved=0;revision=randomUUID();
  const response=await native(`http://127.0.0.1:${address.port}/cws-credentials`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientId:'client-fixture',clientSecret:'opaque-client-fixture',refreshToken:'opaque-refresh-fixture',extensionId:'extension-fixture',publisherId:'publisher-fixture'})});
  const result=await response.json();assert.doesNotMatch(JSON.stringify(result),/opaque-client-fixture|opaque-refresh-fixture/);
  assert.equal(order[0],'prepare','The current revision must be captured before provider I/O');
  assert.equal(response.status,mode==='ok'?200:400);assert.equal(saved,mode==='ok'?1:0,'Revocation during validation cannot revive the credential');
  await new Promise<void>(r=>setImmediate(r));
 });
});
