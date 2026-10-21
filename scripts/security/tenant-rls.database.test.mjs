/** Real disposable PostgreSQL policy tests. Not certification of the full Supabase migration history. */
import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

const SIDEBAR_PROJECT='55555555-5555-4555-8555-555555555555';
const SIDEBAR_SECTION='66666666-6666-4666-8666-666666666666';
const SIDEBAR_FOREIGN_SECTION='77777777-7777-4777-8777-777777777777';
const sidebarFix=readFileSync(join(root,'supabase/migrations/20261022003000_sidebar_exact_parent_guards.sql'),'utf8');
test('real PostgreSQL reproduces and repairs current-main sidebar parent mismatch without rewriting legacy rows',async()=>{
  const path='supabase/migrations/20261021233500_sidebar_organization.sql';
  // Use the actual current-main migration, or its exact immutable Git object in
  // a feature-only checkout. No reconstructed SQL or claimed Supabase Auth proof.
  const original=existsSync(join(root,path))?readFileSync(join(root,path),'utf8').replace(/\r\n/g,'\n')
    :execFileSync('git',['show',`20ba42d658140994dbcd4ef58b07782cbe413b72:${path}`],{cwd:root,encoding:'utf8'});
  assert.equal(createHash('sha256').update(original).digest('hex'),'a60e170e2087eaa3b5357b91efa78dac397307aee8eedec50fa3c4f03c7555f4');
  await client.query('INSERT INTO auth.users(id) VALUES($1),($2) ON CONFLICT DO NOTHING',[OWNER,OTHER]);
  await client.query('INSERT INTO projects(id,user_id) VALUES($1,$2)',[SIDEBAR_PROJECT,OWNER]);
  await client.query("ALTER TABLE terminal_sessions ADD COLUMN title text DEFAULT '', ADD COLUMN prompt text DEFAULT ''");
  await client.query(original);
  await client.query('INSERT INTO xroga_sidebar_sections(id,user_id,project_id,title) VALUES($1,$2,$3,$4),($5,$6,$7,$8)',
    [SIDEBAR_SECTION,OWNER,A,'owned synthetic section',SIDEBAR_FOREIGN_SECTION,OTHER,B,'foreign synthetic section']);
  const insert=(user,project,section,id='synthetic-parent-control')=>client.query(
    'INSERT INTO xroga_sidebar_items(user_id,item_type,item_id,project_id,section_id) VALUES($1,$2,$3,$4,$5) RETURNING item_id',
    [user,'conversation',id,project,section]);
  assert.equal((await asUser(OWNER,()=>insert(OWNER,SIDEBAR_PROJECT,SIDEBAR_SECTION))).rowCount,1,
    'Original SQL admits a section from a different same-owner project');
  await assert.rejects(asUser(OWNER,()=>insert(OWNER,B,SIDEBAR_SECTION)),error=>error.code==='42501',
    'Independent project RLS already denies foreign owners, no bypass claim');
  await insert(OWNER,SIDEBAR_PROJECT,SIDEBAR_SECTION,'synthetic-legacy-mismatch');
  await client.query(sidebarFix);await client.query(sidebarFix);
  assert.equal((await client.query("SELECT count(*)::int n FROM xroga_sidebar_items WHERE item_id='synthetic-legacy-mismatch'")).rows[0].n,1,
    'NOT VALID adds write guards without deleting or silently changing legacy rows');
  assert.equal((await asUser(OWNER,()=>insert(OWNER,A,SIDEBAR_SECTION))).rowCount,1);
  for(const [user,project,section]of [[OWNER,SIDEBAR_PROJECT,SIDEBAR_SECTION],[OWNER,A,SIDEBAR_FOREIGN_SECTION],
    [OWNER,B,SIDEBAR_FOREIGN_SECTION],[OTHER,B,SIDEBAR_FOREIGN_SECTION],[OWNER,null,SIDEBAR_SECTION]]) {
    await assert.rejects(asUser(OWNER,()=>insert(user,project,section)),error=>error.code==='42501');
  }
  await assert.rejects(asUser('',()=>insert(OWNER,A,SIDEBAR_SECTION),'anon'),error=>error.code==='42501');
  await insert(OWNER,A,SIDEBAR_SECTION,'synthetic-retained-child');
  await insert(OTHER,B,SIDEBAR_FOREIGN_SECTION,'synthetic-foreign-child');
  const before=await client.query('SELECT * FROM xroga_sidebar_items ORDER BY user_id,item_id');
  assert.equal((await asUser(OWNER,()=>client.query('SELECT * FROM xroga_sidebar_items WHERE user_id=$1',[OTHER]))).rowCount,0);
  assert.equal((await asUser(OWNER,()=>client.query('DELETE FROM xroga_sidebar_items WHERE user_id=$1',[OTHER]))).rowCount,0);
  await assert.rejects(asUser(OWNER,()=>client.query('UPDATE xroga_sidebar_sections SET project_id=$1 WHERE id=$2',[SIDEBAR_PROJECT,SIDEBAR_SECTION])),
    error=>error.code==='23503'&&error.constraint==='xroga_sidebar_item_exact_section_parent');
  await asUser(OWNER,async()=>{
    await client.query('DELETE FROM xroga_sidebar_sections WHERE id=$1',[SIDEBAR_SECTION]);
    const result=await client.query("SELECT user_id,project_id,section_id FROM xroga_sidebar_items WHERE item_id='synthetic-retained-child'");
    assert.deepEqual(result.rows,[{user_id:OWNER,project_id:A,section_id:null}]);
  });
  assert.deepEqual((await client.query('SELECT * FROM xroga_sidebar_items ORDER BY user_id,item_id')).rows,before.rows,
    'Negative and deletion-control transactions roll back exactly');
});

