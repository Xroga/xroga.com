import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import test from 'node:test';
import pg from 'pg';

test('real PostgreSQL provider admission excludes competing workers, fences replay and preserves accounting',async t=>{
  assert.equal(process.env.XB01_DISPOSABLE_DATABASE,'1');
  const url=new URL(process.env.XB01_PACING_TEST_DATABASE_URL!);
  assert.equal(url.hostname,'127.0.0.1');assert.ok(['5432','55437'].includes(url.port));assert.equal(url.pathname,'/xb01_tenant_test');
  const admin=new pg.Client({connectionString:url.href});await admin.connect();
  const name='xroga_pacing_'+randomUUID().replaceAll('-','');
  await admin.query(`CREATE DATABASE ${name}`);url.pathname='/'+name;
  const pool=new pg.Pool({connectionString:url.href,max:24});pool.on('error',()=>{});
  t.after(async()=>{await pool.end();await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();});
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
    IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
  END $$;
  CREATE TABLE public.xroga_billing_cycles(id uuid PRIMARY KEY,user_id uuid,status text,starts_at timestamptz,ends_at timestamptz);
  CREATE TABLE public.xroga_provider_reservations(id uuid PRIMARY KEY,cycle_id uuid,user_id uuid,status text,internal_route text,
    reserved_micro_usd bigint,settled_micro_usd bigint);
  ALTER TABLE public.xroga_provider_reservations ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.xroga_provider_reservations FROM PUBLIC,anon,authenticated;
  GRANT USAGE ON SCHEMA public TO service_role,anon,authenticated;
  GRANT SELECT ON public.xroga_billing_cycles TO service_role;
  GRANT SELECT,UPDATE ON public.xroga_provider_reservations TO service_role;`);
  const owner=randomUUID(),cycle=randomUUID(),key='a'.repeat(64);
  await pool.query("INSERT INTO public.xroga_billing_cycles VALUES($1,$2,'active',now()-interval '1 day',now()+interval '1 day')",[cycle,owner]);
  const reservations=Array.from({length:32},()=>randomUUID()),tokens=reservations.map(()=>randomUUID());
  for(const id of reservations)await pool.query("INSERT INTO public.xroga_provider_reservations VALUES($1,$2,$3,'reserved','deepseek_v4_1_flash_1017',1000,NULL)",[id,cycle,owner]);
  const sql=readFileSync(new URL('../../docs/operations/zurelay-product-pacing-20261104/provider-request-pacing.sql',import.meta.url),'utf8');
  await pool.query(sql);
  const claim=async(index:number,who=owner,role='service_role', fingerprint=key)=>{
    assert.ok(['service_role','anon','authenticated'].includes(role));
    const client=await pool.connect();
    try{await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
      const result=await client.query('SELECT public.claim_xroga_model_request($1,$2,$3,$4) AS receipt',[who,reservations[index],fingerprint,tokens[index]]);
      await client.query('COMMIT');return result.rows[0].receipt as {granted:boolean;retry_after_ms:number};
    }finally{await client.query('ROLLBACK');client.release();}
  };
  const release=async(token:string,cooldown=0)=>pool.query('SELECT public.release_xroga_model_request($1,$2,$3)',[key,token,cooldown]);
  const results=await Promise.all(reservations.slice(0,24).map((_,i)=>claim(i)));
  const winners=results.flatMap((r,i)=>r.granted?[i]:[]);assert.equal(winners.length,1);const winner=winners[0];
  await release(randomUUID());assert.equal((await claim(24)).granted,false,'Foreign release cannot remove the lease');
  await release(tokens[winner],120);assert.ok((await claim(24)).retry_after_ms>=119_000,'Cooldown survives independent clients');
  await assert.rejects(claim(winner),/CURRENT_MODEL_RESERVATION_REQUIRED/,'An admitted request cannot be replayed');
  await pool.query("UPDATE public.xroga_model_request_capacity SET cooldown_until=now()-interval '1 second',lease_expires_at=now()-interval '1 second',next_dispatch_at=now()-interval '1 second'");
  await assert.rejects(claim(25,randomUUID()),/CURRENT_MODEL_RESERVATION_REQUIRED/,'Owner cannot be substituted');
  await pool.query("UPDATE public.xroga_provider_reservations SET status='settled' WHERE id=$1",[reservations[26]]);
  await assert.rejects(claim(26),/CURRENT_MODEL_RESERVATION_REQUIRED/);
  const child=spawn(process.execPath,['--input-type=module','-e',`
    import pg from 'pg';
    const client=new pg.Client({connectionString:process.env.PACING_LOCAL_URL});await client.connect();
    await client.query('BEGIN');await client.query('SET LOCAL ROLE service_role');
    const r=await client.query('SELECT public.claim_xroga_model_request($1,$2,$3,$4) AS receipt',
      JSON.parse(process.env.PACING_LOCAL_ARGS));await client.query('COMMIT');
    console.log(JSON.stringify(r.rows[0].receipt));setInterval(()=>{},1000);
  `],{env:{...process.env,PACING_LOCAL_URL:url.href,PACING_LOCAL_ARGS:JSON.stringify([owner,reservations[27],key,tokens[27]])},stdio:['ignore','pipe','pipe']});
  t.after(()=>{if(child.exitCode===null)child.kill();});
  const ready=await Promise.race([once(child.stdout!,'data'),new Promise<never>((_,reject)=>{
    const timer=setTimeout(()=>reject(Error('Local claim worker did not become ready')),10_000);timer.unref();})]);
  assert.equal(JSON.parse(String(ready[0]).trim()).granted,true,'Real child process obtained the durable claim');
  const exited=once(child,'exit');child.kill();await exited;
  assert.equal((await claim(28)).granted,false,'Killing a worker does not silently clear its durable lease');
  await pool.query("UPDATE public.xroga_model_request_capacity SET lease_expires_at=now()-interval '1 second',next_dispatch_at=now()-interval '1 second'");
  assert.equal((await claim(28)).granted,true,'A distinct reserved request can recover after lease expiry');
  await release(tokens[27]);assert.equal((await claim(29)).granted,false,'Dead worker cannot release successor');
  for(const role of ['anon','authenticated']){
    await assert.rejects(claim(29,owner,role),/permission denied/);
    const client=await pool.connect();try{await client.query('BEGIN');await client.query(`SET LOCAL ROLE ${role}`);
      await assert.rejects(client.query('SELECT * FROM public.xroga_model_request_capacity'),/permission denied/);
    }finally{await client.query('ROLLBACK');client.release();}
  }
  const totals=(await pool.query('SELECT sum(reserved_micro_usd)::int AS reserved,sum(coalesce(settled_micro_usd,0))::int AS settled FROM public.xroga_provider_reservations')).rows[0];
  assert.deepEqual(totals,{reserved:32_000,settled:0},'Admission never rewrites financial amounts');
  // Metadata-only expansion can coexist with the prior application and is
  // idempotent during preparation. This is not full hosted Supabase acceptance.
  await pool.query(sql);
  // Rollback: removes only the admission machinery, leaves every financial amount and row, and is repeatable.
  const rollback=readFileSync(new URL('../../docs/operations/zurelay-product-pacing-20261104/provider-request-pacing.rollback.sql',import.meta.url),'utf8');
  await pool.query(rollback);
  const gone=(await pool.query(`SELECT to_regprocedure('public.claim_xroga_model_request(uuid,uuid,text,uuid)') AS claim,
    to_regprocedure('public.release_xroga_model_request(text,uuid,integer)') AS rel,to_regclass('public.xroga_model_request_capacity') AS cap,
    (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='xroga_provider_reservations'
      AND column_name IN ('dispatch_admission_id','dispatch_admitted_at'))::int AS cols`)).rows[0];
  assert.deepEqual(gone,{claim:null,rel:null,cap:null,cols:0},'Rollback removes functions, capacity table and fence columns');
  const after=(await pool.query('SELECT count(*)::int AS n,sum(reserved_micro_usd)::int AS reserved,sum(coalesce(settled_micro_usd,0))::int AS settled FROM public.xroga_provider_reservations')).rows[0];
  assert.deepEqual(after,{n:32,reserved:32_000,settled:0},'Rollback leaves reservations and accounting untouched');
  await pool.query(rollback);
  await pool.query(sql);
  assert.equal((await claim(30)).granted,true,'The forward migration can be re-applied after a rollback');
  const v2=readFileSync(new URL('../../docs/operations/zurelay-product-pacing-20261104/provider-request-capacity-v2.sql',import.meta.url),'utf8');
  await pool.query(v2);
  assert.equal((await claim(29)).granted,false,'Existing lease remains live after migration');
  await release(tokens[30]);
  const fastKey='b'.repeat(64);
  await pool.query('INSERT INTO public.xroga_model_request_capacity (key_fingerprint,dispatch_interval_ms,max_in_flight,max_per_user) VALUES ($1,600,8,2)',[fastKey]);
  const secondOwner=randomUUID(), secondCycle=randomUUID();
  await pool.query("INSERT INTO public.xroga_billing_cycles VALUES($1,$2,'active',now()-interval '1 day',now()+interval '1 day')",[secondCycle,secondOwner]);
  await pool.query('UPDATE public.xroga_provider_reservations SET user_id=$1,cycle_id=$2 WHERE id=$3',[secondOwner,secondCycle,reservations[31]]);
  const advance=()=>pool.query("UPDATE public.xroga_model_request_capacity SET next_dispatch_at='-infinity' WHERE key_fingerprint=$1",[fastKey]);
  assert.equal((await claim(0,owner,'service_role',fastKey)).granted,true);
  const pacing=await claim(1,owner,'service_role',fastKey);
  assert.equal(pacing.granted,false);assert.ok(pacing.retry_after_ms>0&&pacing.retry_after_ms<=600);
  await advance();
  assert.equal((await claim(1,owner,'service_role',fastKey)).granted,true,'One owner can use two slots');
  await advance();
  assert.equal((await claim(2,owner,'service_role',fastKey)).granted,false,'An owner cannot consume the next slot');
  assert.equal((await claim(31,secondOwner,'service_role',fastKey)).granted,true,'Another owner can progress without waiting for completion');
  await pool.query('SELECT public.release_xroga_model_request($1,$2,$3)',[fastKey,tokens[31],10]);
  assert.ok((await claim(2,owner,'service_role',fastKey)).retry_after_ms>9_000,'A provider 429 holds the whole key');
  await assert.rejects(claim(2,owner,'authenticated',fastKey),/permission denied/);
});
