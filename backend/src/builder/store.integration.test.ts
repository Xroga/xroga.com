import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';

import { PG_TEST_URL } from '../storage/testing/pgFixture.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = ['20261026000100_builder_projects.sql', '20261026030000_builder_preview_readiness.sql'].map((name) => path.resolve(here, '../../../supabase/migrations', name));
const STUB = path.resolve(here, '../storage/testing/supabaseStub.sql');
const skip = PG_TEST_URL ? false : 'STORAGE_TEST_DATABASE_URL not set: the builder SQL is only exercised against a real PostgreSQL';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

describe('builder projects against real PostgreSQL', { skip }, () => {
  let pool: pg.Pool;
  let drop: () => Promise<void>;

  before(async () => {
    const admin = new pg.Client({ connectionString: PG_TEST_URL });
    await admin.connect();
    const name = `xroga_bp_${randomBytes(5).toString('hex')}`;
    await admin.query(`create database ${name}`);
    const url = new URL(PG_TEST_URL as string);
    url.pathname = `/${name}`;
    pool = new pg.Pool({ connectionString: url.toString(), max: 16 });
    pool.on('error', () => undefined);
    drop = async () => {
      await pool.end().catch(() => undefined);
      await admin.query(`drop database if exists ${name} with (force)`).catch(() => undefined);
      await admin.end().catch(() => undefined);
    };
    await pool.query(readFileSync(STUB, 'utf8'));
    await pool.query('insert into auth.users(id) values ($1),($2)', [OWNER, OTHER]);
    for (const file of MIGRATIONS) await pool.query(readFileSync(file, 'utf8'));
  });
  after(async () => {
    await drop?.();
  });

  async function project(owner = OWNER, key = `key-${randomBytes(6).toString('hex')}`): Promise<string> {
    const { rows } = await pool.query(
      `insert into public.builder_projects(user_id, request_key, title, product_type, spec, starter)
       values ($1,$2,'T','website','{}'::jsonb,'{}'::jsonb) returning id`,
      [owner, key],
    );
    return rows[0].id as string;
  }

  const append = (projectId: string, owner: string, run: string, sha: string, parent: string | null, files = [{ path: 'a', content: '1' }]) =>
    pool.query('select public.append_builder_revision($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10) as r', [
      projectId, owner, run, 'generation', sha, files.length, 1, JSON.stringify(files), '{}', parent,
    ]);

  it('one project per (owner, request key); the same key for another owner is allowed', async () => {
    await project(OWNER, 'unique-key-001');
    await assert.rejects(project(OWNER, 'unique-key-001'), (e: { code?: string }) => e.code === '23505');
    await project(OTHER, 'unique-key-001');
  });

  it('numbers revisions gaplessly and chains parents', async () => {
    const id = await project();
    const r1 = (await append(id, OWNER, 'run-1', SHA_A, null)).rows[0].r;
    const r2 = (await append(id, OWNER, 'run-2', SHA_B, r1.revision_id)).rows[0].r;
    assert.equal(r1.revision_number, 1);
    assert.equal(r2.revision_number, 2);
    const { rows } = await pool.query('select parent_revision_id, revision_number from public.builder_revisions where id=$1', [r2.revision_id]);
    assert.equal(rows[0].parent_revision_id, r1.revision_id);
    const head = await pool.query('select current_revision_id, current_revision_number from public.builder_projects where id=$1', [id]);
    assert.equal(head.rows[0].current_revision_id, r2.revision_id);
    assert.equal(head.rows[0].current_revision_number, 2);
  });

  it('replays an identical (run, content) append and reports a stale parent as a conflict', async () => {
    const id = await project();
    const first = (await append(id, OWNER, 'run-1', SHA_A, null)).rows[0].r;
    const replay = (await append(id, OWNER, 'run-1', SHA_A, null)).rows[0].r;
    assert.equal(replay.replayed, true);
    assert.equal(replay.revision_id, first.revision_id);
    const stale = (await append(id, OWNER, 'run-2', SHA_B, null)).rows[0].r;
    assert.equal(stale.conflict, true);
    assert.equal(stale.current_revision_id, first.revision_id);
    const count = await pool.query('select count(*)::int as n from public.builder_revisions where project_id=$1', [id]);
    assert.equal(count.rows[0].n, 1);
  });

  it('under concurrent writers on one parent exactly one wins and the others conflict', async () => {
    const id = await project();
    const base = (await append(id, OWNER, 'base', SHA_A, null)).rows[0].r.revision_id as string;
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => append(id, OWNER, `race-${i}`, String(i).padStart(2, '0').repeat(32), base)),
    );
    const outcomes = results.map((result) => result.rows[0].r);
    assert.equal(outcomes.filter((r) => r.revision_id && !r.replayed).length, 1);
    assert.equal(outcomes.filter((r) => r.conflict).length, 11);
    const count = await pool.query('select count(*)::int as n from public.builder_revisions where project_id=$1', [id]);
    assert.equal(count.rows[0].n, 2);
  });

  it('refuses a foreign owner and malformed input without writing', async () => {
    const id = await project();
    assert.equal((await append(id, OTHER, 'run-x', SHA_A, null)).rows[0].r, null);
    assert.equal((await append(id, OWNER, 'run-x', 'not-a-hash', null)).rows[0].r, null);
    const count = await pool.query('select count(*)::int as n from public.builder_revisions where project_id=$1', [id]);
    assert.equal(count.rows[0].n, 0);
  });

  it('browser roles can read only their own rows and cannot write or call the function', async () => {
    const mine = await project(OWNER);
    const theirs = await project(OTHER);
    const asUser = async <T>(userId: string, role: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(`set local role ${role}`);
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
        return await fn(client);
      } finally {
        await client.query('rollback');
        client.release();
      }
    };
    const rows = await asUser(OWNER, 'authenticated', (c) => c.query('select id from public.builder_projects'));
    assert.ok(rows.rows.some((r) => r.id === mine));
    assert.ok(!rows.rows.some((r) => r.id === theirs));
    await assert.rejects(asUser(OWNER, 'authenticated', (c) => c.query("insert into public.builder_projects(user_id,request_key,title,product_type,spec,starter) values ($1,'browser-key-1','T','w','{}','{}')", [OWNER])), (e: { code?: string }) => e.code === '42501');
    await assert.rejects(asUser(OWNER, 'authenticated', (c) => c.query('update public.builder_projects set title=$1 where id=$2', ['x', mine])), (e: { code?: string }) => e.code === '42501');
    await assert.rejects(asUser(OWNER, 'authenticated', (c) => c.query("select public.append_builder_revision($1,$2,'r','generation',$3,1,1,'[]'::jsonb,'{}'::jsonb,null)", [mine, OWNER, SHA_A])), (e: { code?: string }) => e.code === '42501');
    await assert.rejects(asUser(OWNER, 'anon', (c) => c.query('select 1 from public.builder_projects')), (e: { code?: string }) => e.code === '42501');
  });

  it('records the preview readiness against a revision, accepts only the documented shapes, and the migration is idempotent', async () => {
    const f = await project();
    const id = '0f3c1a1e-5d2b-4c6a-9e8f-1a2b3c4d5e6f';
    await pool.query('update public.builder_projects set preview_readiness=$2 where id=$1', [f, `${id}:ready`]);
    await pool.query('update public.builder_projects set preview_readiness=$2 where id=$1', [f, `${id}:failed`]);
    await pool.query('update public.builder_projects set preview_readiness=null where id=$1', [f]);
    for (const bad of ['ready', `${id}:maybe`, `${id}`, 'x:ready']) {
      await assert.rejects(pool.query('update public.builder_projects set preview_readiness=$2 where id=$1', [f, bad]), (e: { code?: string }) => e.code === '23514', bad);
    }
    await pool.query(readFileSync(MIGRATIONS[1], 'utf8'));
  });

  it('deleting the project removes its revisions and the schema rejects bad states and hashes', async () => {
    const id = await project();
    await append(id, OWNER, 'run-1', SHA_A, null);
    await assert.rejects(pool.query("update public.builder_projects set state='verified-ish' where id=$1", [id]), (e: { code?: string }) => e.code === '23514');
    await assert.rejects(pool.query("insert into public.builder_revisions(project_id,user_id,revision_number,run_id,origin,content_sha256,file_count,total_bytes,files) values ($1,$2,9,'r','generation','zz',0,0,'[]')", [id, OWNER]), (e: { code?: string }) => e.code === '23514');
    await pool.query('delete from public.builder_projects where id=$1', [id]);
    const left = await pool.query('select count(*)::int as n from public.builder_revisions where project_id=$1', [id]);
    assert.equal(left.rows[0].n, 0);
  });
});