test('real two-client parent update makes a waiting sidebar child fail its exact composite reference',async()=>{
  const section='88888888-8888-4888-8888-888888888888';
  await client.query('INSERT INTO xroga_sidebar_sections(id,user_id,project_id,title) VALUES($1,$2,$3,$4)',[section,OWNER,A,'concurrency fixture']);
  const parent=new pg.Client({connectionString:url,connectionTimeoutMillis:5000}),child=new pg.Client({connectionString:url,connectionTimeoutMillis:5000});
  await parent.connect();await child.connect();
  try {
    for(const connection of [parent,child]){
      await connection.query('BEGIN');await connection.query('SET LOCAL ROLE authenticated');
      await connection.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[OWNER]);
      await connection.query("SET LOCAL statement_timeout='5000ms'");
    }
    const pid=(await child.query('SELECT pg_backend_pid() pid')).rows[0].pid;
    await parent.query('UPDATE xroga_sidebar_sections SET project_id=$1 WHERE id=$2',[SIDEBAR_PROJECT,section]);
    let settled=false;
    const pending=child.query("INSERT INTO xroga_sidebar_items(user_id,item_type,item_id,project_id,section_id) VALUES($1,'conversation','synthetic-lock-race',$2,$3)",[OWNER,A,section])
      .then(result=>({result}),error=>({error})).finally(()=>{settled=true;});
    let locked=false;
    for(let attempt=0;attempt<50;attempt++){
      const observed=await client.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[pid]);
      if(observed.rows[0]?.wait_event_type==='Lock'){locked=true;break;}
      if(settled)break;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    assert.equal(locked,true,'Child genuinely waits on the parent reference, no timing-only concurrency claim');
    await parent.query('COMMIT');const outcome=await pending;
    assert.equal(outcome.error?.code,'23503');assert.equal(outcome.error?.constraint,'xroga_sidebar_item_exact_section_parent');
    await child.query('ROLLBACK');
    assert.equal((await client.query("SELECT count(*)::int n FROM xroga_sidebar_items WHERE item_id='synthetic-lock-race'")).rows[0].n,0);
  } finally {
    await parent.query('ROLLBACK').catch(()=>{});await child.query('ROLLBACK').catch(()=>{});
    await parent.end();await child.end();
  }
});

