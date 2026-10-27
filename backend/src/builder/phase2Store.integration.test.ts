import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';

import { PG_TEST_URL } from '../storage/testing/pgFixture.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = ['20261026000000_builder_projects.sql', '20261026010000_builder_phase2.sql', '20261026020000_builder_phase3.sql'].map((name) => path.resolve(here, '../../../supabase/migrations', name));
const STUB = path.resolve(here, '../storage/testing/supabaseStub.sql');
const skip = PG_TEST_URL ? false : 'STORAGE_TEST_DATABASE_URL not set: the Phase 2 builder SQL is only exercised against a real PostgreSQL';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SHA = 'a'.repeat(64);

describe('builder Phase 2 tables against real PostgreSQL', { skip }, () => {
  let pool: pg.Pool;
  let drop: () => Promise<void>;

  before(async () => {
    const admin = new pg.Client({ connectionString: PG_TEST_URL });
    await admin.connect();
    const name = `xroga_bp2_${randomBytes(5).toString('hex')}`;
    await admin.query(`create database ${name}`);
    const url = new URL(PG_TEST_URL as string);
    url.pathname = `/${name}`;
    pool = new pg.Pool({ connectionString: url.toString(), max: 8 });
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

  async function fixture(owner = OWNER): Promise<{ projectId: string; revisionId: string }> {
    const project = await pool.query(`insert into public.builder_projects(user_id, request_key, title, product_type, spec, starter) values ($1,$2,'T','website','{}','{}') returning id`, [owner, `k-${randomBytes(6).toString('hex')}`]);
    const projectId = project.rows[0].id as string;
    const revision = await pool.query('select public.append_builder_revision($1,$2,$3,$4,$5,1,1,$6::jsonb,$7::jsonb,null) as r', [projectId, owner, 'seed-run-0001', 'starter', SHA, JSON.stringify([{ path: 'a', content: '1' }]), '{}']);
    return { projectId, revisionId: revision.rows[0].r.revision_id as string };
  }

  const verification = (f: { projectId: string; revisionId: string }, over: Record<string, unknown> = {}) =>
    pool.query('insert into public.builder_verifications(project_id,user_id,revision_id,run_id,kind,status,executed_checks,report) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id', [
      f.projectId, OWNER, f.revisionId, over.runId ?? 'qa-run-00001', over.kind ?? 'browser_qa', over.status ?? 'passed', over.executed ?? 3, '{}',
    ]);

  it('records one verification per (revision, run, kind) and rejects invalid kinds and statuses', async () => {
    const f = await fixture();
    await verification(f);
    await assert.rejects(verification(f), (e: { code?: string }) => e.code === '23505');
    await verification(f, { runId: 'qa-run-00002' });
    await verification(f, { kind: 'export' });
    await assert.rejects(verification(f, { runId: 'qa-run-00003', kind: 'deploy' }), (e: { code?: string }) => e.code === '23514');
    await assert.rejects(verification(f, { runId: 'qa-run-00004', status: 'green' }), (e: { code?: string }) => e.code === '23514');
    await assert.rejects(verification(f, { runId: 'short' }), (e: { code?: string }) => e.code === '23514');
  });

  const operation = (f: { projectId: string; revisionId: string }, over: Record<string, unknown> = {}) =>
    pool.query('insert into public.builder_external_operations(project_id,user_id,provider,action,operation_key,revision_id,status,plan,plan_digest,approved_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id', [
      f.projectId, OWNER, over.provider ?? 'github', over.action ?? 'create_repository', over.key ?? 'op-key-000001', f.revisionId, over.status ?? 'prepared', '{}', over.digest ?? SHA, over.approvedAt ?? null,
    ]);

  it('makes an operation key idempotent per project and action, and constrains provider, action, status and digest', async () => {
    const f = await fixture();
    await operation(f);
    await assert.rejects(operation(f), (e: { code?: string }) => e.code === '23505');
    await operation(f, { action: 'push_revision' });
    await assert.rejects(operation(f, { key: 'op-key-000002', provider: 'gitlab' }), (e: { code?: string }) => e.code === '23514');
    await assert.rejects(operation(f, { key: 'op-key-000003', action: 'delete_repository' }), (e: { code?: string }) => e.code === '23514');
    await assert.rejects(operation(f, { key: 'op-key-000004', status: 'done' }), (e: { code?: string }) => e.code === '23514');
    await assert.rejects(operation(f, { key: 'op-key-000005', digest: 'nothex' }), (e: { code?: string }) => e.code === '23514');
    await assert.rejects(operation(f, { key: 'short' }), (e: { code?: string }) => e.code === '23514');
  });

  it('cannot be approved, executing or succeeded without an approval timestamp', async () => {
    const f = await fixture();
    for (const status of ['approved', 'executing', 'succeeded']) {
      await assert.rejects(operation(f, { key: `needs-approval-${status}`, status }), (e: { code?: string }) => e.code === '23514', status);
    }
    await operation(f, { key: 'approved-ok-00001', status: 'approved', approvedAt: new Date().toISOString() });
  });

  it('Phase 3: accepts Supabase and Vercel operations, keeps the in-flight slot per provider, and releases a stranded one', async () => {
    const f = await fixture();
    const when = new Date().toISOString();
    const supabase = (await operation(f, { provider: 'supabase', action: 'apply_migration', key: 'p3-supabase-0001', status: 'approved', approvedAt: when })).rows[0].id as string;
    const supabase2 = (await operation(f, { provider: 'supabase', action: 'bind_supabase_project', key: 'p3-supabase-0002', status: 'approved', approvedAt: when })).rows[0].id as string;
    const vercel = (await operation(f, { provider: 'vercel', action: 'deploy_preview', key: 'p3-vercel-00001', status: 'approved', approvedAt: when })).rows[0].id as string;
    await operation(f, { provider: 'vercel', action: 'promote_production', key: 'p3-vercel-00002' });
    await operation(f, { provider: 'vercel', action: 'prepare_preview', key: 'p3-vercel-00003' });
    const claim = (id: string) => pool.query("update public.builder_external_operations set status='executing' where id=$1 and status in ('approved')", [id]);
    await claim(supabase);
    await claim(vercel); // a different provider may run at the same time
    await assert.rejects(claim(supabase2), (e: { code?: string }) => e.code === '23505', 'a second Supabase operation cannot start while one is in flight');
    // A crash left it executing: moving it to ambiguous (compare-and-set) frees the slot, and nothing is lost.
    const recovered = await pool.query("update public.builder_external_operations set status='ambiguous', failure='interrupted' where id=$1 and status='executing'", [supabase]);
    assert.equal(recovered.rowCount, 1);
    assert.equal((await claim(supabase2)).rowCount, 1);
    await assert.rejects(operation(f, { provider: 'netlify', action: 'deploy_preview', key: 'p3-bad-provider1' }), (e: { code?: string }) => e.code === '23514');
    await assert.rejects(operation(f, { provider: 'vercel', action: 'delete_project', key: 'p3-bad-action-001' }), (e: { code?: string }) => e.code === '23514');
  });

  it('Phase 3 migration is idempotent and its documented rollback is possible once new rows are removed', async () => {
    await pool.query(readFileSync(MIGRATIONS[2], 'utf8'));
    const f = await fixture();
    await operation(f, { provider: 'vercel', action: 'deploy_preview', key: 'p3-rollback-0001' });
    await pool.query("delete from public.builder_external_operations where provider <> 'github'");
    await pool.query(`alter table public.builder_external_operations drop constraint builder_external_operations_provider_check,
      add constraint builder_external_operations_provider_check check (provider in ('github'))`);
    await assert.rejects(operation(f, { provider: 'supabase', action: 'apply_migration', key: 'p3-rollback-0002' }), (e: { code?: string }) => e.code === '23514');
    await pool.query(readFileSync(MIGRATIONS[2], 'utf8'));
    await operation(f, { provider: 'supabase', action: 'apply_migration', key: 'p3-rollback-0003' });
  });

  it('allows at most one executing operation per project and provider, and the status predicate arbitrates a race', async () => {
    const f = await fixture();
    const a = (await operation(f, { key: 'race-op-000001', status: 'approved', approvedAt: new Date().toISOString() })).rows[0].id as string;
    const b = (await operation(f, { key: 'race-op-000002', status: 'approved', approvedAt: new Date().toISOString() })).rows[0].id as string;
    const claim = (id: string) => pool.query("update public.builder_external_operations set status='executing' where id=$1 and status in ('approved')", [id]);
    const results = await Promise.allSettled([claim(a), claim(b)]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, 'the partial unique index admits exactly one executing operation');
    assert.ok(results.some((r) => r.status === 'rejected' && (r.reason as { code?: string }).code === '23505'));
    // Compare-and-set: moving an already-claimed row again changes nothing.
    const winner = results[0].status === 'fulfilled' ? a : b;
    const again = await pool.query("update public.builder_external_operations set status='executing' where id=$1 and status in ('approved')", [winner]);
    assert.equal(again.rowCount, 0);
  });

  it('removes verifications and operations with their project, and requires an existing revision', async () => {
    const f = await fixture();
    await verification(f);
    await operation(f);
    await assert.rejects(pool.query(`insert into public.builder_external_operations(project_id,user_id,provider,action,operation_key,revision_id,plan,plan_digest) values ($1,$2,'github','create_repository','orphan-key-0001','99999999-9999-4999-8999-999999999999','{}',$3)`, [f.projectId, OWNER, SHA]), (e: { code?: string }) => e.code === '23503');
    await pool.query('delete from public.builder_projects where id=$1', [f.projectId]);
    const left = await pool.query('select (select count(*) from public.builder_verifications where project_id=$1)::int as v, (select count(*) from public.builder_external_operations where project_id=$1)::int as o', [f.projectId]);
    assert.deepEqual(left.rows[0], { v: 0, o: 0 });
  });

  it('lets a browser role read only its own rows and never write', async () => {
    const mine = await fixture(OWNER);
    const theirs = await fixture(OTHER);
    await verification(mine);
    await pool.query(`insert into public.builder_verifications(project_id,user_id,revision_id,run_id,kind,status,report) values ($1,$2,$3,'other-run-001','browser_qa','passed','{}')`, [theirs.projectId, OTHER, theirs.revisionId]);
    const asUser = async <T>(userId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query('set local role authenticated');
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
        return await fn(client);
      } finally {
        await client.query('rollback');
        client.release();
      }
    };
    const rows = await asUser(OWNER, (c) => c.query('select project_id from public.builder_verifications'));
    assert.ok(rows.rows.every((row) => row.project_id !== theirs.projectId));
    assert.ok(rows.rows.some((row) => row.project_id === mine.projectId));
    await assert.rejects(asUser(OWNER, (c) => c.query(`insert into public.builder_verifications(project_id,user_id,revision_id,run_id,kind,status,report) values ($1,$2,$3,'browser-run-01','browser_qa','passed','{}')`, [mine.projectId, OWNER, mine.revisionId])), (e: { code?: string }) => e.code === '42501');
    await assert.rejects(asUser(OWNER, (c) => c.query("update public.builder_external_operations set status='approved'")), (e: { code?: string }) => e.code === '42501');
    await assert.rejects(asUser(OWNER, (c) => c.query('delete from public.builder_verifications')), (e: { code?: string }) => e.code === '42501');
    const ops = await asUser(OTHER, (c) => c.query('select id from public.builder_external_operations'));
    assert.equal(ops.rowCount, 0, 'another tenant sees none of the owner\'s operations');
  });
});
