/** Actual isolated PostgreSQL target-schema tests, not hosted Supabase Auth proof. */
import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFileSync} from 'node:fs';import pg from 'pg';import {root} from '../ci/toolchain.mjs';
const sql=p=>readFileSync(root+'/'+p,'utf8');
const old='supabase/migrations/20261105090000_deepseek_web_retrieval_entitlements.sql';
const addition='supabase/migrations/20261105230000_deepseek_fetch_private_cache.sql';
test('Search OS actual PostgreSQL fresh/upgrade, quota concurrency, replay and public-role denial',async t=>{
 assert.equal(process.env.XB01_DISPOSABLE_DATABASE,'1');
 const url=new URL(process.env.XB01_SEARCH_OS_TEST_DATABASE_URL??'');assert.ok(['127.0.0.1','localhost'].includes(url.hostname));assert.equal(url.pathname,'/xb01_tenant_test');
 const admin=new pg.Client({connectionString:url.href});await admin.connect();const name='xroga_search_os_'+randomUUID().replaceAll('-','');
 await admin.query('CREATE DATABASE '+name);url.pathname='/'+name;const pool=new pg.Pool({connectionString:url.href,max:16});pool.on('error',()=>{});
 t.after(async()=>{await pool.end();await admin.query('DROP DATABASE '+name+' WITH (FORCE)');await admin.end();});
 await pool.query(`DO $$ BEGIN
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
 END $$;
 CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid PRIMARY KEY,aud text,role text,email text,created_at timestamptz,updated_at timestamptz);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role') $$;
 GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
 GRANT EXECUTE ON FUNCTION auth.uid(),auth.role() TO anon,authenticated,service_role;
 CREATE TABLE public.user_token_usage(user_id uuid PRIMARY KEY,plan_tier text,plan_budget_usd numeric,quota_period_start date,updated_at timestamptz);
 CREATE TABLE public.user_actions(user_id uuid PRIMARY KEY,plan_tier text,total_actions integer,used_actions integer,concurrency_limit integer,updated_at timestamptz,reset_date timestamptz);
 `);
 for(const file of ['20260728010000_command45_shared_provider_entitlement.sql','20260906010000_parallel_web_usage.sql','20260909145816_whop_billing_and_free_plan.sql','20260910090000_universal_cost_ceiling.sql','20261019000700_web_usage_cycle_owner.sql'])await pool.query(sql('supabase/migrations/'+file));
 await pool.query(sql(old));
 const owner=randomUUID(),cycle=randomUUID(),oldKey=randomUUID();
 await pool.query('INSERT INTO auth.users(id) VALUES($1)',[owner]);
 await pool.query("INSERT INTO public.xroga_billing_cycles(id,user_id,cycle_kind,status,starts_at,ends_at,pacing,full_access_confirmed_at) VALUES($1,$2,'paid','active',now()-interval '1 day',now()+interval '29 days','full_access',now())",[cycle,owner]);
 const invoke=async(text,values=[],role='service_role')=>{assert.ok(['service_role','authenticated','anon'].includes(role));const client=await pool.connect();try{await client.query('BEGIN');await client.query('SET LOCAL ROLE '+role);await client.query("SELECT set_config('request.jwt.claim.role',$1,true)",[role]);const result=await client.query(text,values);await client.query('COMMIT');return result;}finally{await client.query('ROLLBACK');client.release();}};
 const reserve=(user,key,kind,run,op='search')=>invoke('SELECT * FROM public.reserve_xroga_deepseek_web($1,$2,$3,$4,$5,$6)',[user,key,kind,run,'synthetic-postgres-750',op]);
 await invoke('SELECT * FROM public.reserve_xroga_deepseek_web($1,$2,$3,$4,$5)',[owner,oldKey,'normal',randomUUID(),'synthetic-postgres-750']);
 await pool.query(sql(addition));
 assert.equal((await pool.query('SELECT operation FROM public.xroga_deepseek_web_calls WHERE user_id=$1',[owner])).rows[0].operation,'search','Upgrade preserves existing Search attribution');
 await pool.query(sql(addition));assert.equal((await pool.query('SELECT count(*)::int n FROM public.xroga_provider_reservations WHERE user_id=$1',[owner])).rows[0].n,1);
 // The same transaction fixture also ran against actual hosted staging. It rolls back all synthetic rows.
 const staged=await pool.query('BEGIN;'+sql('scripts/security/search-os/staging-acceptance.sql')+'ROLLBACK;');
 const checks=staged.find(r=>r.rows?.[0]?.name);assert.equal(checks.rows.length,7);assert.ok(checks.rows.every(r=>r.passed));
 const run=randomUUID(),idem=randomUUID();const duplicates=await Promise.all(Array.from({length:8},()=>reserve(owner,idem,'automatic',run)));
 assert.equal(new Set(duplicates.map(r=>r.rows[0].id)).size,1,'Concurrent replay creates one reservation');
 await assert.rejects(reserve(owner,idem,'automatic',run,'fetch'),/web_retrieval_replay_mismatch/);
 const contenders=await Promise.allSettled(Array.from({length:8},()=>reserve(owner,randomUUID(),'automatic',run,'fetch')));
 assert.equal(contenders.filter(r=>r.status==='fulfilled').length,1,'Only the second automatic operation can win');
 assert.ok(contenders.filter(r=>r.status==='rejected').every(r=>/research_run_operation_limit_exceeded/.test(String(r.reason))));
 // Fill a separate owner to one operation below its normal monthly limit.
 const quotaOwner=randomUUID();await pool.query('INSERT INTO auth.users(id) VALUES($1)',[quotaOwner]);
 await pool.query("INSERT INTO public.xroga_billing_cycles(user_id,cycle_kind,status,starts_at,ends_at,pacing,full_access_confirmed_at) VALUES($1,'paid','active',now()-interval '1 day',now()+interval '29 days','full_access',now())",[quotaOwner]);
 for(let i=0;i<649;i++)await reserve(quotaOwner,randomUUID(),'normal',randomUUID(),i%2?'fetch':'search');
 const quota=await Promise.allSettled(Array.from({length:8},()=>reserve(quotaOwner,randomUUID(),'normal',randomUUID())));
 assert.equal(quota.filter(r=>r.status==='fulfilled').length,1);assert.ok(quota.filter(r=>r.status==='rejected').every(r=>/normal_web_retrieval_allowance_exceeded/.test(String(r.reason))));
 const budgetOwner=randomUUID(),budgetCycle=randomUUID();await pool.query('INSERT INTO auth.users(id) VALUES($1)',[budgetOwner]);
 await pool.query("INSERT INTO public.xroga_billing_cycles(id,user_id,cycle_kind,status,starts_at,ends_at,pacing,full_access_confirmed_at) VALUES($1,$2,'paid','active',now()-interval '1 day',now()+interval '29 days','full_access',now())",[budgetCycle,budgetOwner]);
 const hold=(await invoke("SELECT * FROM public.reserve_xroga_provider_budget($1,$2,'daily_work','web.deepseek_search','synthetic-prior-hold',0,0,1249250)",[budgetOwner,randomUUID()])).rows[0];
 await pool.query("UPDATE public.xroga_provider_reservations SET status='pending_reconciliation' WHERE id=$1",[hold.id]);
 await pool.query("INSERT INTO public.xroga_deepseek_web_calls(user_id,cycle_id,reservation_id,research_kind,research_run_id) VALUES($1,$2,$3,'normal',$4)",[budgetOwner,budgetCycle,hold.id,randomUUID()]);
 const money=await Promise.allSettled(Array.from({length:8},()=>reserve(budgetOwner,randomUUID(),'normal',randomUUID(),'fetch')));
 assert.equal(money.filter(r=>r.status==='fulfilled').length,1);assert.ok(money.filter(r=>r.status==='rejected').every(r=>/web_retrieval_budget_exceeded/.test(String(r.reason))));
 assert.equal(Number((await pool.query('SELECT reserved_micro_usd FROM public.xroga_billing_cycles WHERE id=$1',[budgetCycle])).rows[0].reserved_micro_usd),1250000);
 for(const role of ['anon','authenticated']){
  await assert.rejects(invoke('SELECT public.reserve_xroga_deepseek_web($1,$2,$3,$4,$5,$6)',[owner,randomUUID(),'normal',randomUUID(),'synthetic-postgres-750','search'],role),/permission denied/);
  await assert.rejects(invoke('SELECT * FROM public.xroga_private_retrieval_cache',[],role),/permission denied/);
  await assert.rejects(invoke('SELECT public.put_xroga_private_retrieval_cache($1,$2,$3,60)',[owner,'a'.repeat(64),{}],role),/permission denied/);
 }
 const free=randomUUID();await pool.query('INSERT INTO auth.users(id) VALUES($1)',[free]);await invoke('SELECT public.ensure_xroga_free_cycle($1)',[free]);
 assert.equal((await reserve(free,randomUUID(),'normal',randomUUID(),'fetch')).rows[0].reserved_micro_usd,'750');
 assert.equal((await pool.query('SELECT count(*)::int n FROM public.xroga_deepseek_web_calls WHERE user_id=$1',[free])).rows[0].n,0,'Free accounting remains in its canonical shared ledger');
});