test('real sidebar chat and title-backup policies isolate owners and forbid browser backup mutations',async()=>{
  await client.query("INSERT INTO xroga_sidebar_chats(user_id,id,title) VALUES($1,'synthetic-own-chat','Owned'),($2,'synthetic-foreign-chat','Foreign')",[OWNER,OTHER]);
  await client.query("INSERT INTO xroga_sidebar_legacy_title_backup(session_id,user_id,original_title) VALUES('synthetic-own-backup',$1,'Owned title'),('synthetic-foreign-backup',$2,'Foreign title')",[OWNER,OTHER]);
  assert.deepEqual((await asUser(OWNER,()=>client.query('SELECT id FROM xroga_sidebar_chats'))).rows,[{id:'synthetic-own-chat'}]);
  assert.equal((await asUser(OWNER,()=>client.query("INSERT INTO xroga_sidebar_chats(user_id,id,title) VALUES($1,'synthetic-positive','Positive') RETURNING id",[OWNER]))).rowCount,1);
  assert.equal((await asUser(OWNER,()=>client.query("UPDATE xroga_sidebar_chats SET title='Changed' WHERE user_id=$1 RETURNING id",[OWNER]))).rowCount,1);
  for(const [user,role]of [[OWNER,'authenticated'],['','anon']]){
    await assert.rejects(asUser(user,()=>client.query("INSERT INTO xroga_sidebar_chats(user_id,id) VALUES($1,'synthetic-forged')",[OTHER]),role),error=>error.code==='42501');
  }
  assert.equal((await asUser(OWNER,()=>client.query("UPDATE xroga_sidebar_chats SET title='Forbidden' WHERE user_id=$1 RETURNING id",[OTHER]))).rowCount,0);
  assert.equal((await asUser(OWNER,()=>client.query('DELETE FROM xroga_sidebar_chats WHERE user_id=$1 RETURNING id',[OTHER]))).rowCount,0);
  assert.equal((await asUser('',()=>client.query('SELECT id FROM xroga_sidebar_chats'),'anon')).rowCount,0);
  assert.deepEqual((await asUser(OWNER,()=>client.query('SELECT session_id FROM xroga_sidebar_legacy_title_backup'))).rows,[{session_id:'synthetic-own-backup'}]);
  const before=(await client.query('SELECT * FROM xroga_sidebar_legacy_title_backup ORDER BY session_id')).rows;
  await assert.rejects(asUser(OWNER,()=>client.query("INSERT INTO xroga_sidebar_legacy_title_backup(session_id,user_id,original_title) VALUES('synthetic-forged-backup',$1,'Denied')",[OWNER])),error=>error.code==='42501');
  // RLS must forbid writes even when a deployment has inherited DML grants.
  // Denial can be a privilege error or zero affected rows, never changed data.
  for(const sql of ["UPDATE xroga_sidebar_legacy_title_backup SET original_title='Denied' RETURNING session_id",'DELETE FROM xroga_sidebar_legacy_title_backup RETURNING session_id']){
    try{assert.equal((await asUser(OWNER,()=>client.query(sql))).rowCount,0);}catch(error){assert.equal(error.code,'42501');}
  }
  assert.deepEqual((await client.query('SELECT * FROM xroga_sidebar_legacy_title_backup ORDER BY session_id')).rows,before);
  assert.equal((await asUser('',()=>client.query("INSERT INTO xroga_sidebar_legacy_title_backup(session_id,user_id,original_title) VALUES('synthetic-service-backup',$1,'Service fixture') RETURNING session_id",[OWNER]),'service_role')).rowCount,1);
  assert.deepEqual((await client.query('SELECT * FROM xroga_sidebar_legacy_title_backup ORDER BY session_id')).rows,before,'Service positive control rolls back exactly');
});
