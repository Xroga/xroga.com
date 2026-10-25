import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {SupabaseProviderHealthStore} from '../ai/providerHealthStore.js';
import type {ModelRuntimeHealth} from '../ai/providerRuntime.js';
import pg from 'pg';
import {probeDatabaseReadiness} from './serviceRoleGuard.js';

/** The existing registered exception stores platform model counters, not tenants. */
export function registerPlatformHealthTests(admin:SupabaseClient,getUsers:()=>readonly {token:string}[],request:(path:string)=>Promise<Response>):void{
 test('real readiness exception exposes no profile identity and fails closed when disposable database select is denied',async()=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
  const db=new pg.Client({connectionString:url.href,ssl:false});await db.connect();let changed=false,grantable=false;
  const acl=async()=>(await db.query("select grantor::regrole::text,grantee::regrole::text,privilege_type,is_grantable from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid='public.profiles'::regclass order by 1,2,3,4")).rows;
  try{
   const beforeAcl=await acl(),grant=beforeAcl.find(r=>r.grantee==='service_role'&&r.privilege_type==='SELECT');assert.ok(grant);grantable=grant.is_grantable;
   const before=(await db.query('select id from public.profiles order by id')).rows;
   assert.equal(await probeDatabaseReadiness(),undefined);const ready=await request('/ready');assert.equal(ready.status,200);const text=await ready.text();assert.equal(JSON.parse(text).status,'ready');assert.ok(before.every(r=>!text.includes(r.id)));
   await db.query('revoke select on public.profiles from service_role');changed=true;
   assert.equal((await db.query("select has_table_privilege('service_role','public.profiles','SELECT') allowed")).rows[0].allowed,false);
   await assert.rejects(probeDatabaseReadiness(),{message:'Database readiness unavailable'});
   const denied=await request('/ready');assert.equal(denied.status,503);assert.deepEqual(await denied.json(),{status:'not_ready',reason:'database_unavailable'});
   await db.query(`grant select on public.profiles to service_role${grantable?' with grant option':''}`);changed=false;
   assert.deepEqual(await acl(),beforeAcl);assert.deepEqual((await db.query('select id from public.profiles order by id')).rows,before);assert.equal(await probeDatabaseReadiness(),undefined);assert.equal((await request('/ready')).status,200);
  }finally{if(changed)await db.query(`grant select on public.profiles to service_role${grantable?' with grant option':''}`);await db.end();}
 });
 test('real registered platform health exception persists fixed model counters and denies every browser role',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const table='model_provider_health',modelId='deepseek_v4_flash',before=await admin.from(table).select('*').eq('model_id',modelId).maybeSingle();assert.equal(before.error,null);
  t.after(async()=>{const restored=before.data?await admin.from(table).upsert(before.data,{onConflict:'model_id'}):await admin.from(table).delete().eq('model_id',modelId);assert.equal(restored.error,null);});
  const health:ModelRuntimeHealth={modelId,status:'degraded',successes:7,failures:2,consecutiveFailures:1,recentFailureRate:0.25,validationSuccesses:3,validationFailures:1,validationSuccessRate:0.75,averageLatencyMs:123.4,lastCheckedAt:new Date().toISOString(),lastFailureKind:'timeout'};
  const store=new SupabaseProviderHealthStore();
  // A forged additional object property must not become a persisted column.
  await store.save({...health,userId:'SYNTHETIC_PRIVATE_CANARY',access_token:'SYNTHETIC_PRIVATE_CANARY'} as ModelRuntimeHealth);
  const persisted=await admin.from(table).select('*').eq('model_id',modelId).single();assert.equal(persisted.error,null);assert.equal(persisted.data?.status,'degraded');assert.equal(persisted.data?.successes,7);assert.equal(persisted.data?.failures,2);assert.equal(persisted.data?.average_latency_ms,123);assert.equal(persisted.data?.last_failure_kind,'timeout');assert.ok(!JSON.stringify(persisted.data).includes('SYNTHETIC_PRIVATE_CANARY'));
  const loaded=(await store.load()).filter(row=>row.modelId===modelId);assert.equal(loaded.length,1);assert.equal(loaded[0].successes,7);assert.equal(loaded[0].failures,2);assert.equal(loaded[0].averageLatencyMs,123);assert.equal(loaded[0].lastFailureKind,'timeout');assert.ok(Number.isFinite(Date.parse(loaded[0].restoredAt!)));assert.ok(!JSON.stringify(loaded).includes('SYNTHETIC_PRIVATE_CANARY'));
  for(const token of [undefined,...getUsers().map(user=>user.token)]){
   const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
   for(const operation of [browser.from(table).select('*').eq('model_id',modelId),browser.from(table).upsert({model_id:modelId,status:'healthy'}),browser.from(table).delete().eq('model_id',modelId)])assert.equal((await operation).error?.code,'42501');
  }
  const after=await admin.from(table).select('*').eq('model_id',modelId).single();assert.equal(after.error,null);assert.deepEqual(after.data,persisted.data);
 });
}
