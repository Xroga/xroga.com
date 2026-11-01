import test from 'node:test';import assert from 'node:assert/strict';import express from 'express';import {createServer} from 'node:http';import {randomUUID} from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import router from './publish.js';import type {AuthRequest} from '../middleware/auth.js';import {createTenantContext} from '../security/tenantContext.js';
import {actionPlanDigest,type BusinessActionPlan} from '../services/integrations/businessAction.js';import {cancelBusinessActionConfirmation} from '../services/integrations/businessActionConfirmations.js';
import {resetCredentialVaultRuntimeForTests} from '../services/integrations/credentialVaultRuntime.js';
interface FixtureRow extends Record<string,unknown>{id:string;user_id:string;status:string;plan:BusinessActionPlan;plan_digest:string;summary:string;toolkit:string;risk:string;created_at:string;expires_at:string;claimed_at:string|null;completed_at:string|null;effect_started_at?:string;failure_code?:unknown}
test('actual signing routes require durable exact approval, owned source and current credentials for one sealed write',async t=>{
 const values={NODE_ENV:'test',SUPABASE_URL:'https://signing-routes-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-signing-fixture',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,11).toString('base64url')},previous=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));Object.assign(process.env,values);resetCredentialVaultRuntimeForTests();
 t.after(()=>{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 const owner=randomUUID(),foreign=randomUUID(),project=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'}),native=globalThis.fetch;
 const imported=await import('libsodium-wrappers'),sodium=imported.default??imported;await sodium.ready;const pair=sodium.crypto_box_keypair();
 let mode='ok',actor='owner',revision='one',sourceNote='initial',connectionNote='initial',revoked=false,normalizeTime=false,projectOwner=owner,effects=0,providerReads=0,dbReads=0,audits=0;
 const token='GITHUB_PRIVATE_SIGNING_CANARY',material='CSC_PRIVATE_SIGNING_CANARY',key=sodium.to_base64(pair.publicKey,sodium.base64_variants.ORIGINAL);
 let row:FixtureRow|null=null;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input)),body=init?.body?JSON.parse(String(init.body)) as Record<string,unknown>:null;
  if(url.origin==='https://api.github.com'){
   assert.equal(init?.redirect,'manual');assert.ok(init?.signal);assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+token);
   if(url.pathname.endsWith('/public-key')){providerReads++;return Response.json({key,key_id:mode==='public-key-rotated'?'other-key':'fixture-key'});}
   assert.equal(url.pathname,'/repos/Owner/repo/actions/secrets/CSC_LINK');assert.equal(init?.method,'PUT');assert.ok(row?.effect_started_at);assert.ok(audits>0);effects++;
   assert.doesNotMatch(String(init.body),/CSC_PRIVATE_SIGNING_CANARY/);assert.ok(body&&typeof body.encrypted_value==='string');
   assert.equal(sodium.to_string(sodium.crypto_box_seal_open(sodium.from_base64(body.encrypted_value,sodium.base64_variants.ORIGINAL),pair.publicKey,pair.privateKey)),material);
   if(mode==='provider200')return Response.json({unexpected:'acknowledgement'});
   if(mode==='provider403'||mode==='provider503')return Response.json({error:token+' '+material},{status:mode==='provider403'?403:503});
   if(mode==='redirect')return new Response(null,{status:307,headers:{location:'https://foreign.invalid/collect'}});
   if(mode==='revoke-after-write')revoked=true;
   return new Response(null,{status:204});
  }
  if(url.origin!==values.SUPABASE_URL)return native(input,init);
  dbReads++;
  if(url.pathname==='/rest/v1/projects'){
   assert.equal(url.searchParams.get('user_id'),'eq.'+owner);return Response.json({id:project,user_id:projectOwner,github_repo_name:'Owner/repo'});
  }
  if(url.pathname==='/rest/v1/github_integrations')return Response.json({user_id:owner,access_token:token});
  if(url.pathname==='/rest/v1/user_integrations'){
   assert.equal(url.searchParams.get('user_id'),'eq.'+owner);const provider=url.searchParams.get('provider')?.slice(3);
   return Response.json(provider==='github'?{user_id:owner,provider,access_token:token,credential_revision:null,metadata:{note:connectionNote}}:provider==='apikey_electron_csc_link'?{user_id:owner,provider,access_token:'enc:'+Buffer.from('fixture:'+material).toString('base64'),credential_revision:revision,metadata:{revoked,note:sourceNote}}:null);
  }
  if(url.pathname==='/rest/v1/production_audit_log'){
   assert.ok(body);assert.equal(body.user_id,owner);assert.doesNotMatch(JSON.stringify(body),/PRIVATE_SIGNING_CANARY/);audits++;
   if(mode==='audit-fail')return Response.json({message:'synthetic outage'},{status:503});
   if(mode==='revoke-at-audit')revoked=true;if(mode==='revise-at-audit')revision='two';if(mode==='foreign-project-at-audit')projectOwner=foreign;
   if(mode==='source-metadata-at-audit')sourceNote='replaced';if(mode==='connection-metadata-at-audit')connectionNote='replaced';
   if(mode==='cancel-at-audit'&&row)row.status='cancelled';return Response.json(body);
  }
  if(url.pathname==='/rest/v1/business_action_confirmations'){
   if(init?.method==='POST'){assert.ok(body);row={...body,id:randomUUID(),created_at:new Date().toISOString(),claimed_at:null,completed_at:null,...(normalizeTime?{expires_at:String(body.expires_at).replace('Z','+00:00')}:{})} as FixtureRow;return Response.json(row);}
   if(!row||url.searchParams.get('id')!=='eq.'+row.id||url.searchParams.get('user_id')!=='eq.'+row.user_id)return Response.json(null);
   if(init?.method==='PATCH')Object.assign(row,body);return Response.json(row);
  }
  assert.ok(body&&row);assert.equal(body.p_owner,owner);
  if(url.pathname.endsWith('/claim_business_action_confirmation')){
   if(row.status!=='pending'||body.p_digest!==row.plan_digest)return Response.json(null);row={...row,status:'executing',claimed_at:new Date().toISOString()};return Response.json(row);
  }
  if(url.pathname.endsWith('/authorize_business_action_dispatch')){
   const expected=body.p_expected as FixtureRow;
   const exact=['id','user_id','plan','plan_digest','summary','toolkit','risk','created_at','expires_at','claimed_at'].every(k=>isDeepStrictEqual(expected[k],row![k]));
   if(mode==='cancel-at-claim')row.status='cancelled';
   const response=Response.json(exact&&row.status==='executing'&&Date.parse(row.expires_at)>Date.now()?{...row,effect_started_at:row.effect_started_at??=new Date().toISOString()}:null);
   if(mode==='cancel-after-claim')row.status='cancelled';if(mode==='expire-after-claim')row.expires_at=new Date(0).toISOString();return response;
  }
  if(url.pathname.endsWith('/finish_business_action_confirmation')){
   if(row.status!=='executing')return Response.json(null);const expected=body.p_expected as FixtureRow;
   row={...row,status:String(body.p_status),failure_code:body.p_failure_code,completed_at:new Date().toISOString(),...(expected.effect_receipt?{effect_receipt:{...expected.effect_receipt as Record<string,unknown>,outcome:body.p_status==='consumed'?'provider_reported_success':'dispatch_uncertain',recordedAt:new Date().toISOString()}}:{})};return Response.json(row);
  }
  throw new Error('Unexpected fixture database operation '+url.pathname);
 });
 const app=express();app.use(express.json());app.use((req:AuthRequest,_res,next)=>{req.userId=owner;req.tenantContext=actor==='missing'?undefined:actor==='clone'?{...context}:actor==='foreign'?createTenantContext({userId:foreign,via:'remote_getuser'}):context;next();});app.use(router);
 const server=createServer(app);await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}`;
 t.after(async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));});
 const prepare=()=>native(base+'/sync-electron-secrets',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({repoFullName:'Owner/repo'})});
 const confirm=()=>{assert.ok(row);return native(base+'/sync-electron-secrets/'+row.id+'/confirm',{method:'POST'});};
 for(actor of ['missing','clone','foreign'])await t.test('preparation rejects '+actor+' actor without credential reads',async()=>{const before=[dbReads,providerReads,effects];assert.equal((await prepare()).status,403);assert.deepEqual([dbReads,providerReads,effects],before);});
 actor='owner';
 for(const scenario of ['ok','postgres-timestamps','jsonb-key-order','provider-restart','concurrent','cancelled','foreign-project','changed-target','wrong-operation','ciphertext-substitution','proof-substitution','extra-body','public-key-rotated','revoke-before-confirm','audit-fail','revoke-at-audit','revise-at-audit','source-metadata-at-audit','connection-metadata-at-audit','foreign-project-at-audit','cancel-at-audit','cancel-at-claim','cancel-after-claim','expire-after-claim','provider200','provider403','provider503','ok-after503','redirect','revoke-after-write'])await t.test(scenario,async()=>{
  mode='ok';revision='one';sourceNote='initial';connectionNote='initial';revoked=false;normalizeTime=scenario==='postgres-timestamps';projectOwner=owner;effects=0;audits=0;row=null;
  const prepared=await prepare();assert.equal(prepared.status,202);const preview=await prepared.json() as {needsConfirmation:boolean;confirmations:Array<{id:string;toolSlug:string}>};assert.equal(preview.needsConfirmation,true);assert.equal(preview.confirmations.length,1);assert.equal(preview.confirmations[0].toolSlug,'XROGA_SET_SIGNING_MATERIAL');assert.equal(effects,0);assert.doesNotMatch(JSON.stringify(preview),/PRIVATE_SIGNING_CANARY/);
  const current=row as FixtureRow|null;assert.ok(current);mode=scenario;
  assert.doesNotMatch(JSON.stringify(preview),/encrypted_value|nativeSigningProof|argumentsPreview/);
  if(mode==='provider-restart')resetCredentialVaultRuntimeForTests();
  if(mode==='jsonb-key-order'){
   const reorder=(value:unknown):unknown=>Array.isArray(value)?value.map(reorder):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reorder(item)])):value;
   current.plan=reorder(current.plan) as BusinessActionPlan;
  }
  if(mode==='concurrent'){const results=await Promise.all([confirm(),confirm()]);assert.equal(results.filter(v=>v.status===200).length,1);assert.equal(effects,1);return;}
  if(mode==='cancelled')await cancelBusinessActionConfirmation(owner,current.id);
  if(mode==='foreign-project')projectOwner=foreign;if(mode==='revoke-before-confirm')revoked=true;
  if(['changed-target','wrong-operation','ciphertext-substitution','proof-substitution','extra-body'].includes(mode)){
   if(mode==='changed-target')current.plan.arguments.repository='Other/repo';
   if(mode==='wrong-operation')current.plan.toolkit='github';
   if(mode==='ciphertext-substitution'){const body=current.plan.arguments.body as Record<string,unknown>;body.encrypted_value=Buffer.alloc(Buffer.byteLength(material)+sodium.crypto_box_SEALBYTES,65).toString('base64');}
   if(mode==='proof-substitution')current.plan.scopeRequirements={nativeSigningProof:'vault:v3:unissued'};
   if(mode==='extra-body')(current.plan.arguments.body as Record<string,unknown>).unapproved='unexpected material';
   const {planDigest:_,...unsigned}=current.plan;current.plan.planDigest=actionPlanDigest(unsigned);current.plan_digest=current.plan.planDigest;current.toolkit=current.plan.toolkit;
  }
  const readsBeforeConfirm=providerReads,response=await confirm(),result=await response.json();
  if(mode==='ok'||mode==='provider-restart'||mode==='jsonb-key-order'||mode==='postgres-timestamps'||mode==='ok-after503'){assert.equal(response.status,200);assert.equal((row as FixtureRow|null)?.status,'consumed');assert.equal(effects,1);}
  else {assert.notEqual(response.status,200);assert.equal(effects,['provider200','provider403','provider503','redirect','revoke-after-write'].includes(mode)?1:0);}
  if(['changed-target','wrong-operation','ciphertext-substitution','proof-substitution','extra-body'].includes(mode))assert.equal(providerReads,readsBeforeConfirm,'invalid approval must not dispatch even a repository-key request');
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE_SIGNING_CANARY/);const count=effects;assert.notEqual((await confirm()).status,200);assert.equal(effects,count,'no retry after consumed, denied or uncertain transfer');
 });
});
