/** Real disposable PostgreSQL for the engineering resource ledger migration. Not a live Supabase deployment receipt. */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = process.env.XB01_LEDGER_TEST_DATABASE_URL ?? process.env.XB01_TENANT_TEST_DATABASE_URL;
if (process.env.XB01_DISPOSABLE_DATABASE !== '1' || !url) throw Error('Disposable ledger database required');
const target = new URL(url);
if (!['127.0.0.1', 'localhost'].includes(target.hostname)) throw Error('Only a loopback disposable database may be used');

const migration = readFileSync(new URL('../../supabase/migrations/20261029100000_engineering_resource_ledger.sql', import.meta.url), 'utf8');
const owner = randomUUID(); const other = randomUUID();
const connect = async () => { const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 }); await c.connect(); return c; };
const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });
const DAY = '1 day';

async function reserve(client: pg.Client, user: string, run: string, category: string, units: number, key: string, cap: number) {
  const r = await client.query('SELECT public.reserve_engineering_resource($1,$2,$3,$4,$5,$6,$7::interval) AS r', [user, run, category, units, key, cap, DAY]);
  return r.rows[0].r as { state: string; reservationId?: string; used?: number; ledgerState?: string };
}

before(async () => {
  await db.connect();
  await db.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$");
  // Both ledger test files may run at once against one database; serialize the DDL so IF NOT EXISTS cannot race itself.
  await db.query('SELECT pg_advisory_lock(847201901)');
  try {
    await db.query(migration);
    await db.query(migration); // idempotent: applying it twice must not fail
  } finally { await db.query('SELECT pg_advisory_unlock(847201901)'); }
});
after(async () => { await db.end(); });

test('reserve, settle exactly once with measured units, and a second settle changes nothing', async () => {
  const run = randomUUID();
  const r = await reserve(db, owner, run, 'sandbox_compute_seconds', 600, 'attempt-0001', 10_000);
  assert.equal(r.state, 'reserved'); assert.ok(r.reservationId);
  const first = (await db.query('SELECT public.settle_engineering_resource($1,$2,$3,$4) AS r', [owner, r.reservationId, 240, 'vm-1'])).rows[0].r;
  assert.equal(first.state, 'settled'); assert.equal(first.overrun, false);
  const again = (await db.query('SELECT public.settle_engineering_resource($1,$2,$3,$4) AS r', [owner, r.reservationId, 9999, 'vm-1'])).rows[0].r;
  assert.equal(again.state, 'already_settled'); assert.equal(Number(again.settledUnits), 240, 'a repeated settle can neither double count nor change the amount');
  const row = (await db.query('SELECT state, settled_units FROM public.engineering_resource_reservations WHERE id=$1', [r.reservationId])).rows[0];
  assert.equal(row.state, 'settled'); assert.equal(Number(row.settled_units), 240);
});

test('a redelivered reservation request is a duplicate, not a second hold', async () => {
  const run = randomUUID();
  const a = await reserve(db, owner, run, 'browser_session_seconds', 100, 'redelivery-1', 10_000);
  const b = await reserve(db, owner, run, 'browser_session_seconds', 100, 'redelivery-1', 10_000);
  assert.equal(a.state, 'reserved'); assert.equal(b.state, 'duplicate'); assert.equal(b.reservationId, a.reservationId);
  assert.equal(Number((await db.query('SELECT count(*) c FROM public.engineering_resource_reservations WHERE run_id=$1', [run])).rows[0].c), 1);
});

test('the cap is enforced per owner and category, and settled actuals replace the held amount', async () => {
  const user = randomUUID(); const run = randomUUID();
  const a = await reserve(db, user, run, 'storage_bytes', 600, 'cap-aaaa-1', 1000);
  assert.equal(a.state, 'reserved');
  assert.equal((await reserve(db, user, run, 'storage_bytes', 500, 'cap-aaaa-2', 1000)).state, 'exhausted', '600 + 500 exceeds 1000');
  assert.equal((await reserve(db, user, run, 'sandbox_compute_seconds', 500, 'cap-aaaa-3', 1000)).state, 'reserved', 'another category has its own allowance');
  assert.equal((await reserve(db, randomUUID(), run, 'storage_bytes', 900, 'cap-aaaa-4', 1000)).state, 'reserved', 'another owner has their own allowance');
  await db.query('SELECT public.settle_engineering_resource($1,$2,$3)', [user, a.reservationId, 100]);
  assert.equal((await reserve(db, user, run, 'storage_bytes', 500, 'cap-aaaa-5', 1000)).state, 'reserved', 'only 100 was actually used, so room is available again');
});

