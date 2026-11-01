import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {createTenantContext} from '../../security/tenantContext.js';
import {preparedActionDigest} from '../../security/authority/digest.js';
import {prepareSupabaseProjectCreation} from './supabaseProjectCreation.js';
import {confirmBusinessAction} from './businessActionConfirmations.js';
import {resetCredentialVaultRuntimeForTests,sealRuntimeCredential,runtimeCredentialVault} from './credentialVaultRuntime.js';
import {nativeReleaseFixture} from '../publish/__tests__/nativeReleaseFixture.js';
import express from 'express';
import {createServer} from 'node:http';
import router from '../../routes/supabaseOAuth.js';
import type {AuthRequest} from '../../middleware/auth.js';

for(const scenario of ['success','restart','concurrent','deadline','source-after-create','free-quota-denied','paid-org','foreign-org','plan-at-audit','source-at-audit','cancel-at-audit','cancel-after-claim','audit-fail','changed-plan','foreign-confirmation','auth403','redirect','oversized','bad-receipt','bad-readback','uncertain-stream','provider503'] as const){
 test(`Supabase exact project creation: ${scenario}`,async t=>{
  const owner=randomUUID(),actor=createTenantContext({userId:owner,via:'remote_getuser'}),fixture=nativeReleaseFixture(owner),env={NODE_ENV:'test',SUPABASE_URL:'https://supabase-create-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-store',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,42).toString('base64url')},prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);resetCredentialVaultRuntimeForTests();
  t.after(()=>{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;});
  const vaultRevision=randomUUID(),metadata={vault_format:'oauth-v1',vault_revision:vaultRevision,expires_at:new Date(Date.now()+3600000).toISOString()},token='SYNTHETIC_SUPABASE_OAUTH_TOKEN';
  const row={user_id:owner,provider:'supabase_oauth',access_token:await sealRuntimeCredential(owner,{provider:'supabase_oauth',account:'supabase_oauth',credentialType:'oauth-token',recordId:'supabase_oauth',revision:vaultRevision,scope:'oauth-connection'},JSON.stringify({access_token:token,refresh_token:null})),refresh_token:null,metadata,credential_revision:randomUUID()};
  let paid=scenario==='paid-org',writes=0,calls=0,attempting=false,password='',recovery=false;const input={name:'Exact fixture',organizationId:'org-id',region:'us-east-1'},org={id:'org-id',slug:'owned-org',name:'Owned fixture'},created={id:'opaque-created-id',ref:'createdproject',organization_slug:org.slug,name:input.name,region:input.region,status:'INACTIVE'};
  t.mock.method(globalThis,'fetch',async(target:Parameters<typeof fetch>[0],init?:RequestInit)=>{
   const url=new URL(String(target)),method=init?.method??'GET';
   if(url.origin===env.SUPABASE_URL){
    if(url.pathname.endsWith('/user_integrations')){assert.equal(url.searchParams.get('user_id'),'eq.'+owner);return Response.json(url.searchParams.get('provider')?.startsWith('in.')?[row]:row);}
    const result=await fixture.database(url,init);assert.ok(result,url.pathname);
    if(url.pathname.endsWith('/production_audit_log')){if(scenario==='plan-at-audit')paid=true;if(scenario==='source-at-audit')row.credential_revision=randomUUID();assert.doesNotMatch(String(init?.body),new RegExp(token));if(password)assert.ok(!String(init?.body).includes(password));}
    return result;
   }
   calls++;assert.equal(url.origin,'https://api.supabase.com');assert.equal(init?.redirect,'manual');assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer '+token);
   if(url.pathname==='/v1/organizations')return Response.json(scenario==='foreign-org'?[]:[org]);
   if(url.pathname==='/v1/organizations/owned-org')return Response.json({id:org.id,plan:paid?'pro':'free'});
   if(url.pathname==='/v1/projects'&&method==='POST'){
    writes++;const body=JSON.parse(String(init?.body));assert.deepEqual(Object.keys(body).sort(),['db_pass','name','organization_slug','region']);assert.equal(body.organization_slug,org.slug);assert.equal(body.name,input.name);assert.equal(body.region,input.region);assert.match(body.db_pass,/^[A-Za-z0-9_-]{32}$/);password=body.db_pass;
    if(scenario==='auth403')return Response.json({message:token},{status:403});
    if(scenario==='free-quota-denied')return Response.json({message:'Free project quota reached'},{status:402});
    if(scenario==='provider503'&&!recovery)return Response.json({message:token},{status:503});
    if(scenario==='redirect')return Response.redirect('https://attacker.example/collect',307);
    if(scenario==='oversized')return new Response('x'.repeat(128001));
    if(scenario==='uncertain-stream')return new Response(new ReadableStream({start(controller){controller.error(Error('Private failure '+token));}}));
    if(scenario==='source-after-create')row.credential_revision=randomUUID();
    return Response.json({...created,...(scenario==='bad-receipt'?{organization_slug:'foreign-org'}:{})});
   }
   if(url.pathname==='/v1/projects/createdproject')return Response.json({...created,...(scenario==='bad-readback'?{ref:'foreignproject'}:{})});
   throw Error('Unexpected provider path '+url.pathname);
  });
  if(['paid-org','foreign-org'].includes(scenario)){await assert.rejects(prepareSupabaseProjectCreation(actor,input));assert.equal(writes,0);assert.equal(fixture.row,null);return;}
  const pending=await prepareSupabaseProjectCreation(actor,input);assert.equal(pending.needsConfirmation,true);assert.equal(writes,0);assert.ok(fixture.row);assert.equal(fixture.row.plan.authority?.maxSpendMicroUsd,'0');assert.doesNotMatch(JSON.stringify(fixture.row.plan.arguments),/db_pass|databasePassword|SYNTHETIC_SUPABASE_OAUTH_TOKEN/);
  const plan=structuredClone(fixture.row.plan),id=fixture.row.id;
  if(['cancel-at-audit','cancel-after-claim','audit-fail'].includes(scenario))fixture.mode=scenario;
  if(scenario==='changed-plan')fixture.row.plan.arguments.input={...input,name:'Unapproved replacement'};
  if(scenario==='foreign-confirmation'){
   await assert.rejects(confirmBusinessAction(createTenantContext({userId:randomUUID(),via:'remote_getuser'}),id));assert.equal(writes,0);return;
  }
  attempting=true;const good=['success','restart','concurrent'].includes(scenario);
  if(scenario==='restart')resetCredentialVaultRuntimeForTests();
  if(scenario==='deadline')t.mock.method(AbortSignal,'timeout',()=>AbortSignal.abort(new DOMException('Synthetic deadline','TimeoutError')));
  if(scenario==='concurrent'){const attempts=await Promise.allSettled([confirmBusinessAction(actor,id),confirmBusinessAction(actor,id)]);assert.equal(attempts.filter(item=>item.status==='fulfilled').length,1);assert.equal(writes,1);return;}
  if(good){const result=await confirmBusinessAction(actor,id);assert.equal(fixture.row?.status,'consumed');assert.equal(writes,1);assert.match(result.execution.resultText,/createdproject/);assert.doesNotMatch(result.execution.resultText,/db_pass|databasePassword|SYNTHETIC_SUPABASE_OAUTH_TOKEN/);assert.ok(!result.execution.resultText.includes(password));assert.equal(JSON.parse(result.execution.resultText).provisioned,false);}
  else{await assert.rejects(confirmBusinessAction(actor,id),error=>{assert.doesNotMatch(String(error),/SYNTHETIC_SUPABASE_OAUTH_TOKEN|Private failure/);if(password)assert.ok(!String(error).includes(password));return true;});assert.notEqual(fixture.row?.status,'consumed');assert.equal(writes,['source-after-create','free-quota-denied','auth403','redirect','oversized','bad-receipt','bad-readback','uncertain-stream','provider503'].includes(scenario)?1:0);}
  const before=writes;await assert.rejects(confirmBusinessAction(actor,id));assert.equal(writes,before,'A denied, uncertain or completed request is never replayed');
  // The server can recover generated DB authentication material from the original
  // encrypted durable proposal even after an ambiguous provider response.
  const{scopeRequirements:proof,planDigest:_digest,...value}=plan,hash=preparedActionDigest(JSON.parse(JSON.stringify(value))),nonce=plan.authority!.nonce;
  const escrow=JSON.parse(await runtimeCredentialVault().open(actor,{tenant:owner,owner,provider:'supabase-create-plan',account:'supabase',credentialType:'prepared-creation',recordId:nonce,revision:hash,scope:'supabase-project-create'},String((proof as{nativeCreateProof:string}).nativeCreateProof)));
  assert.equal(escrow.digest,hash);assert.match(escrow.databasePassword,/^[A-Za-z0-9_-]{32}$/);if(password)assert.equal(escrow.databasePassword,password);
  assert.ok(attempting&&calls>0);
  if(scenario==='provider503'){recovery=true;const next=await prepareSupabaseProjectCreation(actor,input);assert.equal(next.needsConfirmation,true);assert.ok(fixture.row);await confirmBusinessAction(actor,fixture.row.id);assert.equal(writes,2);assert.equal(fixture.row?.status,'consumed');}
 });
}

