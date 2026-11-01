import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTenantContext} from '../../security/tenantContext.js';
import {provisionUserSupabase,runSqlViaManagementApi,runSqlViaDatabasePassword,ensureStorageBuckets} from './supabaseProvision.js';
import pg from 'pg';
import {cancelBusinessActionConfirmation} from './businessActionConfirmations.js';
import {actionPlanDigest} from './businessAction.js';
import {confirmBusinessAction} from './businessActionConfirmations.js';
import {nativeReleaseFixture} from '../publish/__tests__/nativeReleaseFixture.js';
import {resetCredentialVaultRuntimeForTests,sealRuntimeCredential} from './credentialVaultRuntime.js';

// Actual canonical confirmation/vault code, synthetic database/provider protocol.
test('Supabase schema and storage preparation requires exact durable confirmation before any write',async t=>{
 const owner=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'}),fixture=nativeReleaseFixture(owner);
 const env={NODE_ENV:'test',SUPABASE_URL:'https://supabase-provision-owned.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-fixture',XROGA_TEST_CREDENTIAL_KEK:Buffer.alloc(32,21).toString('base64url')},before=Object.fromEntries(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);resetCredentialVaultRuntimeForTests();
 t.after(()=>{resetCredentialVaultRuntimeForTests();for(const[k,v]of Object.entries(before))if(v===undefined)delete process.env[k];else process.env[k]=v;});
 let writes=0,sqlDispatches=0,storageCreates=0,external=0,connections=0,mode='ok';const buckets=new Set<string>(),revision=randomUUID();
 const values:Record<string,string>={apikey_supabase_url:'https://ownedproject.supabase.co',apikey_supabase_anon:'SYNTHETIC_ANON',apikey_supabase:'SYNTHETIC_SERVICE',apikey_supabase_pat:'SYNTHETIC_PAT',apikey_supabase_db_password:'SYNTHETIC_PASSWORD'};
 const bundleId=randomUUID();
 const rows=await Promise.all(Object.entries(values).map(async([provider,value])=>{
  const vaultRevision=randomUUID(),metadata={type:'user_api_key',vault_revision:vaultRevision,...(provider==='apikey_supabase_pat'?{}:{supabase_bundle_id:bundleId,supabase_project_ref:'ownedproject'})};
  return{user_id:owner,provider,access_token:await sealRuntimeCredential(owner,{provider:provider.replace('apikey_',''),account:provider,credentialType:'user_api_key',recordId:provider,revision:vaultRevision,scope:'user-provider-key'},value),credential_revision:revision,metadata};
 }));
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin===env.SUPABASE_URL){
   const handled=await fixture.database(url,init);if(handled){if(url.pathname.endsWith('/production_audit_log')&&mode==='source-at-audit')Object.assign(rows[0]!.metadata,{note:'changed'});return handled;}
   assert.equal(url.pathname,'/rest/v1/user_integrations');assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
   const provider=url.searchParams.get('provider')??'';
   if(provider.startsWith('eq.'))return Response.json(rows.find(row=>row.provider===provider.slice(3))??null);
   const selected=provider.slice(4,-1).split(',').map(name=>name.replaceAll('"',''));return Response.json(rows.filter(row=>selected.includes(row.provider)));
  }
  external++;
  if(url.origin==='https://api.supabase.com'){
   if(url.pathname==='/v1/projects')return Response.json([{id:'opaque-owned',ref:mode==='foreign-project'?'foreignproject':'ownedproject',name:'Owned project'}]);
   if(url.pathname.endsWith('/api-keys'))return Response.json([{name:'anon',api_key:'SYNTHETIC_ANON'},{name:'service_role',api_key:'SYNTHETIC_SERVICE'}]);
   assert.equal(url.pathname,'/v1/projects/ownedproject/database/query');
   const query=JSON.parse(String(init?.body)).query;
   if(query.startsWith('select count(*)'))return Response.json([{table_count:mode==='bad-schema'?3:4,rls_enabled:mode!=='bad-rls'}]);
   sqlDispatches++;
   if(mode==='sql-network')throw new Error('SYNTHETIC_PAT PRIVATE_PROVIDER_CANARY');
   if(mode==='sql-stream')return new Response(new ReadableStream({start(controller){controller.error(new Error('SYNTHETIC_PAT PRIVATE_PROVIDER_CANARY'));}}));
   if(mode==='sql-json')return new Response('SYNTHETIC_PAT PRIVATE_PROVIDER_CANARY');
   if(/^sql(?:401|403|503|307)$/.test(mode))return Response.json({message:'SYNTHETIC_PAT PRIVATE_PROVIDER_CANARY'},{status:Number(mode.slice(3))});
   writes++;if(mode==='cancel-after-sql'&&fixture.row)fixture.row.status='cancelled';return Response.json([]);
  }
  assert.equal(url.origin,'https://ownedproject.supabase.co');assert.equal(url.pathname,'/storage/v1/bucket');
  if(mode==='storage403')return Response.json({message:'SYNTHETIC_SERVICE PRIVATE_PROVIDER_CANARY'},{status:403});
  if(init?.method==='POST'){storageCreates++;const body=JSON.parse(String(init.body));assert.equal(body.public,false);assert.equal(body.file_size_limit,52428800);buckets.add(body.id);
   if(mode==='storage409'||mode==='storage409-public')return Response.json({message:'already exists'},{status:409});writes++;return Response.json({name:body.id});}
  if(mode==='storage-public')return Response.json([{id:'xroga-uploads',public:true}]);
  if(mode==='storage-unknown')return Response.json([{id:'xroga-uploads'}]);
  if(mode==='storage-duplicate')return Response.json([{id:'xroga-uploads',public:false},{id:'xroga-uploads',public:true}]);
  return Response.json([...buckets].map(id=>({id,public:['storage409-public','storage200-public'].includes(mode)})));
 });
 const baselineRows=structuredClone(rows);
 const input=(method='management_api')=>({userId:owner,tenantContext:context,projectUrl:values.apikey_supabase_url!,serviceRoleKey:values.apikey_supabase!,
  ...(method==='management_api'?{accessToken:values.apikey_supabase_pat!}:method==='database_password'?{dbPassword:values.apikey_supabase_db_password!,region:'us-east-1'}:{}),projectName:'Owned project'});
 t.mock.method(pg.Client.prototype,'connect',async function(this:pg.Client){
  connections++;assert.deepEqual(Reflect.get(this,'ssl'),{rejectUnauthorized:true});
  if(mode==='pg-auth')throw Object.assign(new Error('SYNTHETIC_PASSWORD PRIVATE_PROVIDER_CANARY'),{code:'28P01'});
  if(mode==='pg-certificate')throw Object.assign(new Error('PRIVATE_PROVIDER_CANARY'),{code:'CERT_HAS_EXPIRED'});
  if(mode==='pg-network-recovery'&&connections===1)throw Object.assign(new Error('Unreachable'),{code:'ENETUNREACH'});
  return this;
 });
 t.mock.method(pg.Client.prototype,'query',async function(query:unknown){
  if(String(query).startsWith('select count(*)'))return{rows:[{table_count:4,rls_enabled:true}]};
  sqlDispatches++;if(mode==='pg-query-denied')throw Object.assign(new Error('SYNTHETIC_PASSWORD PRIVATE_PROVIDER_CANARY'),{code:'42501'});writes++;return{rows:[]};
 });
 t.mock.method(pg.Client.prototype,'end',async()=>undefined);
 for(const scenario of ['ok','trailing-origin','concurrent','restart','storage-only','storage409','storage409-public','storage200-public','storage-public','storage-unknown','storage-duplicate',
  'source-changed','foreign-source','foreign-confirmation','revoked-source','source-at-audit','foreign-project','cancelled','cancel-at-audit','cancel-after-claim','cancel-after-sql','audit-fail','changed-plan',
  'sql401','sql403','sql503','sql307','sql-network','sql-stream','sql-json','bad-schema','bad-rls','storage403',
  'pg-ok','pg-auth','pg-certificate','pg-query-denied','pg-network-recovery','deadline'])await t.test(scenario,async child=>{
  mode='ok';fixture.mode='ok';writes=0;sqlDispatches=0;storageCreates=0;external=0;connections=0;buckets.clear();rows.splice(0,rows.length,...structuredClone(baselineRows));
  const method=scenario.startsWith('pg-')?'database_password':scenario==='storage-only'?'storage_only':'management_api';
  const request=input(method);if(scenario==='trailing-origin')request.projectUrl+='/';
  const result=await provisionUserSupabase(request);assert.equal(result.needsConfirmation,true);assert.equal(result.ok,false);assert.equal(writes,0);assert.ok(fixture.row);
  await assert.rejects(runSqlViaManagementApi('SYNTHETIC_PAT','ownedproject','select 1',context),{code:'SUPABASE_PROVISION_ADMISSION_DENIED'});
  await assert.rejects(runSqlViaDatabasePassword('ownedproject','SYNTHETIC_PASSWORD','select 1','us-east-1',context),{code:'SUPABASE_PROVISION_ADMISSION_DENIED'});
  await assert.rejects(ensureStorageBuckets(values.apikey_supabase_url!,values.apikey_supabase!,['xroga-uploads'],context),{code:'SUPABASE_PROVISION_ADMISSION_DENIED'});assert.equal(writes,0);
  external=0;mode=scenario;fixture.mode=scenario;
  if(scenario==='deadline')child.mock.method(AbortSignal,'timeout',()=>AbortSignal.abort(new DOMException('Synthetic deadline','TimeoutError')));
  if(scenario==='restart')resetCredentialVaultRuntimeForTests();
  if(scenario==='source-changed')Object.assign(rows[0]!.metadata,{note:'changed'});
  if(scenario==='foreign-source')rows[0]!.user_id=randomUUID();
  if(scenario==='foreign-confirmation')fixture.row.user_id=randomUUID();
  if(scenario==='revoked-source')Object.assign(rows[0]!.metadata,{revoked:true});
  if(scenario==='cancelled')await cancelBusinessActionConfirmation(owner,fixture.row.id);
  if(scenario==='changed-plan'){fixture.row.plan.arguments.sql='drop table public.profiles';const{planDigest:_,...unsigned}=fixture.row.plan;fixture.row.plan.planDigest=actionPlanDigest(unsigned);fixture.row.plan_digest=fixture.row.plan.planDigest;}
  const grantId=fixture.row.id;
  const confirm=()=>confirmBusinessAction(context,grantId);
  if(scenario==='concurrent'){const results=await Promise.allSettled([confirm(),confirm()]);assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(sqlDispatches,1);return;}
  if(['ok','trailing-origin','restart','storage-only','storage409','pg-ok','pg-network-recovery'].includes(scenario)){
   const confirmed=await confirm(),value=JSON.parse(confirmed.execution.resultText);assert.equal(value.ok,true);assert.equal(value.schemaApplied,method!=='storage_only');assert.equal(value.memoryTablesReady,method!=='storage_only');assert.equal(value.buckets.length,2);assert.equal(fixture.row.status,'consumed');
   assert.equal(sqlDispatches,method==='storage_only'?0:1);assert.equal(storageCreates,2);if(scenario==='pg-network-recovery')assert.equal(connections,2);
   assert.doesNotMatch(JSON.stringify(confirmed),/SYNTHETIC_SERVICE|SYNTHETIC_PAT|SYNTHETIC_PASSWORD/);
  }else{
   await assert.rejects(confirm(),error=>{assert.doesNotMatch(String(error),/SYNTHETIC_|PRIVATE_PROVIDER_CANARY/);return true;});
   if(['source-changed','foreign-source','foreign-confirmation','revoked-source','cancelled','changed-plan'].includes(scenario))assert.equal(external,0,'Denied authority cannot even refresh provider metadata');
   if(['source-at-audit','foreign-project','cancelled','cancel-at-audit','cancel-after-claim','audit-fail','changed-plan','pg-auth','pg-certificate'].includes(scenario))assert.equal(sqlDispatches,0);
   if(['pg-auth','pg-certificate','pg-query-denied'].includes(scenario))assert.equal(connections,1,'Security denial cannot retry another host');
   if(scenario.startsWith('sql')||['bad-schema','bad-rls','cancel-after-sql','pg-auth','pg-certificate','pg-query-denied'].includes(scenario))assert.equal(storageCreates,0);
  }
  if(scenario==='sql503'){mode='ok';fixture.mode='ok';const recovery=await provisionUserSupabase(input());assert.equal(recovery.needsConfirmation,true);const recovered=await confirmBusinessAction(context,fixture.row!.id);assert.equal(JSON.parse(recovered.execution.resultText).ok,true);assert.equal(sqlDispatches,2,'Recovery uses a fresh explicit approval, never an old failed grant');}
  const beforeWrites=writes,beforeSql=sqlDispatches,beforeStorage=storageCreates;await assert.rejects(confirm());assert.equal(writes,beforeWrites);assert.equal(sqlDispatches,beforeSql);assert.equal(storageCreates,beforeStorage);
 });
});