test('concurrent reservations at the cap: exactly as many succeed as fit, never more', async () => {
  const user = randomUUID(); const run = randomUUID();
  const clients = await Promise.all(Array.from({ length: 12 }, connect));
  try {
    const results = await Promise.all(clients.map((c, i) => reserve(c, user, run, 'sandbox_compute_seconds', 100, `race-key-${i}`, 500)));
    const won = results.filter((r) => r.state === 'reserved').length;
    assert.equal(won, 5, 'a cap of 500 fits exactly five holds of 100');
    assert.equal(results.filter((r) => r.state === 'exhausted').length, 7);
    assert.equal(Number((await db.query('SELECT public.engineering_resource_used($1,$2,$3::interval) u', [user, 'sandbox_compute_seconds', DAY])).rows[0].u), 500);
  } finally { await Promise.all(clients.map((c) => c.end())); }
});

test('a released hold frees capacity and can no longer be settled; settling a settled hold is not a release', async () => {
  const user = randomUUID(); const run = randomUUID();
  const a = await reserve(db, user, run, 'browser_session_seconds', 800, 'release-aaa-1', 1000);
  assert.equal((await db.query('SELECT public.release_engineering_resource($1,$2) r', [user, a.reservationId])).rows[0].r.state, 'released');
  assert.equal((await db.query('SELECT public.settle_engineering_resource($1,$2,$3) r', [user, a.reservationId, 50])).rows[0].r.state, 'released');
  assert.equal((await reserve(db, user, run, 'browser_session_seconds', 800, 'release-aaa-2', 1000)).state, 'reserved');
  const b = await reserve(db, user, run, 'browser_session_seconds', 100, 'release-aaa-3', 1000);
  await db.query('SELECT public.settle_engineering_resource($1,$2,$3)', [user, b.reservationId, 90]);
  assert.equal((await db.query('SELECT public.release_engineering_resource($1,$2) r', [user, b.reservationId])).rows[0].r.state, 'settled');
});

test('another owner cannot settle, release or re-reserve against someone else\'s reservation', async () => {
  const run = randomUUID();
  const a = await reserve(db, owner, run, 'storage_bytes', 10, 'foreign-aaa-1', 1000);
  await assert.rejects(db.query('SELECT public.settle_engineering_resource($1,$2,$3)', [other, a.reservationId, 5]), /RESOURCE_NOT_FOUND/);
  await assert.rejects(db.query('SELECT public.release_engineering_resource($1,$2)', [other, a.reservationId]), /RESOURCE_NOT_FOUND/);
  await assert.rejects(reserve(db, other, run, 'storage_bytes', 10, 'foreign-aaa-1', 1000), /RESOURCE_NOT_FOUND/);
});

test('an actual above the held amount is recorded as an overrun, not hidden', async () => {
  const run = randomUUID();
  const a = await reserve(db, owner, run, 'sandbox_compute_seconds', 100, 'overrun-aaa-1', 10_000);
  const settled = (await db.query('SELECT public.settle_engineering_resource($1,$2,$3) r', [owner, a.reservationId, 180])).rows[0].r;
  assert.equal(settled.overrun, true);
  assert.equal((await db.query('SELECT note FROM public.engineering_resource_reservations WHERE id=$1', [a.reservationId])).rows[0].note, 'overrun');
});

test('a crashed worker\'s unsettled hold is charged in full by the sweep, never dropped, and the sweep is repeatable', async () => {
  const user = randomUUID(); const run = randomUUID();
  const a = await reserve(db, user, run, 'sandbox_compute_seconds', 300, 'sweep-aaaa-1', 10_000);
  await db.query("UPDATE public.engineering_resource_reservations SET created_at = clock_timestamp() - interval '3 hours' WHERE id=$1", [a.reservationId]);
  const swept = Number((await db.query("SELECT public.sweep_stale_engineering_reservations('1 hour') n")).rows[0].n);
  assert.ok(swept >= 1);
  const row = (await db.query('SELECT state, settled_units, note FROM public.engineering_resource_reservations WHERE id=$1', [a.reservationId])).rows[0];
  assert.equal(row.state, 'settled'); assert.equal(Number(row.settled_units), 300); assert.equal(row.note, 'swept_unsettled');
  assert.equal(Number((await db.query("SELECT public.sweep_stale_engineering_reservations('1 hour') n")).rows[0].n), 0, 'a second sweep finds nothing');
  const fresh = await reserve(db, user, run, 'sandbox_compute_seconds', 50, 'sweep-aaaa-2', 10_000);
  assert.equal((await db.query("SELECT public.sweep_stale_engineering_reservations('1 hour') n")).rows[0].n, 0);
  assert.equal((await db.query('SELECT state FROM public.engineering_resource_reservations WHERE id=$1', [fresh.reservationId])).rows[0].state, 'reserved', 'a recent hold is left alone');
});

