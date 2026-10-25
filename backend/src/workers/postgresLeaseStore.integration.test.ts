import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';
import { createDisposableDb, PG_TEST_URL } from '../storage/testing/pgFixture.js';
import { LeaseError, type LeaseKey } from './leaseStore.js';
import { leaseStoreContract } from './leaseStore.contract.js';
import { PostgresLeaseStore } from './postgresLeaseStore.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(here, '../../../supabase/migrations/20261024000000_worker_task_leases.sql');
const ROLLBACK = path.resolve(here, '../../../docs/infra/batch-1.5/rollback/20261024000000_worker_task_leases.down.sql');
const skip = PG_TEST_URL ? false : 'STORAGE_TEST_DATABASE_URL not set: real-Postgres tests not run (these are the only tests that exercise the lease SQL)';
const key: LeaseKey = { tenantId: 't1', runId: 'run1', taskId: 'task1' };

describe('worker task leases against real PostgreSQL', { skip }, () => {
  let pool: pg.Pool;
  let drop: () => Promise<void>;
  let url: string;

  before(async () => {
    const db = await createDisposableDb();
    pool = db.pool; drop = db.drop; url = db.url;
    await pool.query(readFileSync(MIGRATION, 'utf8'));
  });
  after(async () => { await drop(); });

  // the same behaviour every LeaseStore must have, here through the real SQL with an explicit clock
  leaseStoreContract('PostgresLeaseStore', async (clock) => {
    await pool.query('truncate public.worker_task_leases');
    return new PostgresLeaseStore(pool, () => clock.now());
  });

  it('under real contention exactly one of many concurrent acquirers wins', async () => {
    await pool.query('truncate public.worker_task_leases');
    const store = new PostgresLeaseStore(pool); // database clock
    const results = await Promise.all(Array.from({ length: 24 }, (_, i) => store.acquire(key, `worker-${i}`, 30_000)));
    const winners = results.filter((l) => l !== null);
    assert.equal(winners.length, 1);
    assert.equal(winners[0]!.token, 1);
    const holder = await store.holder(key);
    assert.equal(holder?.workerId, winners[0]!.workerId);
  });

  it('a lease taken through one connection pool is honoured through another (it is shared state, not process memory)', async () => {
    await pool.query('truncate public.worker_task_leases');
    const other = new pg.Pool({ connectionString: url, max: 2 });
    try {
      const a = new PostgresLeaseStore(pool);
      const b = new PostgresLeaseStore(other);
      const mine = await a.acquire(key, 'worker-a', 30_000);
      assert.ok(mine);
      assert.equal(await b.acquire(key, 'worker-b', 30_000), null);
      assert.equal((await b.holder(key))?.workerId, 'worker-a');
      await a.release(mine);
      const taken = await b.acquire(key, 'worker-b', 30_000);
      assert.equal(taken?.token, 2);
      await assert.rejects(a.assertCurrent(mine), (e) => e instanceof LeaseError && e.code === 'LEASE_LOST');
    } finally { await other.end(); }
  });

  it('with the database clock, an unrenewed lease really expires and the next holder gets a higher token', async () => {
    await pool.query('truncate public.worker_task_leases');
    const store = new PostgresLeaseStore(pool);
    const first = (await store.acquire(key, 'worker-a', 60))!;
    await new Promise((r) => setTimeout(r, 120));
    await assert.rejects(store.assertCurrent(first), (e) => e instanceof LeaseError && e.code === 'LEASE_EXPIRED');
    const second = (await store.acquire(key, 'worker-b', 5_000))!;
    assert.ok(second.token > first.token);
    await assert.rejects(store.renew(first, 5_000), (e) => e instanceof LeaseError && e.code === 'LEASE_LOST');
  });

  it('the table and functions are private: anon and authenticated can neither read, write nor execute', async () => {
    await pool.query('truncate public.worker_task_leases');
    await new PostgresLeaseStore(pool).acquire(key, 'worker-a', 30_000);
    for (const role of ['anon', 'authenticated']) {
      const c = await pool.connect();
      try {
        await c.query('begin');
        await c.query(`set local role ${role}`);
        await assert.rejects(c.query('select * from public.worker_task_leases'), /permission denied/i, `${role} select`);
        await c.query('rollback');
        await c.query('begin');
        await c.query(`set local role ${role}`);
        await assert.rejects(c.query("select public.worker_lease_acquire('t','r','k','w',1000)"), /permission denied/i, `${role} acquire`);
        await c.query('rollback');
        await c.query('begin');
        await c.query(`set local role ${role}`);
        await assert.rejects(c.query("insert into public.worker_task_leases values ('t','r','k','w',1,now(),true,now())"), /permission denied/i, `${role} insert`);
      } finally { await c.query('rollback').catch(() => null); c.release(); }
    }
    const rls = await pool.query("select relrowsecurity, relforcerowsecurity from pg_class where oid = 'public.worker_task_leases'::regclass");
    assert.deepEqual(rls.rows[0], { relrowsecurity: true, relforcerowsecurity: true });
  });

  it('the database refuses out-of-range ttls and over-long identifiers', async () => {
    await assert.rejects(pool.query("select public.worker_lease_acquire('t','r','k','w',0)"), /ttl out of range/);
    await assert.rejects(pool.query("select public.worker_lease_acquire('t','r','k','w',900001)"), /ttl out of range/);
    await assert.rejects(pool.query('select public.worker_lease_acquire($1,$2,$3,$4,1000)', ['x'.repeat(129), 'r', 'k', 'w']), /check constraint|violates/i);
  });

  it('the migration is re-runnable and its rollback removes everything it created', async () => {
    await pool.query(readFileSync(MIGRATION, 'utf8')); // second application: no error, no data loss
    await pool.query('truncate public.worker_task_leases');
    await new PostgresLeaseStore(pool).acquire(key, 'worker-a', 30_000);
    await pool.query(readFileSync(MIGRATION, 'utf8'));
    const rows = await pool.query('select count(*)::int as n from public.worker_task_leases');
    assert.equal(rows.rows[0].n, 1, 're-applying must not clear leases');
    await pool.query(readFileSync(ROLLBACK, 'utf8'));
    const left = await pool.query("select to_regclass('public.worker_task_leases') as t, (select count(*) from pg_proc where proname like 'worker_lease_%')::int as f");
    assert.deepEqual(left.rows[0], { t: null, f: 0 });
    await pool.query(readFileSync(MIGRATION, 'utf8')); // and it can be applied again afterwards
  });
});
