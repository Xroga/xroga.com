import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import type pg from 'pg';
import { MemoryObjectStore } from './memoryObjectStore.js';
import { defaultPolicyConfig } from './policy.js';
import { PostgresStorageRepository } from './postgresRepository.js';
import { StorageService } from './storageService.js';
import { sha256Hex } from './integrity.js';
import { createDisposableDb, PG_TEST_URL } from './testing/pgFixture.js';
import { StorageError, type StorageActor } from './types.js';

const BUCKET = 'xroga-drive-test';
const skip = PG_TEST_URL ? false : 'STORAGE_TEST_DATABASE_URL not set: real-Postgres tests not run (these are the only tests that exercise the SQL)';

describe('Xroga Drive against real PostgreSQL (migration + RLS + atomic quota)', { skip }, () => {
  let pool: pg.Pool;
  let drop: () => Promise<void>;
  let repo: PostgresStorageRepository;
  const actor = (): StorageActor => { const id = randomUUID(); return { userId: id, tenantId: id }; };
  const mkSvc = (quota: number | null, store = new MemoryObjectStore()) => ({
    store,
    svc: new StorageService({ repo, store, bucket: BUCKET, policy: defaultPolicyConfig({}), quota: async () => quota }),
  });
  const asRole = async <T>(role: 'authenticated' | 'anon', sub: string | null, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> => {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`set local role ${role}`);
      if (sub) await c.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub]);
      return await fn(c);
    } finally {
      await c.query('rollback').catch(() => null);
      c.release();
    }
  };

  before(async () => {
    const db = await createDisposableDb();
    pool = db.pool; drop = db.drop; repo = new PostgresStorageRepository(pool);
  });
  after(async () => { await drop(); });

  it('full lifecycle through real SQL: reach READY with verified hash, usage exact', async () => {
    const a = actor();
    const { svc, store } = mkSvc(null);
    const body = Buffer.from('postgres-backed object');
    const init = await svc.initiateUpload(a, { filename: 'a.txt', contentType: 'text/plain', size: body.length, sha256: sha256Hex(body) });
    if (init.mode !== 'single') throw new Error();
    assert.equal(store.clientPut(init.upload.url, init.upload.headers, body).status, 200);
    const done = await svc.completeUpload(a, init.objectId);
    assert.equal(done.state, 'READY');
    const u = await repo.getUsage(a.tenantId);
    assert.deepEqual([u.reservedBytes, u.committedBytes], [0, body.length]);
    await svc.deleteObject(a, init.objectId);
    assert.equal((await repo.getObject(init.objectId))!.state, 'DELETED');
    assert.equal((await repo.getUsage(a.tenantId)).committedBytes, 0);
  });

  it('the database itself refuses PENDING->READY, READY without a verified hash, and identity edits', async () => {
    const a = actor();
    const { svc } = mkSvc(null);
    const init = await svc.initiateUpload(a, { filename: 'a.txt', contentType: 'text/plain', size: 3 });
    const bad = (sql: string, p: unknown[] = []) => pool.query(sql, p).then(() => assert.fail('should have been rejected'), (e) => e);
    let e = await bad(`update public.storage_objects set state='READY' where id=$1`, [init.objectId]);
    assert.equal(e.code, '23514');
    await pool.query(`update public.storage_objects set state='VERIFYING' where id=$1`, [init.objectId]); // legal: UPLOADING->VERIFYING
    e = await bad(`update public.storage_objects set state='READY' where id=$1`, [init.objectId]);
    assert.equal(e.code, '23514', 'READY check constraint: no size/hash');
    e = await bad(`update public.storage_objects set tenant_id=$2 where id=$1`, [init.objectId, randomUUID()]);
    assert.equal(e.code, '23514');
    e = await bad(`update public.storage_objects set object_key='v1/x' where id=$1`, [init.objectId]);
    assert.equal(e.code, '23514');
  });

  it('DELETED is terminal in the database', async () => {
    const a = actor();
    const { svc } = mkSvc(null);
    const init = await svc.initiateUpload(a, { filename: 'a.txt', contentType: 'text/plain', size: 3 });
    await svc.deleteObject(a, init.objectId);
    await assert.rejects(pool.query(`update public.storage_objects set state='PENDING' where id=$1`, [init.objectId]), (e: { code?: string }) => e.code === '23514');
  });

  it('50 truly concurrent reservations against a 1000-byte quota admit exactly 10', async () => {
    const a = actor();
    const { svc } = mkSvc(1000);
    const results = await Promise.allSettled(Array.from({ length: 50 }, (_, i) => svc.initiateUpload(a, { filename: `f${i}.txt`, contentType: 'text/plain', size: 100 })));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const quota = results.filter((r) => r.status === 'rejected' && (r.reason as StorageError).code === 'QUOTA_EXCEEDED').length;
    assert.equal(ok, 10);
    assert.equal(ok + quota, 50);
    const u = await repo.getUsage(a.tenantId);
    assert.equal(u.reservedBytes, 1000);
    const sum = await pool.query(`select coalesce(sum(bytes),0)::bigint s from public.storage_reservations where tenant_id=$1 and state='ACTIVE'`, [a.tenantId]);
    assert.equal(Number(sum.rows[0].s), 1000);
  });

  it('concurrent completions of the same object commit the bytes exactly once', async () => {
    const a = actor();
    const { svc, store } = mkSvc(null);
    const body = Buffer.from('race me');
    const init = await svc.initiateUpload(a, { filename: 'a.txt', contentType: 'text/plain', size: body.length });
    if (init.mode !== 'single') throw new Error();
    store.clientPut(init.upload.url, init.upload.headers, body);
    const rs = await Promise.allSettled(Array.from({ length: 8 }, () => svc.completeUpload(a, init.objectId)));
    assert.ok(rs.some((r) => r.status === 'fulfilled'));
    for (const r of rs) if (r.status === 'rejected') assert.ok(['CONFLICT', 'BAD_STATE'].includes((r.reason as StorageError).code), String(r.reason));
    const u = await repo.getUsage(a.tenantId);
    assert.deepEqual([u.reservedBytes, u.committedBytes], [0, body.length]);
    assert.equal((await repo.getObject(init.objectId))!.state, 'READY');
  });

  it('commit/release/free are idempotent and never go negative', async () => {
    const a = actor();
    const { svc } = mkSvc(null);
    const init = await svc.initiateUpload(a, { filename: 'a.txt', contentType: 'text/plain', size: 10 });
    assert.equal(await repo.commit(init.objectId, 10), 'OK');
    assert.equal(await repo.commit(init.objectId, 10), 'ALREADY_COMMITTED');
    assert.equal(await repo.release(init.objectId), 'NOOP');
    assert.equal(await repo.free(init.objectId), 'OK');
    assert.equal(await repo.free(init.objectId), 'NOOP');
    assert.equal(await repo.commit(init.objectId, 10), 'RESERVATION_LOST');
    const u = await repo.getUsage(a.tenantId);
    assert.deepEqual([u.reservedBytes, u.committedBytes], [0, 0]);
    assert.equal(await repo.commit(randomUUID(), 1), 'NO_RESERVATION');
  });

  it('reconcile_usage repairs drift injected with a superuser UPDATE', async () => {
    const a = actor();
    const { svc, store } = mkSvc(null);
    const body = Buffer.from('12345');
    const init = await svc.initiateUpload(a, { filename: 'a.txt', contentType: 'text/plain', size: 5 });
    if (init.mode !== 'single') throw new Error();
    store.clientPut(init.upload.url, init.upload.headers, body);
    await svc.completeUpload(a, init.objectId);
    await pool.query(`update public.storage_usage set committed_bytes = 99999, reserved_bytes = 12 where tenant_id=$1`, [a.tenantId]);
    const r = await repo.reconcileUsage(a.tenantId);
    assert.equal(r.before.committedBytes, 99999);
    assert.deepEqual([r.after.reservedBytes, r.after.committedBytes], [0, 5]);
  });

  describe('RLS and grants', () => {
    let alice: StorageActor, bob: StorageActor, readyId: string, pendingId: string;
    before(async () => {
      alice = actor(); bob = actor();
      const { svc, store } = mkSvc(null);
      const body = Buffer.from('rls object');
      const a = await svc.initiateUpload(alice, { filename: 'ready.txt', contentType: 'text/plain', size: body.length });
      if (a.mode !== 'single') throw new Error();
      store.clientPut(a.upload.url, a.upload.headers, body);
      await svc.completeUpload(alice, a.objectId);
      readyId = a.objectId;
      pendingId = (await svc.initiateUpload(alice, { filename: 'pending.txt', contentType: 'text/plain', size: 1 })).objectId;
    });

    it('an owner sees only their own READY objects', async () => {
      const mine = await asRole('authenticated', alice.userId, (c) => c.query('select id from public.storage_objects'));
      assert.deepEqual(mine.rows.map((r) => r.id), [readyId]);
      const theirs = await asRole('authenticated', bob.userId, (c) => c.query('select id from public.storage_objects'));
      assert.equal(theirs.rowCount, 0);
    });
    it('authenticated cannot read bucket/object_key/upload id columns', async () => {
      for (const col of ['object_key', 'bucket', 'multipart_upload_id', 'error_detail']) {
        await assert.rejects(asRole('authenticated', alice.userId, (c) => c.query(`select ${col} from public.storage_objects`)), /permission denied/, col);
      }
      await assert.rejects(asRole('authenticated', alice.userId, (c) => c.query('select * from public.storage_objects')), /permission denied/);
    });
    it('authenticated cannot insert, update, delete, or call quota/migration functions', async () => {
      await assert.rejects(asRole('authenticated', alice.userId, (c) => c.query(`update public.storage_objects set visibility='public' where id=$1`, [readyId])), /permission denied/);
      await assert.rejects(asRole('authenticated', alice.userId, (c) => c.query(`delete from public.storage_objects where id=$1`, [readyId])), /permission denied/);
      await assert.rejects(asRole('authenticated', alice.userId, (c) => c.query(`insert into public.storage_objects (id,tenant_id,owner_user_id,object_class,original_filename,safe_filename,bucket,object_key,content_type,declared_size) values (gen_random_uuid(),$1,$1,'upload','a','a','b','k','text/plain',1)`, [alice.userId])), /permission denied/);
      await assert.rejects(asRole('authenticated', alice.userId, (c) => c.query(`select public.storage_reserve(gen_random_uuid(), $1, 10, now(), null)`, [alice.tenantId])), /permission denied/);
      await assert.rejects(asRole('authenticated', alice.userId, (c) => c.query(`select public.storage_free($1)`, [readyId])), /permission denied/);
      await assert.rejects(asRole('authenticated', alice.userId, (c) => c.query('select * from public.storage_usage')), /permission denied/);
      await assert.rejects(asRole('authenticated', alice.userId, (c) => c.query('select * from public.storage_migration_items')), /permission denied/);
      await assert.rejects(asRole('authenticated', alice.userId, (c) => c.query('select * from public.storage_audit_events')), /permission denied/);
    });
    it('anon sees and does nothing', async () => {
      await assert.rejects(asRole('anon', null, (c) => c.query('select id from public.storage_objects')), /permission denied/);
    });
    it('forged JWT subject cannot widen what is visible', async () => {
      const r = await asRole('authenticated', `${alice.userId}' or '1'='1`.slice(0, 0) || randomUUID(), (c) => c.query('select id from public.storage_objects'));
      assert.equal(r.rowCount, 0);
      assert.ok(pendingId);
    });
  });

  describe('migration ledger', () => {
    it('one destination per source: duplicate source rows are refused at the database', async () => {
      const job = await pool.query(`insert into public.storage_migration_jobs (name, source_provider, destination_bucket, created_by) values ('t','legacy_r2','b','test') returning id`);
      const ins = (id: string) => pool.query(`insert into public.storage_migration_items (job_id, source_provider, source_id) values ($1,'legacy_r2',$2)`, [job.rows[0].id, id]);
      await ins('users/x/1.png');
      await assert.rejects(ins('users/x/1.png'), (e: { code?: string }) => e.code === '23505');
    });
    it('concurrent workers claim disjoint items (SKIP LOCKED) and leases block re-claims until expiry', async () => {
      const job = await pool.query(`insert into public.storage_migration_jobs (name, source_provider, destination_bucket, created_by) values ('claim','legacy_r2','b','test') returning id`);
      const jobId = job.rows[0].id as string;
      for (let i = 0; i < 40; i++) await pool.query(`insert into public.storage_migration_items (job_id, source_provider, source_id, status) values ($1,'legacy_r2',$2,'ELIGIBLE')`, [jobId, `claim/${i}`]);
      const claim = (w: string) => pool.query(`select id from public.storage_migration_claim($1,$2,15,60)`, [jobId, w]);
      const [a, b, c] = await Promise.all([claim('w1'), claim('w2'), claim('w3')]);
      const ids = [...a.rows, ...b.rows, ...c.rows].map((r) => r.id);
      assert.equal(ids.length, 40);
      assert.equal(new Set(ids).size, 40, 'no item claimed twice');
      assert.equal((await claim('w4')).rowCount, 0, 'live leases are not stolen');
      await pool.query(`update public.storage_migration_items set lease_expires_at = now() - interval '1 second' where job_id=$1`, [jobId]);
      assert.equal((await claim('w4')).rowCount, 15, 'expired leases are recoverable');
    });
  });
});