test('invalid requests fail closed', async () => {
  const run = randomUUID();
  for (const [units, key, cap] of [[0, 'invalid-aaa-1', 100], [-5, 'invalid-aaa-2', 100], [5, 'invalid-aaa-3', 0]] as const) {
    await assert.rejects(reserve(db, owner, run, 'sandbox_compute_seconds', units, key, cap), /RESOURCE_INVALID/);
  }
  await assert.rejects(db.query('SELECT public.reserve_engineering_resource($1,$2,$3,$4,$5,$6,$7::interval)', [owner, run, 'sandbox_compute_seconds', 5, 'invalid-aaa-4', 100, '90 days']), /RESOURCE_INVALID/);
  await assert.rejects(db.query('SELECT public.reserve_engineering_resource($1,$2,$3,$4,$5,$6,$7::interval)', [owner, run, 'gpu_seconds', 5, 'invalid-aaa-5', 100, DAY]), /category|check/i);
  await assert.rejects(db.query('SELECT public.reserve_engineering_resource($1,$2,$3,$4,$5,$6,$7::interval)', [owner, run, 'storage_bytes', 5, 'short', 100, DAY]), /idempotency_key|check/i);
});

test('the table and functions are not reachable by anonymous or signed-in roles', async () => {
  for (const role of ['anon', 'authenticated']) {
    const allowed = (await db.query("SELECT has_table_privilege($1,'public.engineering_resource_reservations','SELECT') s, has_function_privilege($1,'public.reserve_engineering_resource(uuid,uuid,text,numeric,text,numeric,interval)','EXECUTE') e", [role])).rows[0];
    assert.equal(allowed.s, false, `${role} cannot read the ledger`); assert.equal(allowed.e, false, `${role} cannot reserve`);
  }
  const svc = (await db.query("SELECT has_function_privilege('service_role','public.reserve_engineering_resource(uuid,uuid,text,numeric,text,numeric,interval)','EXECUTE') e")).rows[0];
  assert.equal(svc.e, true, 'positive control: the service role can reserve');
  assert.equal((await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.engineering_resource_reservations'::regclass")).rows[0].relrowsecurity, true);
});

const setLimit = (user: string, category: string, cap: number) => db.query('SELECT public.set_engineering_resource_limit($1,$2,$3) AS r', [user, category, cap]);

test('a per-tenant cap override replaces the default for that owner only, applies even where the default is record-only, and clearing it reverts', async () => {
  const limited = randomUUID(); const other = randomUUID(); const run = randomUUID();
  const HUGE = 1e15; // what a record-only category passes as its default
  assert.equal((await reserve(db, limited, run, 'sandbox_compute_seconds', 400, 'override-aaa-1', HUGE)).state, 'reserved', 'no override: record-only default allows it');
  await setLimit(limited, 'sandbox_compute_seconds', 500);
  const refused = await reserve(db, limited, run, 'sandbox_compute_seconds', 200, 'override-aaa-2', HUGE) as unknown as { state: string; cap: number; capSource: string };
  assert.equal(refused.state, 'exhausted'); assert.equal(Number(refused.cap), 500); assert.equal(refused.capSource, 'tenant_override', 'the answer says which cap refused it');
  assert.equal((await reserve(db, other, run, 'sandbox_compute_seconds', 200, 'override-aaa-3', HUGE)).state, 'reserved', 'another owner is untouched by the override');
  assert.equal((await reserve(db, limited, run, 'browser_session_seconds', 200, 'override-aaa-4', HUGE)).state, 'reserved', 'so is another category of the same owner');
  await setLimit(limited, 'sandbox_compute_seconds', 5000);
  assert.equal((await reserve(db, limited, run, 'sandbox_compute_seconds', 200, 'override-aaa-5', 100)).state, 'reserved', 'an override can raise the cap above a low default');
  const cleared = (await db.query('SELECT public.clear_engineering_resource_limit($1,$2) AS r', [limited, 'sandbox_compute_seconds'])).rows[0].r;
  assert.equal(cleared.state, 'cleared');
  assert.equal((await db.query('SELECT public.clear_engineering_resource_limit($1,$2) AS r', [limited, 'sandbox_compute_seconds'])).rows[0].r.state, 'absent');
  const back = await reserve(db, limited, run, 'sandbox_compute_seconds', 200, 'override-aaa-6', 100) as unknown as { state: string; capSource: string };
  assert.equal(back.state, 'exhausted'); assert.equal(back.capSource, 'default', 'cleared: the caller-supplied default applies again');
});

test('invalid limit overrides fail closed', async () => {
  for (const [category, cap] of [['sandbox_compute_seconds', 0], ['sandbox_compute_seconds', -5]] as const) {
    await assert.rejects(setLimit(randomUUID(), category, cap), /RESOURCE_INVALID/);
  }
  await assert.rejects(setLimit(randomUUID(), 'gpu_seconds', 10), /category|check/i);
});

test('retention purges old settled and released rows, never an open hold, and never a period shorter than a day', async () => {
  const user = randomUUID(); const run = randomUUID();
  const old = (await reserve(db, user, run, 'storage_bytes', 10, 'purge-aaaa-1', 1e9)).reservationId!;
  const oldReleased = (await reserve(db, user, run, 'storage_bytes', 10, 'purge-aaaa-2', 1e9)).reservationId!;
  const oldOpen = (await reserve(db, user, run, 'storage_bytes', 10, 'purge-aaaa-3', 1e9)).reservationId!;
  const recent = (await reserve(db, user, run, 'storage_bytes', 10, 'purge-aaaa-4', 1e9)).reservationId!;
  await db.query('SELECT public.settle_engineering_resource($1,$2,$3)', [user, old, 10]);
  await db.query('SELECT public.release_engineering_resource($1,$2)', [user, oldReleased]);
  await db.query('SELECT public.settle_engineering_resource($1,$2,$3)', [user, recent, 10]);
  await db.query("UPDATE public.engineering_resource_reservations SET created_at = clock_timestamp() - interval '40 days', settled_at = CASE WHEN settled_at IS NULL THEN NULL ELSE clock_timestamp() - interval '40 days' END WHERE id = ANY($1::uuid[])", [[old, oldReleased, oldOpen]]);
  await assert.rejects(db.query("SELECT public.purge_engineering_reservations('1 hour')"), /RESOURCE_INVALID/);
  const purged = Number((await db.query("SELECT public.purge_engineering_reservations('30 days') AS n")).rows[0].n);
  assert.ok(purged >= 2, 'the old settled and the old released row are removed');
  const left = new Set((await db.query('SELECT id FROM public.engineering_resource_reservations WHERE id = ANY($1::uuid[])', [[old, oldReleased, oldOpen, recent]])).rows.map((r) => r.id));
  assert.equal(left.has(old), false); assert.equal(left.has(oldReleased), false);
  assert.equal(left.has(oldOpen), true, 'an open hold, however old, is never purged');
  assert.equal(left.has(recent), true, 'a recent settled row is kept');
  assert.equal(Number((await db.query("SELECT public.purge_engineering_reservations('30 days') AS n")).rows[0].n), 0, 'repeatable');
});

test('the limits table and the new functions are not reachable by anonymous or signed-in roles', async () => {
  for (const role of ['anon', 'authenticated']) {
    const r = (await db.query("SELECT has_table_privilege($1,'public.engineering_resource_limits','SELECT') t, has_function_privilege($1,'public.set_engineering_resource_limit(uuid,text,numeric)','EXECUTE') s, has_function_privilege($1,'public.clear_engineering_resource_limit(uuid,text)','EXECUTE') c, has_function_privilege($1,'public.purge_engineering_reservations(interval)','EXECUTE') p", [role])).rows[0];
    assert.deepEqual([r.t, r.s, r.c, r.p], [false, false, false, false], `${role} has no access`);
  }
  const svc = (await db.query("SELECT has_function_privilege('service_role','public.set_engineering_resource_limit(uuid,text,numeric)','EXECUTE') s, relrowsecurity FROM pg_class WHERE oid='public.engineering_resource_limits'::regclass")).rows[0];
  assert.equal(svc.s, true, 'positive control'); assert.equal(svc.relrowsecurity, true);
});
