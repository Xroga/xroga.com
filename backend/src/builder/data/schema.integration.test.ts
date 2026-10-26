import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import pg from 'pg';

import { PG_TEST_URL } from '../../storage/testing/pgFixture.js';
import { reviewMigration } from './review.js';
import { generateSchema, type SchemaArchetypeId } from './schema.js';

/**
 * The generated customer schemas applied to a REAL PostgreSQL (a disposable database with a
 * Supabase-shaped auth schema and roles), then attacked as the roles a browser would use. This is
 * database-level proof of the row-level security, grants and constraints; it is not a test against
 * a customer's live Supabase project.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const STUB = path.resolve(here, '../../storage/testing/supabaseStub.sql');
const skip = PG_TEST_URL ? false : 'STORAGE_TEST_DATABASE_URL not set: generated schemas are only exercised against a real PostgreSQL';

const ALICE = '11111111-1111-4111-8111-111111111111';
const BOB = '22222222-2222-4222-8222-222222222222';
const ADMIN = '33333333-3333-4333-8333-333333333333';

describe('generated customer schemas against real PostgreSQL', { skip }, () => {
  let pool: pg.Pool;
  let drop: () => Promise<void>;

  before(async () => {
    const admin = new pg.Client({ connectionString: PG_TEST_URL });
    await admin.connect();
    const name = `xroga_sch_${randomBytes(5).toString('hex')}`;
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
    await pool.query('insert into auth.users(id) values ($1),($2),($3)', [ALICE, BOB, ADMIN]);
  });
  after(async () => {
    await drop?.();
  });

  const apply = async (id: SchemaArchetypeId) => {
    const schema = generateSchema(id);
    assert.equal(reviewMigration(schema.sql).appliable, true);
    await pool.query(schema.sql);
    await pool.query(schema.sql); // idempotent: a second run changes nothing and does not fail
  };

  async function as<T>(userId: string | null, role: 'authenticated' | 'anon', fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(`set local role ${role}`);
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  const code = (expected: string) => (error: { code?: string }) => error.code === expected;
  const DENIED = '42501';

  it('applies cleanly and twice, and leaves no table without RLS and nothing readable by signed-out visitors', async () => {
    for (const id of ['tasks', 'booking', 'items'] as const) await apply(id);
    const noRls = await pool.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity");
    assert.deepEqual(noRls.rows, []);
    const anonGrants = await pool.query("select table_name, privilege_type from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','PUBLIC')");
    assert.deepEqual(anonGrants.rows, []);
    for (const table of ['tasks', 'items', 'profiles', 'services', 'slots', 'bookings']) {
      await assert.rejects(as(null, 'anon', (c) => c.query(`select * from public.${table}`)), code(DENIED), table);
    }
  });

  it('tasks: a user creates, reads, updates and deletes their own tasks and the data survives a new connection', async () => {
    const created = await as(ALICE, 'authenticated', (c) => c.query("insert into public.tasks(title) values ('Write report') returning id, owner_id, status"));
    assert.equal(created.rows[0].owner_id, ALICE, 'the database, not the app, binds the owner');
    assert.equal(created.rows[0].status, 'todo');
    const id = created.rows[0].id as string;
    await as(ALICE, 'authenticated', (c) => c.query("update public.tasks set status='done' where id=$1", [id]));
    const reread = await as(ALICE, 'authenticated', (c) => c.query('select status from public.tasks where id=$1', [id]));
    assert.equal(reread.rows[0].status, 'done');
    const touched = await pool.query('select updated_at > created_at as moved from public.tasks where id=$1', [id]);
    assert.equal(touched.rows[0].moved, true);
    await as(ALICE, 'authenticated', (c) => c.query('delete from public.tasks where id=$1', [id]));
    assert.equal((await as(ALICE, 'authenticated', (c) => c.query('select 1 from public.tasks where id=$1', [id]))).rowCount, 0);
  });

  it('tasks: two users never see or change each other\'s tasks, even by guessing ids or forging the owner', async () => {
    const alice = await as(ALICE, 'authenticated', (c) => c.query("insert into public.tasks(title) values ('Alice private') returning id"));
    const aliceId = alice.rows[0].id as string;
    assert.equal((await as(BOB, 'authenticated', (c) => c.query('select * from public.tasks'))).rows.filter((row) => row.id === aliceId).length, 0);
    assert.equal((await as(BOB, 'authenticated', (c) => c.query("update public.tasks set title='hacked' where id=$1", [aliceId]))).rowCount, 0);
    assert.equal((await as(BOB, 'authenticated', (c) => c.query('delete from public.tasks where id=$1', [aliceId]))).rowCount, 0);
    await assert.rejects(as(BOB, 'authenticated', (c) => c.query("insert into public.tasks(owner_id, title) values ($1, 'planted')", [ALICE])), code(DENIED));
    await assert.rejects(as(ALICE, 'authenticated', (c) => c.query('update public.tasks set owner_id=$1 where id=$2', [BOB, aliceId])), code(DENIED));
    const stillThere = await pool.query('select title from public.tasks where id=$1', [aliceId]);
    assert.equal(stillThere.rows[0].title, 'Alice private');
  });

  it('tasks: constraints reject invalid data', async () => {
    await assert.rejects(as(ALICE, 'authenticated', (c) => c.query("insert into public.tasks(title, status) values ('x','banana')")), code('23514'));
    await assert.rejects(as(ALICE, 'authenticated', (c) => c.query("insert into public.tasks(title) values ('')")), code('23514'));
    await assert.rejects(as(ALICE, 'authenticated', (c) => c.query('insert into public.tasks(title) values ($1)', ['x'.repeat(201)])), code('23514'));
  });

  describe('booking', () => {
    let serviceId: string;
    let slotId: string;
    before(async () => {
      await pool.query("insert into public.profiles(id, role) values ($1, 'admin')", [ADMIN]);
      serviceId = (await as(ADMIN, 'authenticated', (c) => c.query("insert into public.services(name, duration_minutes) values ('Check-up', 30) returning id"))).rows[0].id as string;
      slotId = (await as(ADMIN, 'authenticated', (c) => c.query("insert into public.slots(service_id, starts_at, ends_at) values ($1, '2030-01-01 10:00+00', '2030-01-01 10:30+00') returning id", [serviceId]))).rows[0].id as string;
    });

    it('lets customers read services and slots but not change them; only staff can', async () => {
      assert.ok((await as(ALICE, 'authenticated', (c) => c.query('select * from public.services'))).rowCount! >= 1);
      await assert.rejects(as(ALICE, 'authenticated', (c) => c.query("insert into public.services(name, duration_minutes) values ('Free', 5)")), code(DENIED));
      await assert.rejects(as(ALICE, 'authenticated', (c) => c.query("insert into public.slots(service_id, starts_at, ends_at) values ($1, '2030-01-02 10:00+00', '2030-01-02 10:30+00')", [serviceId])), code(DENIED));
      assert.equal((await as(ALICE, 'authenticated', (c) => c.query("update public.services set active=false where id=$1", [serviceId]))).rowCount, 0);
    });

    it('books a slot, and the DATABASE refuses a second confirmed booking for it', async () => {
      const first = await as(ALICE, 'authenticated', (c) => c.query('insert into public.bookings(slot_id) values ($1) returning id, customer_id, status', [slotId]));
      assert.equal(first.rows[0].customer_id, ALICE);
      await assert.rejects(as(BOB, 'authenticated', (c) => c.query('insert into public.bookings(slot_id) values ($1)', [slotId])), code('23505'));
      const racers = await Promise.allSettled(Array.from({ length: 6 }, () => as(BOB, 'authenticated', (c) => c.query('insert into public.bookings(slot_id) values ($1)', [slotId]))));
      assert.equal(racers.filter((r) => r.status === 'fulfilled').length, 0);
      await as(ALICE, 'authenticated', (c) => c.query("update public.bookings set status='cancelled' where id=$1", [first.rows[0].id]));
      const rebook = await as(BOB, 'authenticated', (c) => c.query('insert into public.bookings(slot_id) values ($1) returning id', [slotId]));
      assert.equal(rebook.rowCount, 1, 'a cancelled slot can be booked again');
      const confirmed = await pool.query("select count(*)::int as n from public.bookings where slot_id=$1 and status='confirmed'", [slotId]);
      assert.equal(confirmed.rows[0].n, 1);
    });

    it('under a concurrent race for a fresh slot exactly one customer wins', async () => {
      const slot = (await as(ADMIN, 'authenticated', (c) => c.query("insert into public.slots(service_id, starts_at, ends_at) values ($1, '2030-02-01 10:00+00', '2030-02-01 10:30+00') returning id", [serviceId]))).rows[0].id as string;
      const results = await Promise.allSettled([ALICE, BOB, ALICE, BOB, ALICE, BOB].map((user) => as(user, 'authenticated', (c) => c.query('insert into public.bookings(slot_id) values ($1)', [slot]))));
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    });

    it('keeps bookings private to their customer, visible to staff, and the booking itself unmovable', async () => {
      const mine = (await as(ALICE, 'authenticated', (c) => c.query('select customer_id from public.bookings'))).rows;
      assert.ok(mine.every((row) => row.customer_id === ALICE));
      const staff = (await as(ADMIN, 'authenticated', (c) => c.query('select distinct customer_id from public.bookings'))).rows.map((row) => row.customer_id);
      assert.ok(staff.includes(ALICE) && staff.includes(BOB));
      const bobBooking = (await pool.query("select id from public.bookings where customer_id=$1 limit 1", [BOB])).rows[0].id as string;
      assert.equal((await as(ALICE, 'authenticated', (c) => c.query("update public.bookings set status='cancelled' where id=$1", [bobBooking]))).rowCount, 0);
      await assert.rejects(as(BOB, 'authenticated', (c) => c.query('update public.bookings set slot_id=$1 where id=$2', [slotId, bobBooking])), code(DENIED));
      await assert.rejects(as(BOB, 'authenticated', (c) => c.query('update public.bookings set customer_id=$1 where id=$2', [ALICE, bobBooking])), code(DENIED));
      await assert.rejects(as(ALICE, 'authenticated', (c) => c.query('insert into public.bookings(customer_id, slot_id) values ($1, $2)', [BOB, slotId])), code(DENIED));
    });

    it('cannot be escalated: customers cannot write profiles or forge the admin check, and signed-out visitors cannot call it', async () => {
      await assert.rejects(as(ALICE, 'authenticated', (c) => c.query("insert into public.profiles(id, role) values ($1, 'admin') on conflict (id) do update set role='admin'", [ALICE])), code(DENIED));
      await assert.rejects(as(ALICE, 'authenticated', (c) => c.query("update public.profiles set role='admin' where id=$1", [ALICE])), code(DENIED));
      assert.equal((await as(ALICE, 'authenticated', (c) => c.query('select public.xroga_is_admin() as admin'))).rows[0].admin, false);
      assert.equal((await as(ADMIN, 'authenticated', (c) => c.query('select public.xroga_is_admin() as admin'))).rows[0].admin, true);
      await assert.rejects(as(null, 'anon', (c) => c.query('select public.xroga_is_admin()')), code(DENIED));
      const own = (await as(ALICE, 'authenticated', (c) => c.query('select id from public.profiles'))).rows;
      assert.ok(own.every((row) => row.id === ALICE));
    });
  });
});
