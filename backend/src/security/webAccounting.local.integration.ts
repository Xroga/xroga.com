import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {test} from 'node:test';
import pg from 'pg';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {recordWebSpend,WEB_PRICE_VERSION} from '../ai/webBudget.js';

/** Real private accounting only. No web/provider request or actual spend. */
export function registerWebAccountingTests(admin:SupabaseClient,getUsers:()=>readonly {token:string}[]):void{
 test('real web accounting retains captured owner intent and cycle ownership across an observed database lock wait',async t=>{
  assert.equal(process.env.CI,'true');assert.equal(process.env.XB01_DISPOSABLE_SUPABASE,'1');assert.equal(process.env.SUPABASE_URL,'http://127.0.0.1:54321');
  const actors:string[]=[],original=globalThis.fetch;
  t.after(async()=>{globalThis.fetch=original;for(const actor of actors)assert.equal((await admin.auth.admin.deleteUser(actor)).error,null);});
  for(let i=0;i<2;i++){const r=await admin.auth.admin.createUser({email:`web-accounting-${randomUUID()}@example.invalid`,email_confirm:true});assert.equal(r.error,null);assert.ok(r.data.user);actors.push(r.data.user.id);}
  const [owner,other]=actors;assert.equal((await admin.rpc('ensure_xroga_free_cycle',{p_user_id:owner})).error,null);
  const cycle=await admin.from('xroga_billing_cycles').select('id,user_id').eq('user_id',owner).single();assert.equal(cycle.error,null);assert.ok(cycle.data);
  const input={userId:owner,provider:'parallel' as const,operation:'parallel_search_turbo' as const,microUsd:1,providerRequestId:`web-captured-${randomUUID()}`},admitted={...input};let changed=false;
  globalThis.fetch=async(request,init)=>{
   const url=new URL(String(request instanceof Request?request.url:request));assert.equal(url.origin,'http://127.0.0.1:54321');const response=await original(request,init);
   if(!changed&&url.pathname==='/rest/v1/xroga_billing_cycles'&&url.searchParams.get('user_id')===`eq.${owner}`){changed=true;Object.assign(input,{userId:other,provider:'xai',operation:'grok_x_search',providerRequestId:'SYNTHETIC_REPLACED_REQUEST'});}
   return response;
  };
  try{await recordWebSpend(input);assert.equal(changed,true);}finally{globalThis.fetch=original;}
  const rows=async()=>{const r=await admin.from('xroga_web_usage').select('*').in('user_id',actors).order('id');assert.equal(r.error,null);return r.data!;};
  const captured=await rows();assert.equal(captured.length,1);assert.equal(captured[0].user_id,owner);assert.equal(captured[0].cycle_id,cycle.data.id);assert.equal(captured[0].provider,admitted.provider);assert.equal(captured[0].operation,admitted.operation);assert.equal(captured[0].provider_request_id,admitted.providerRequestId);assert.equal(Number(captured[0].actual_micro_usd),1);assert.equal(captured[0].price_version,WEB_PRICE_VERSION);
  const forged=await admin.from('xroga_web_usage').insert({cycle_id:cycle.data.id,user_id:other,provider:'parallel',operation:'parallel_search_turbo',price_version:WEB_PRICE_VERSION,actual_micro_usd:1,provider_request_id:admitted.providerRequestId});assert.equal(forged.error?.code,'23503');assert.deepEqual(await rows(),captured);
  for(const token of [undefined,...getUsers().map(user=>user.token)]){
   const browser:SupabaseClient=createClient(process.env.SUPABASE_URL!,process.env.SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false},...(token?{global:{headers:{Authorization:`Bearer ${token}`}}}:{})});
   assert.equal((await browser.from('xroga_web_usage').select('*')).error?.code,'42501');assert.equal((await browser.from('xroga_web_usage').insert({user_id:owner,provider:'parallel',operation:'parallel_search_turbo',price_version:WEB_PRICE_VERSION,actual_micro_usd:1})).error?.code,'42501');
  }
  assert.deepEqual(await rows(),captured);
  // Remove only this fixture receipt so a parent transfer can happen before a
  // new child exists. The delayed FK insert must recheck after the parent lock.
  assert.equal((await admin.from('xroga_web_usage').delete().eq('id',captured[0].id).eq('user_id',owner)).error,null);
  const database=new URL(process.env.XB01_LOCAL_DATABASE_URL!);assert.equal(database.hostname,'127.0.0.1');assert.equal(database.port,'54322');assert.equal(database.pathname,'/postgres');
  const locker=new pg.Client({connectionString:database.href,ssl:false});await locker.connect();let pending:Promise<void>|undefined;
  try{
   await locker.query('begin');const pid=(await locker.query('select pg_backend_pid() pid')).rows[0].pid;
   await locker.query('update public.xroga_billing_cycles set user_id=$2 where id=$1',[cycle.data.id,other]);
   pending=recordWebSpend({...admitted,providerRequestId:`web-stale-${randomUUID()}`});void pending.catch(()=>{});let blocked=false;
   for(let n=0;n<150;n++){await locker.query('select pg_stat_clear_snapshot()');const waiting=await locker.query("select count(*)::int n from pg_stat_activity a where a.pid<>pg_backend_pid() and $1=any(pg_blocking_pids(a.pid)) and a.query ilike '%xroga_web_usage%'",[pid]);if(waiting.rows[0].n>0){blocked=true;break;}await delay(20);}
   assert.equal(blocked,true,'Must observe the actual stale-parent insert waiting on this cycle transaction');await locker.query('commit');await pending;pending=undefined;assert.deepEqual(await rows(),[]);
  }finally{await locker.query('rollback');if(pending)await pending;await locker.end();}
  const transferred=await admin.from('xroga_billing_cycles').select('user_id').eq('id',cycle.data.id).single();assert.equal(transferred.error,null);assert.equal(transferred.data.user_id,other);
  // A current-owner append is valid. An existing child then fences a later
  // parent owner change, and cycle deletion preserves the receipt with null FK.
  await Promise.all([1,2].map(n=>recordWebSpend({...admitted,userId:other,providerRequestId:`web-current-${n}-${randomUUID()}`})));
  const current=await rows();assert.equal(current.length,2);assert.ok(current.every(row=>row.user_id===other&&row.cycle_id===cycle.data!.id));
  assert.equal((await admin.from('xroga_billing_cycles').update({user_id:owner}).eq('id',cycle.data.id)).error?.code,'23503');assert.deepEqual(await rows(),current);
  assert.equal((await admin.from('xroga_billing_cycles').delete().eq('id',cycle.data.id).eq('user_id',other)).error,null);const retained=await rows();assert.equal(retained.length,2);assert.ok(retained.every(row=>row.user_id===other&&row.cycle_id===null));
 });
}