test('Supabase project creation rejects raw/forged contexts and credential-bearing names before discovery',async t=>{
 const actor=createTenantContext({userId:randomUUID(),via:'remote_getuser'});let calls=0;t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('No provider call allowed');});
 for(const context of [undefined,{...actor},JSON.parse(JSON.stringify(actor))])await assert.rejects(prepareSupabaseProjectCreation(context as typeof actor,{name:'Fixture',organizationId:'owned-org',region:'us-east-1'}),{code:'TENANT_AUTH_REQUIRED'});
 await assert.rejects(prepareSupabaseProjectCreation(actor,{name:'SYNTHETIC_PRIVATE_CREDENTIAL',organizationId:'owned-org',region:'us-east-1'}));assert.equal(calls,0);
});

test('actual Supabase creation HTTP route returns pending review and preserves the existing connection',async t=>{
 const owner=randomUUID(),fixture=nativeReleaseFixture(owner),env={NODE_ENV:'test',SUPABASE_URL:'https://supabase-create-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-store',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,42).toString('base64url')},prior=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);resetCredentialVaultRuntimeForTests();
 const revision=randomUUID(),row={user_id:owner,provider:'supabase_oauth',access_token:await sealRuntimeCredential(owner,{provider:'supabase_oauth',account:'supabase_oauth',credentialType:'oauth-token',recordId:'supabase_oauth',revision,scope:'oauth-connection'},JSON.stringify({access_token:'SYNTHETIC_OAUTH_TOKEN',refresh_token:null})),refresh_token:null,credential_revision:randomUUID(),metadata:{vault_format:'oauth-v1',vault_revision:revision,expires_at:new Date(Date.now()+3600000).toISOString()}},before=structuredClone(row);
 const app=express();app.use(express.json());app.use((req:AuthRequest,_res,next)=>{req.userId=owner;req.tenantContext=createTenantContext({userId:owner,via:'remote_getuser'});next();});app.use(router);const server=createServer(app);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address();assert.ok(address&&typeof address==='object');const origin='http://127.0.0.1:'+address.port,nativeFetch=globalThis.fetch;let writes=0;
 t.mock.method(globalThis,'fetch',async(target:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(target));if(url.origin===origin)return nativeFetch(target,init);
  if(url.origin===env.SUPABASE_URL){if(url.pathname.endsWith('/user_integrations')){assert.equal(init?.method??'GET','GET');return Response.json(url.searchParams.get('provider')?.startsWith('in.')?[row]:row);}return(await fixture.database(url,init))!;}
  assert.equal(url.origin,'https://api.supabase.com');if(init?.method==='POST')writes++;
  return Response.json(url.pathname==='/v1/organizations'?[{id:'org-id',slug:'owned-org',name:'Owned fixture'}]:{id:'org-id',plan:'free'});
 });
 try{
  const response=await nativeFetch(origin+'/create-project',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Exact route fixture',organizationId:'org-id',region:'us-east-1'})}),body=await response.json() as{ok:boolean;needsConfirmation:boolean;reviewUrl:string};
  assert.equal(response.status,202);assert.equal(body.ok,false);assert.equal(body.needsConfirmation,true);assert.match(body.reviewUrl,/^\/dashboard\/actions\/confirm\/[a-f0-9-]{36}$/);assert.equal(writes,0);assert.deepEqual(row,before);assert.ok(fixture.row);
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(prior))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});
