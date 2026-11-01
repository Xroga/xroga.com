import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createTenantContext} from '../../security/tenantContext.js';
import {captureSupabaseAccess} from './supabaseAccess.js';
import {listSupabaseProjects,fetchProjectApiKeys} from './supabaseProvision.js';

test('management metadata and private-key reads retain the original canonical source epoch and owned provider project',async t=>{
 const owner=randomUUID(),context=createTenantContext({userId:owner,via:'remote_getuser'}),env={SUPABASE_URL:'https://source-lifetime-fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'synthetic-fixture'};
 const before=Object.fromEntries(Object.keys(env).map(name=>[name,process.env[name]]));Object.assign(process.env,env);
 t.after(()=>{for(const[name,value]of Object.entries(before))if(value===undefined)delete process.env[name];else process.env[name]=value;});
 let epoch='original',mode='ok',reveal=0,external=0;
 t.mock.method(globalThis,'fetch',async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
  const url=new URL(String(input));
  if(url.origin===env.SUPABASE_URL){
   assert.equal(url.pathname,'/rest/v1/user_integrations');assert.equal(url.searchParams.get('user_id'),'eq.'+owner);
   return Response.json([{user_id:mode==='foreign-source'?randomUUID():owner,provider:'supabase_oauth',access_token:'SYNTHETIC_PROTECTED_ENVELOPE',refresh_token:null,credential_revision:epoch,metadata:{note:epoch}}]);
  }
  external++;assert.equal(url.origin,'https://api.supabase.com');assert.equal(init?.redirect,'manual');
  if(mode==='revoke-at-provider')epoch='revoked';
  if(url.pathname.endsWith('/api-keys')){reveal++;if(mode==='false-public-type')return Response.json([{name:'anon',type:'publishable',api_key:'sb_secret_SYNTHETIC_PRIVATE_VALUE'},{name:'service_role',type:'secret',api_key:'sb_secret_SYNTHETIC_OTHER_PRIVATE'}]);if(mode==='legacy-type')return Response.json([{name:'anon',type:'legacy',api_key:'SYNTHETIC_ANON'},{name:'service_role',type:'legacy',api_key:'SYNTHETIC_SERVICE'}]);if(mode==='named-secret')return Response.json([{name:'anon',type:'secret',api_key:'sb_secret_SYNTHETIC_PRIVATE_VALUE'},{name:'default',type:'publishable',api_key:'sb_publishable_SYNTHETIC_PUBLIC_VALUE'}]);return Response.json([{name:'anon',api_key:'SYNTHETIC_ANON'},{name:'service_role',api_key:'SYNTHETIC_SERVICE'}]);}
  assert.equal(url.pathname,'/v1/projects');return Response.json([{id:'opaque-owned',ref:'ownedproject',name:'Owned project'}]);
 });
 for(const scenario of ['revoke-at-provider','foreign-source'])await t.test(scenario,async()=>{
  mode=scenario;epoch='original';reveal=0;await assert.rejects(listSupabaseProjects('SYNTHETIC_PAT',context),{code:'SUPABASE_SOURCE_ADMISSION_DENIED'});assert.equal(reveal,0);
 });
 await t.test('foreign project is denied before API-key reveal',async()=>{mode='ok';epoch='original';reveal=0;
  await assert.rejects(fetchProjectApiKeys('SYNTHETIC_PAT','foreignproject',context),{code:'SUPABASE_SOURCE_ADMISSION_DENIED'});assert.equal(reveal,0);
 });
 await t.test('current owned project still resolves server-only credentials',async()=>{mode='ok';epoch='original';reveal=0;
  assert.deepEqual(await fetchProjectApiKeys('SYNTHETIC_PAT','ownedproject',context),{url:'https://ownedproject.supabase.co',anonKey:'SYNTHETIC_ANON',serviceRoleKey:'SYNTHETIC_SERVICE'});assert.equal(reveal,1);
 });
 await t.test('a custom secret key named anon cannot become a public publishable key',async()=>{mode='named-secret';epoch='original';reveal=0;
  const keys=await fetchProjectApiKeys('SYNTHETIC_PAT','ownedproject',context);
  assert.equal(keys.anonKey,'sb_publishable_SYNTHETIC_PUBLIC_VALUE');assert.equal(keys.serviceRoleKey,'sb_secret_SYNTHETIC_PRIVATE_VALUE');
 });

 await t.test('a false public type cannot relabel a Supabase secret prefix',async()=>{mode='false-public-type';epoch='original';
  await assert.rejects(fetchProjectApiKeys('SYNTHETIC_PAT','ownedproject',context),{code:'SUPABASE_MANAGEMENT_DENIED'});
 });
 await t.test('documented legacy key types remain supported',async()=>{mode='legacy-type';epoch='original';
  assert.equal((await fetchProjectApiKeys('SYNTHETIC_PAT','ownedproject',context)).anonKey,'SYNTHETIC_ANON');
 });
 await t.test('cloned, rebound and closed source handles cannot dispatch',async()=>{
  mode='ok';epoch='original';const source=await captureSupabaseAccess(context);external=0;
  await assert.rejects(listSupabaseProjects('SYNTHETIC_PAT',context,{...source}),{code:'SUPABASE_SOURCE_ADMISSION_DENIED'});
  for(const actor of [createTenantContext({userId:owner,via:'remote_getuser'}),createTenantContext({userId:randomUUID(),via:'remote_getuser'})])
   await assert.rejects(listSupabaseProjects('SYNTHETIC_PAT',actor,source),{code:'SUPABASE_SOURCE_ADMISSION_DENIED'});
  source.close();await assert.rejects(listSupabaseProjects('SYNTHETIC_PAT',context,source),{code:'SUPABASE_SOURCE_ADMISSION_DENIED'});assert.equal(external,0);
 });

});
