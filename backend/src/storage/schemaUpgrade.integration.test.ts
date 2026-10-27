import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import type pg from 'pg';
import { createDisposableDb, MIGRATION, PG_TEST_URL, ROLLBACK } from './testing/pgFixture.js';

const skip = PG_TEST_URL ? false : 'STORAGE_TEST_DATABASE_URL not set';
const NEW_TABLES = ['storage_objects', 'storage_usage', 'storage_reservations', 'storage_audit_events', 'storage_migration_jobs', 'storage_migration_items'];

describe('migration upgrade, idempotency, hardening and rollback on real PostgreSQL', { skip }, () => {
  const drops: Array<() => Promise<void>> = [];
  after(async () => { for (const d of drops) await d(); });
  const cols = async (pool: pg.Pool) => (await pool.query(`select column_name from information_schema.columns where table_schema='public' and table_name='project_files' order by 1`)).rows.map((r) => r.column_name);

  it('upgrade of a populated schema keeps every existing row byte-identical; the new column is null', async () => {
    const owner = randomUUID(), project = randomUUID();
    let before: unknown[] = [];
    const db = await createDisposableDb({
      beforeMigration: async (pool) => {
        await pool.query('insert into public.projects (id,user_id) values ($1,$2)', [project, owner]);
        for (let i = 0; i < 25; i++) await pool.query(`insert into public.project_files (project_id,file_name,file_type,file_url,content) values ($1,$2,'code',$3,$4)`, [project, `f${i}.ts`, i % 2 ? `data:text/plain;base64,${Buffer.from('x' + i).toString('base64')}` : null, `content ${i}`]);
        before = (await pool.query('select id,project_id,file_name,file_type,file_url,content,version,created_at from public.project_files order by id')).rows;
      },
    });
    drops.push(db.drop);
    const after_ = (await db.pool.query('select id,project_id,file_name,file_type,file_url,content,version,created_at from public.project_files order by id')).rows;
    assert.deepEqual(after_, before);
    assert.equal((await db.pool.query('select count(*)::int n from public.project_files where storage_object_id is not null')).rows[0].n, 0);
  });

  it('is idempotent: applying the migration a second and third time changes nothing and raises nothing', async () => {
    const db = await createDisposableDb(); drops.push(db.drop);
    const sql = readFileSync(MIGRATION, 'utf8');
    const snap = async () => (await db.pool.query(`select table_name, column_name, data_type from information_schema.columns where table_schema='public' and table_name like 'storage_%' order by 1,2`)).rows;
    const first = await snap();
    await db.pool.query(sql); await db.pool.query(sql);
    assert.deepEqual(await snap(), first);
    const policies = (await db.pool.query(`select count(*)::int n from pg_policies where schemaname='public' and tablename='storage_objects'`)).rows[0].n;
    assert.equal(policies, 1);
  });

  it('privileged-function and table hardening is in place: pinned search_path, RLS forced, no PUBLIC execute', async () => {
    const db = await createDisposableDb(); drops.push(db.drop);
    for (const t of NEW_TABLES) {
      const r = (await db.pool.query(`select relrowsecurity rls, relforcerowsecurity force_ from pg_class where oid = ('public.' || $1)::regclass`, [t])).rows[0];
      assert.deepEqual([r.rls, r.force_], [true, true], t);
    }
    const fns = (await db.pool.query(`select proname, proconfig, has_function_privilege('public', oid, 'execute') pub, has_function_privilege('anon', oid, 'execute') anon, has_function_privilege('authenticated', oid, 'execute') authed, has_function_privilege('service_role', oid, 'execute') svc from pg_proc where pronamespace = 'public'::regnamespace and proname like 'storage_%' and proname <> 'storage_objects_guard'`)).rows;
    assert.ok(fns.length >= 7);
    for (const f of fns) {
      assert.ok((f.proconfig ?? []).some((c: string) => c.startsWith('search_path=')), `${f.proname} has a pinned search_path`);
      assert.deepEqual([f.pub, f.anon, f.authed, f.svc], [false, false, false, true], f.proname);
    }
    const guard = (await db.pool.query(`select proconfig from pg_proc where proname = 'storage_objects_guard'`)).rows[0];
    assert.ok((guard.proconfig ?? []).some((c: string) => c.startsWith('search_path=')));
  });

  it('wrong-tenant use of the quota functions is refused by the database itself', async () => {
    const db = await createDisposableDb(); drops.push(db.drop);
    const a = randomUUID(), b = randomUUID(), obj = randomUUID();
    await db.pool.query(`insert into public.storage_objects (id,tenant_id,owner_user_id,object_class,original_filename,safe_filename,bucket,object_key,content_type,declared_size) values ($1,$2,$2,'upload','a','a','b','k1','text/plain',10)`, [obj, a]);
    assert.equal((await db.pool.query('select public.storage_reserve($1,$2,10,now()+interval \'1 hour\',null) v', [obj, a])).rows[0].v, 'OK');
    await assert.rejects(db.pool.query('select public.storage_reserve($1,$2,10,now()+interval \'1 hour\',null)', [obj, b]), /tenant mismatch/);
    assert.equal((await db.pool.query('select reserved_bytes::int r from public.storage_usage where tenant_id=$1', [b])).rows[0]?.r ?? 0, 0);
  });

  it('the documented rollback restores the original shape and leaves existing rows untouched', async () => {
    const project = randomUUID();
    let originalCols: string[] = []; let before: unknown[] = [];
    const db = await createDisposableDb({
      beforeMigration: async (pool) => {
        await pool.query('insert into public.projects (id,user_id) values ($1,$2)', [project, randomUUID()]);
        await pool.query(`insert into public.project_files (project_id,file_name,file_type,content) values ($1,'a.ts','code','x')`, [project]);
        originalCols = await cols(pool);
        before = (await pool.query('select * from public.project_files order by id')).rows;
      },
    });
    drops.push(db.drop);
    assert.ok((await cols(db.pool)).includes('storage_object_id'));
    await db.pool.query(readFileSync(ROLLBACK, 'utf8'));
    assert.deepEqual(await cols(db.pool), originalCols);
    assert.deepEqual((await db.pool.query('select * from public.project_files order by id')).rows, before);
    for (const t of NEW_TABLES) assert.equal((await db.pool.query(`select to_regclass('public.${t}') r`)).rows[0].r, null, t);
    await db.pool.query(readFileSync(ROLLBACK, 'utf8')); // rollback itself is repeatable
    await db.pool.query(readFileSync(MIGRATION, 'utf8')); // and the migration re-applies cleanly afterwards
    assert.ok((await cols(db.pool)).includes('storage_object_id'));
  });
});
