import assert from 'node:assert/strict';
import {test} from 'node:test';
import {randomUUID} from 'node:crypto';
import {publishChromeExtensionToStore,fetchCwsItemStatus,saveCwsCredentials} from './chromeWebStore.js';
import {storeNativeArtifact} from './nativeArtifact.js';
import {nativeReleaseFixture} from './__tests__/nativeReleaseFixture.js';
import {createTenantContext} from '../../security/tenantContext.js';
import {confirmBusinessAction,cancelBusinessActionConfirmation} from '../integrations/businessActionConfirmations.js';
import {actionPlanDigest} from '../integrations/businessAction.js';
import {resetCredentialVaultRuntimeForTests} from '../integrations/credentialVaultRuntime.js';

test('CWS exact approval, current source and target receipts gate upload, publish and status',async t=>{
 const values={NODE_ENV:'test',SUPABASE_URL:'https://cws-owned-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,13).toString('base64url')},old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);resetCredentialVaultRuntimeForTests();
 t.after(()=>{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const owner=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'}),fixture=nativeReleaseFixture(owner);
 const creds={clientId:'client-fixture',clientSecret:'opaque-client-fixture',refreshToken:'opaque-refresh-fixture',extensionId:'item-a',publisherId:'publisher-a'};
 const receipt={name:'publishers/publisher-a/items/item-a',itemId:'item-a'},accessToken='opaque-derived-access-fixture';
 let mode='ok',publishes=0,uploads=0,refreshes=0,external=0,revoked=false,note='initial';
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin===values.SUPABASE_URL){
   const handled=await fixture.database(url,init);if(handled)return handled;
   if(mode==='connection-at-audit'&&fixture.audits>0)note='reconnected';
   return Response.json({user_id:owner,provider:'apikey_cws_oauth',credential_revision:null,access_token:`enc:${Buffer.from(`fixture:${JSON.stringify(creds)}`).toString('base64')}`,metadata:{note,revoked}});
  }
  external++;assert.equal(init?.redirect,'manual');assert.ok(init?.signal);
  if(url.origin==='https://oauth2.googleapis.com'){
   refreshes++;assert.equal(init?.method,'POST');assert.equal(new URLSearchParams(String(init.body)).get('refresh_token'),creds.refreshToken);
   if(mode==='revoke-at-refresh')revoked=true;
   if(mode==='owner-at-refresh')fixture.projectOwner=randomUUID();
   if(mode==='cancel-at-refresh'&&fixture.row)fixture.row.status='cancelled';
   if(mode==='token403')return Response.json({error:'SECRET'},{status:403});
   if(mode==='token-redirect')return new Response(null,{status:307,headers:{location:'https://foreign.invalid/collect'}});
   return Response.json(mode==='oauth'?{error:'SECRET'}:{access_token:accessToken});
  }
  assert.equal(url.origin,'https://chromewebstore.googleapis.com');
  if(mode==='transport')throw new Error('SECRET');
  if(url.pathname.endsWith(':upload')){
   uploads++;assert.ok(fixture.row?.effect_started_at);assert.ok(fixture.audits>0);assert.equal(init?.method,'POST');assert.ok(Buffer.isBuffer(init.body));assert.equal(url.pathname,'/upload/v2/publishers/publisher-a/items/item-a:upload');
   if(mode==='upload403')return Response.json({error:'SECRET'},{status:403});
   if(mode==='upload503')return Response.json({error:'SECRET'},{status:503});
   if(mode==='upload-redirect')return new Response(null,{status:307,headers:{location:'https://foreign.invalid'}});
   if(mode==='oversize')return new Response('x'.repeat(65537));
   if(mode==='cancel-at-upload'&&fixture.row)fixture.row.status='cancelled';
   if(mode==='revoke-at-upload')revoked=true;
   return Response.json(mode==='null'?null:mode==='empty'?{}:{...receipt,...(mode==='foreign'?{itemId:'other'}:{}),uploadState:mode==='pending'?'IN_PROGRESS':mode==='failed'?'FAILED':'SUCCEEDED'});
  }
  if(url.pathname.endsWith(':publish')){
   publishes++;assert.equal(url.pathname,'/v2/publishers/publisher-a/items/item-a:publish');assert.deepEqual(JSON.parse(String(init?.body)),{publishType:'DEFAULT_PUBLISH'});assert.ok(fixture.row?.effect_started_at);
   if(mode==='publish403')return Response.json({error:'SECRET'},{status:403});
   return Response.json(mode==='bad-publish'?{error:{message:'SECRET'}}:{...receipt,state:'PENDING_REVIEW'});
  }
  assert.equal(url.pathname,'/v2/publishers/publisher-a/items/item-a:fetchStatus');
  if(mode==='foreign-account')return Response.json({error:'SECRET'},{status:403});
  return Response.json(mode==='bad-status'?{...receipt,name:'other',message:'SECRET'}:mode==='empty-status'?receipt:{...receipt,publishedItemRevisionStatus:{state:'PUBLISHED'},submittedItemRevisionStatus:{state:'PENDING_REVIEW'},takenDown:mode==='taken-down'});
 });
 const source=[{path:'manifest.json',content:'{"manifest_version":3,"name":"Synthetic fixture","version":"1.0.0"}'},{path:'main.js',content:'console.log("synthetic fixture")'}];
 for(const scenario of ['ok','restart','concurrent','cancelled','foreign-project','file-changed','file-at-audit','audit-fail','cancel-at-audit','cancel-at-claim','cancel-after-claim','expire-after-claim','connection-before-confirm','connection-at-audit','foreign-account','changed-target','changed-artifact','changed-expiry','changed-proof','empty','null','foreign','pending','failed','oauth','token403','token-redirect','revoke-at-refresh','owner-at-refresh','cancel-at-refresh','upload403','upload503','upload-redirect','oversize','cancel-at-upload','revoke-at-upload','bad-publish','publish403','derived-token-in-source','ok-after-outage'])await t.test(scenario,async()=>{
  mode='ok';revoked=false;note='initial';fixture.mode='ok';fixture.projectOwner=owner;fixture.audits=0;publishes=0;uploads=0;refreshes=0;
  const files=scenario==='derived-token-in-source'?[...source,{path:'opaque.json',content:accessToken}]:source;
  const artifact=await storeNativeArtifact(context,'Owner/repo',files,'chrome',[],fixture.project);
  if(scenario==='derived-token-in-source'){
   await assert.rejects(publishChromeExtensionToStore({userId:owner,tenantContext:context,repoFullName:'Owner/repo',artifact}));assert.deepEqual([uploads,publishes],[0,0]);return;
  }
  const prepared=await publishChromeExtensionToStore({userId:owner,tenantContext:context,repoFullName:'Owner/repo',artifact});
  assert.equal(prepared.needsConfirmation,true);assert.ok(prepared.confirmation);assert.ok(fixture.row);assert.deepEqual([refreshes,uploads,publishes],[1,0,0]);assert.doesNotMatch(JSON.stringify(prepared),/opaque-client-fixture|opaque-refresh-fixture|nativeCwsProof/);
  refreshes=0;
  mode=scenario;fixture.mode=scenario;
  if(mode==='restart')resetCredentialVaultRuntimeForTests();
  if(mode==='cancelled')await cancelBusinessActionConfirmation(owner,fixture.row.id);
  if(mode==='foreign-project')fixture.projectOwner=randomUUID();
  if(mode==='connection-before-confirm')note='reconnected';
  if(mode==='file-changed')fixture.files.get(artifact.fileId)!.delivery_version=2;
  if(mode.startsWith('changed-')){
   if(mode==='changed-target')fixture.row.plan.arguments.publishDestination='https://foreign.invalid/collect';
   if(mode==='changed-artifact')(fixture.row.plan.arguments.artifact as {zipSha256:string}).zipSha256='a'.repeat(64);
   if(mode==='changed-expiry')fixture.row.plan.authority!.expiresAt=new Date(Date.now()+14*60000).toISOString();
   if(mode==='changed-proof')fixture.row.plan.scopeRequirements={nativeCwsProof:'vault:v3:unissued'};
   const{planDigest:_,...unsigned}=fixture.row.plan;fixture.row.plan.planDigest=actionPlanDigest(unsigned);fixture.row.plan_digest=fixture.row.plan.planDigest;fixture.row.expires_at=fixture.row.plan.authority!.expiresAt;
  }
  const confirm=()=>confirmBusinessAction(context,prepared.confirmation!.id);
  if(mode==='concurrent'){const results=await Promise.allSettled([confirm(),confirm()]);assert.equal(results.filter(v=>v.status==='fulfilled').length,1);assert.deepEqual([uploads,publishes],[1,1]);return;}
  if(['ok','restart','ok-after-outage'].includes(mode)){const result=await confirm();assert.equal(JSON.parse(result.execution.resultText).submitted,true);assert.equal(fixture.row.status,'consumed');assert.deepEqual([uploads,publishes],[1,1]);}
  else{
   await assert.rejects(confirm(),error=>{assert.doesNotMatch((error as Error).message,/SECRET|opaque-/);return true;});
   assert.equal(publishes,['bad-publish','publish403'].includes(mode)?1:0);
   assert.equal(uploads,['empty','null','foreign','pending','failed','upload403','upload503','upload-redirect','oversize','cancel-at-upload','revoke-at-upload','bad-publish','publish403'].includes(mode)?1:0);
   if(mode.startsWith('changed-'))assert.equal(refreshes,0,'unissued target/source/expiry fails before credential exchange');
  }
  const counts=[refreshes,uploads,publishes];await assert.rejects(confirm());assert.deepEqual([refreshes,uploads,publishes],counts,'uncertain/denied/consumed approval cannot retry');
 });
 await t.test('owned status preserves exact receipt validation without publication',async()=>{
  revoked=false;note='initial';fixture.projectOwner=owner;fixture.mode='ok';mode='ok';assert.equal((await fetchCwsItemStatus(owner,context)).status,'PENDING_REVIEW');
  mode='taken-down';assert.equal((await fetchCwsItemStatus(owner,context)).status,'TAKEN_DOWN');
  for(mode of ['bad-status','empty-status']){const result=await fetchCwsItemStatus(owner,context);assert.equal(result.ok,false);assert.doesNotMatch(JSON.stringify(result),/SECRET/);}
  mode='transport';await assert.rejects(fetchCwsItemStatus(owner,context),{message:'Chrome Web Store request unavailable. Retry shortly.'});
  for(const bad of ['../other','item?token=SECRET','item%2fother','item/other']){const before=external;await assert.rejects(saveCwsCredentials(owner,{...creds,extensionId:bad},undefined,context),/Invalid Chrome Web Store/);assert.equal(external,before);}
 });
 await t.test('held connected secrets cannot enter a compressed artifact',async()=>{
  mode='ok';fixture.mode='ok';revoked=false;note='initial';const before=external;
  const artifact=await storeNativeArtifact(context,'Owner/repo',[...source,{path:'opaque.json',content:creds.clientSecret}],'chrome',[],fixture.project);
  await assert.rejects(publishChromeExtensionToStore({userId:owner,tenantContext:context,repoFullName:'Owner/repo',artifact}));assert.equal(external,before);
 });
});
