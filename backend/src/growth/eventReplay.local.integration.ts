import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import type {SupabaseClient} from '@supabase/supabase-js';
import {GrowthService} from './growthService.js';

export function registerGrowthEventReplayTests(admin:SupabaseClient,getUsers:()=>readonly {id:string;project:string}[]):void{
 test('real growth event concurrent retries retain one exact intent and reject changed replay',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const owner=getUsers()[0],key=randomUUID(),service=new GrowthService(admin);
  t.after(async()=>{assert.equal((await admin.from('analytics_events').delete().eq('tenant_id',owner.id).eq('idempotency_key',key)).error,null);});
  const input={projectId:owner.project,name:'identity.linked.v1',idempotencyKey:key,environment:'test' as const,consentState:'granted' as const,source:'fixture',evidenceReference:'exact-retry-fixture',metadata:{a:1,b:2}};
  const url=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'54322');assert.equal(url.pathname,'/postgres');
  const locker=new pg.Client({connectionString:url.href,ssl:false});await locker.connect();let pending:Promise<unknown>[]=[];
  try{
   await locker.query('begin');await locker.query('lock table public.analytics_events in share mode');
   pending=[service.recordEvent(owner.id,input),service.recordEvent(owner.id,input)];pending.forEach(p=>void p.catch(()=>{}));
   let waiting=false;
   for(let i=0;i<150;i++){
    const rows=await locker.query("select count(*)::int n from pg_locks where relation='public.analytics_events'::regclass and mode='RowExclusiveLock' and not granted");
    if(rows.rows[0].n>=2){waiting=true;break;}await delay(20);
   }
   assert.equal(waiting,true,'both HTTP inserts reached actual PostgreSQL lock');await locker.query('commit');
   const results=await Promise.all(pending) as Array<{event:{id:string};duplicate:boolean}>;
   assert.deepEqual(results.map(r=>r.duplicate).sort(),[false,true]);assert.equal(results[0].event.id,results[1].event.id);
   for(const patch of [{consentState:'denied' as const},{name:'activation.completed.v1'},{metadata:{a:9,b:2}},{evidenceReference:'changed'}])await assert.rejects(service.recordEvent(owner.id,{...input,...patch}),{code:'idempotency_conflict',statusCode:409});
   assert.equal((await service.recordEvent(owner.id,{...input,metadata:{b:2,a:1}})).duplicate,true);
   const stored=await admin.from('analytics_events').select('id,consent_state,metadata').eq('tenant_id',owner.id).eq('idempotency_key',key);assert.equal(stored.error,null);assert.equal(stored.data?.length,1);assert.equal(stored.data![0].consent_state,'granted');assert.deepEqual(stored.data![0].metadata,{a:1,b:2});
  }finally{await locker.query('rollback');await Promise.allSettled(pending);await locker.end();}
 });
}
