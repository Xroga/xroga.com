import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {createTenantContext} from '../../security/tenantContext.js';
import type {AuthRequest} from '../../middleware/auth.js';
import publishRouter from '../../routes/publish.js';

test('real store-readiness HTTP routes retain selected owner context and never transfer keys',async t=>{
 const owner=randomUUID(),project=randomUUID(),account=randomUUID(),key=randomUUID(),child=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'});
 const env={NODE_ENV:'test',SUPABASE_URL:'https://expo-store-route.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture'},old=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 let issued=true,reads=0,external=0,defaultReads=0,platform='android';
 const app=express();app.use(express.json());app.use((req,_res,next)=>{const request=req as AuthRequest;request.userId=owner;request.tenantContext=issued?context:undefined;next();});app.use(publishRouter);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));t.after(()=>new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve())));
 const address=server.address();assert.ok(address&&typeof address!=='string');const wire=globalThis.fetch;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin===env.SUPABASE_URL){reads++;const provider=url.searchParams.get('provider')?.slice(3)??'';if(provider==='apikey_expo_project_id')defaultReads++;return Response.json({user_id:owner,provider,access_token:provider==='apikey_expo'?'enc:'+Buffer.from('fixture:EXPO_ROUTE_CANARY').toString('base64'):null,credential_revision:null,metadata:{}});}
  external++;assert.equal(url.href,'https://api.expo.dev/graphql');assert.equal(init?.redirect,'manual');const body=JSON.parse(String(init?.body));assert.match(body.query,/^\s*query/);assert.doesNotMatch(String(init?.body),/EXPO_ROUTE_CANARY|private_key|keyP8/);
  if(body.query.includes('XrogaExpoAccountsAdmission'))return Response.json({data:{me:{accounts:[{id:account,name:'fixture'}]}}});
  assert.equal(body.variables.appId,project);
  const row={id:child,app:{id:project},applicationIdentifier:'com.synthetic.fixture',googleServiceAccountKeyForSubmissions:{id:key,privateKeyIdentifier:'public-key-id',clientEmail:'fixture@fixture.iam.gserviceaccount.com'},appleAppIdentifier:{id:randomUUID(),bundleIdentifier:'com.synthetic.fixture'},appStoreConnectApiKeyForSubmissions:{id:key,keyIdentifier:'PUBLICKEY1',issuerIdentifier:'11111111-1111-4111-8111-111111111111'}};
  return Response.json({data:{app:{byId:{id:project,name:'fixture',slug:'fixture',ownerAccount:{id:account,name:'fixture'},androidAppCredentialsList:[row],iosAppCredentialsList:[row]}}}});
 });
 for(platform of ['android','ios']){
  const path=platform==='android'?'/sync-play-credentials':'/sync-apple-credentials',body={projectId:project,...(platform==='android'?{applicationIdentifier:'com.synthetic.fixture'}:{bundleIdentifier:'com.synthetic.fixture'})};
  issued=true;
  let response=await wire(`http://127.0.0.1:${address.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal(response.status,200);const result=await response.json() as{ok:boolean;keyId:string;message:string};assert.equal(result.ok,true);assert.equal(result.keyId,key);assert.match(result.message,/No private key was transferred/);assert.equal(defaultReads,0);
  issued=false;const before=[reads,external];response=await wire(`http://127.0.0.1:${address.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.ok(response.status>=400);assert.deepEqual([reads,external],before);
  issued=true;response=await wire(`http://127.0.0.1:${address.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,projectId:'x'.repeat(129)})});assert.equal(response.status,400);assert.deepEqual([reads,external],before);
 }
});
