/** Real disposable PostgreSQL policy tests. Not certification of the full Supabase migration history. */
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { root } from '../ci/toolchain.mjs';
const url=process.env.XB01_TENANT_TEST_DATABASE_URL;
if(!url||process.env.XB01_DISPOSABLE_DATABASE!=='1'||process.env.CI!=='true')throw new Error('BLOCKED_PENDING_DISPOSABLE_DATABASE_CONFIGURATION');
const parsed=new URL(url);
if(!['localhost','127.0.0.1'].includes(parsed.hostname)||parsed.pathname!=='/xb01_tenant_test')throw new Error('Only the dedicated loopback disposable database is permitted');
const client=new pg.Client({connectionString:url,connectionTimeoutMillis:5000});
const OWNER='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const A='33333333-3333-4333-8333-333333333333',B='44444444-4444-4444-8444-444444444444';
const direct=['projects','chat_metadata','swarm_runs','execution_runs','terminal_sessions','project_runtime_sessions','ai_usage_ledger'];
const migration=readFileSync(join(root,'supabase/migrations/20261013150357_xroga_tenant_security_baseline.sql'),'utf8');
const grantsMigration=readFileSync(join(root,'supabase/migrations/20261018002000_browser_table_privileges.sql'),'utf8');
before(async()=>{
  await client.connect();
  const {rows}=await client.query('select current_database() as name');assert.equal(rows[0].name,'xb01_tenant_test');
  await client.query(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role; GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;`);
  for(const table of direct)await client.query(`CREATE TABLE public.${table}(id uuid PRIMARY KEY,user_id uuid NOT NULL);`);
  await client.query(`CREATE TABLE public.chats(id uuid PRIMARY KEY,user_id uuid NOT NULL,chat_id uuid REFERENCES public.chat_metadata(id));
    CREATE TABLE public.project_files(id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES public.projects(id));
    CREATE TABLE public.project_messages(id uuid PRIMARY KEY,project_id uuid NOT NULL REFERENCES public.projects(id));`);
  const tables=[...direct,'chats','project_files','project_messages'];
  for(const table of tables) {
    await client.query(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; GRANT SELECT,INSERT,UPDATE,DELETE ON public.${table} TO anon,authenticated,service_role;
      CREATE POLICY deliberately_broad_fixture ON public.${table} FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);`);
  }
});
after(async()=>{await client.end();});
async function asUser(userId,operation,role='authenticated') {
  await client.query('BEGIN');
  try {assert.ok(['anon','authenticated','service_role'].includes(role));await client.query(`SET LOCAL ROLE ${role}`);await client.query("select set_config('request.jwt.claim.sub',$1,true)",[userId]);return await operation();}
  finally {await client.query('ROLLBACK');}
}
test('fresh target schema applies actual restrictive migration; catalog has eleven guards',async()=>{
  await client.query(migration);
  const {rows}=await client.query("select count(*)::int as count from pg_policies where schemaname='public' and policyname like 'xroga_%' and permissive='RESTRICTIVE'");assert.equal(rows[0].count,11);
});
test('upgrade/reapplication preserves existing rows and broad policies but still denies cross-owner read/write',async()=>{
  for(const table of direct)await client.query(`INSERT INTO public.${table}(id,user_id) VALUES($1,$2),($3,$4)`,[A,OWNER,B,OTHER]);
  await client.query('INSERT INTO public.chats(id,user_id,chat_id) VALUES($1,$2,$1),($3,$4,$3)',[A,OWNER,B,OTHER]);
  for(const table of ['project_files','project_messages'])await client.query(`INSERT INTO public.${table}(id,project_id) VALUES($1,$1),($2,$2)`,[A,B]);
  await client.query(migration);
  for(const table of [...direct,'chats','project_files','project_messages']) {
    const result=await asUser(OWNER,()=>client.query(`SELECT id FROM public.${table} ORDER BY id`));assert.deepEqual(result.rows,[{id:A}]);
    const changed=await asUser(OWNER,()=>client.query(`DELETE FROM public.${table} WHERE id=$1 RETURNING id`,[B]));assert.equal(changed.rowCount,0);
  }
});
test('authorized own-row update works; owner reassignment and cross-container chat insertion fail',async()=>{
  const result=await asUser(OWNER,()=>client.query('UPDATE public.projects SET user_id=$1 WHERE id=$2 RETURNING id',[OWNER,A]));assert.equal(result.rowCount,1);
  await assert.rejects(asUser(OWNER,()=>client.query('UPDATE public.projects SET user_id=$1 WHERE id=$2',[OTHER,A])),error=>error.code==='42501');
  await assert.rejects(asUser(OWNER,()=>client.query('INSERT INTO public.chats(id,user_id,chat_id) VALUES($1,$2,$3)',['55555555-5555-4555-8555-555555555555',OWNER,B])),error=>error.code==='42501');
});
test('anonymous role without identity receives zero rows; service role explicitly demonstrates bypass requiring server guard',async()=>{
  const anonymous=await asUser('',()=>client.query('SELECT id FROM public.projects'),'anon');assert.equal(anonymous.rowCount,0);
  const service=await asUser('',()=>client.query('SELECT id FROM public.projects'),'service_role');assert.equal(service.rowCount,2);
});
test('migration neither grants missing operations nor opens intentionally server-only feeds',async()=>{
  await client.query('DROP POLICY deliberately_broad_fixture ON public.ai_usage_ledger');
  const result=await asUser(OWNER,()=>client.query('SELECT id FROM public.ai_usage_ledger'));assert.equal(result.rowCount,0);
});
test('actual browser grant migration removes RLS-bypassing table rights while preserving owner DML and service grants',async()=>{
  // Deliberately reproduce the historical ALL-grant risk on disposable rows.
  await client.query('GRANT TRUNCATE,REFERENCES,TRIGGER ON ALL TABLES IN SCHEMA public TO PUBLIC,anon,authenticated,service_role');
  const visible=await asUser(OWNER,()=>client.query('select id from public.project_messages'));
  assert.deepEqual(visible.rows,[{id:A}]);
  await asUser(OWNER,async()=>{
    await client.query('truncate public.project_messages');
    assert.equal((await client.query('select count(*)::int n from public.project_messages')).rows[0].n,0);
  });
  assert.equal((await client.query('select count(*)::int n from public.project_messages')).rows[0].n,2,'Reproduction is rolled back');
  // Both global and schema-local default ALL grants must be removed too.
  await client.query('ALTER DEFAULT PRIVILEGES GRANT ALL ON TABLES TO anon,authenticated');
  await client.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated');
  await client.query(grantsMigration);await client.query(grantsMigration);
  for(const role of ['anon','authenticated']){
    await assert.rejects(asUser(OWNER,()=>client.query('truncate public.project_messages'),role),error=>error.code==='42501');
    for(const privilege of ['TRUNCATE','REFERENCES','TRIGGER']){
      assert.equal((await client.query('select has_table_privilege($1,$2,$3) allowed',[role,'public.project_messages',privilege])).rows[0].allowed,false);
    }
  }
  assert.equal((await asUser(OWNER,()=>client.query('update public.projects set user_id=$1 where id=$2 returning id',[OWNER,A]))).rowCount,1);
  assert.equal((await asUser(OWNER,()=>client.query('delete from public.project_messages where id=$1 returning id',[B]))).rowCount,0);
  assert.equal((await client.query("select has_table_privilege('service_role','public.project_messages','TRUNCATE') allowed")).rows[0].allowed,true);
  await client.query('CREATE TABLE public.future_grant_fixture(id uuid)');
  for(const role of ['anon','authenticated'])for(const privilege of ['TRUNCATE','REFERENCES','TRIGGER']){
    assert.equal((await client.query('select has_table_privilege($1,$2,$3) allowed',[role,'public.future_grant_fixture',privilege])).rows[0].allowed,false);
  }
});
