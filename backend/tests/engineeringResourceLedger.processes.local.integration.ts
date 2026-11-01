/**
 * Real operating-system processes against a real disposable PostgreSQL: concurrent workers racing for the same cap, and a worker killed with
 * SIGKILL while it holds a reservation. This proves the ledger's behaviour under process death; it is not a deployed Google worker test.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const url = process.env.XB01_LEDGER_TEST_DATABASE_URL ?? process.env.XB01_TENANT_TEST_DATABASE_URL;
if (process.env.XB01_DISPOSABLE_DATABASE !== '1' || !url) throw Error('Disposable ledger database required');
if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) throw Error('Only a loopback disposable database may be used');

const migration = readFileSync(new URL('../../supabase/migrations/20261029100000_engineering_resource_ledger.sql', import.meta.url), 'utf8');
const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 3000 });

before(async () => {
  await db.connect();
  await db.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN; END IF; END $$");
  // Both ledger test files may run at once against one database; serialize the DDL so IF NOT EXISTS cannot race itself.
  await db.query('SELECT pg_advisory_lock(847201901)');
  try {
    await db.query(migration);
  } finally { await db.query('SELECT pg_advisory_unlock(847201901)'); }
});
after(async () => { await db.end(); });

/** A worker process: reserve, print the outcome, then either exit or hold (as if working) until killed. */
const worker = `
import pg from 'pg';
const [user, run, key, units, cap, hold] = process.argv.slice(1);
const c = new pg.Client({ connectionString: process.env.LEDGER_URL });
await c.connect();
const r = await c.query('SELECT public.reserve_engineering_resource($1,$2,$3,$4,$5,$6,$7::interval) AS r', [user, run, 'sandbox_compute_seconds', Number(units), key, Number(cap), '1 day']);
console.log(JSON.stringify(r.rows[0].r));
if (hold === 'hold') setInterval(() => {}, 1000); else await c.end();
`;

function spawnWorker(args: string[]) {
  const child = spawn(process.execPath, ['--input-type=module', '-e', worker, ...args], { env: { ...process.env, LEDGER_URL: url }, stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() });
  const first = new Promise<{ state: string; reservationId?: string }>((resolve, reject) => {
    let out = ''; child.stdout.on('data', (d) => { out += String(d); const line = out.split('\n')[0]; if (line) { try { resolve(JSON.parse(line)); } catch { /* wait for the full line */ } } });
    child.on('error', reject);
    child.on('close', (code) => { if (!out) reject(new Error(`worker exited ${code} without answering`)); });
  });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));
  return { child, first, closed };
}

test('six real worker processes racing for a cap that fits two: exactly two win', async () => {
  const user = randomUUID(); const run = randomUUID();
  const workers = Array.from({ length: 6 }, (_, i) => spawnWorker([user, run, `proc-race-${i}-key`, '100', '200', 'exit']));
  const answers = await Promise.all(workers.map((w) => w.first));
  assert.equal(answers.filter((a) => a.state === 'reserved').length, 2);
  assert.equal(answers.filter((a) => a.state === 'exhausted').length, 4);
  await Promise.all(workers.map((w) => w.closed));
  assert.equal(Number((await db.query('SELECT count(*) c FROM public.engineering_resource_reservations WHERE user_id=$1', [user])).rows[0].c), 2);
});

test('a worker killed with SIGKILL while holding a reservation leaks a visible hold that blocks capacity until swept, then is charged in full', async () => {
  const user = randomUUID(); const run = randomUUID();
  const w = spawnWorker([user, run, 'proc-kill-key', '600', '1000', 'hold']);
  const answer = await w.first;
  assert.equal(answer.state, 'reserved');
  w.child.kill('SIGKILL');
  const result = await w.closed;
  assert.equal(result.signal, 'SIGKILL', 'the worker really died by SIGKILL, with no chance to settle');
  // the crash left the hold in place, and it is visible rather than silently gone
  assert.equal((await db.query('SELECT state FROM public.engineering_resource_reservations WHERE id=$1', [answer.reservationId])).rows[0].state, 'reserved');
  // ... and it keeps counting against the owner, so a replacement worker cannot overspend while it exists
  const blocked = await db.query("SELECT public.reserve_engineering_resource($1,$2,'sandbox_compute_seconds',600,'proc-kill-next',1000,'1 day') r", [user, run]);
  assert.equal(blocked.rows[0].r.state, 'exhausted');
  // the sweep charges it in full, the usage stays accounted for, and nothing is double counted
  await db.query("UPDATE public.engineering_resource_reservations SET created_at = clock_timestamp() - interval '2 hours' WHERE id=$1", [answer.reservationId]);
  assert.equal(Number((await db.query("SELECT public.sweep_stale_engineering_reservations('1 hour') n")).rows[0].n) >= 1, true);
  const row = (await db.query('SELECT state, settled_units, note FROM public.engineering_resource_reservations WHERE id=$1', [answer.reservationId])).rows[0];
  assert.deepEqual([row.state, Number(row.settled_units), row.note], ['settled', 600, 'swept_unsettled']);
  assert.equal(Number((await db.query("SELECT public.engineering_resource_used($1,'sandbox_compute_seconds','1 day') u", [user])).rows[0].u), 600);
  // a worker that comes back and settles the same reservation changes nothing
  assert.equal((await db.query('SELECT public.settle_engineering_resource($1,$2,$3) r', [user, answer.reservationId, 50])).rows[0].r.state, 'already_settled');
});

test('a redelivered request from a new process after the first one died is the same reservation, not a second hold', async () => {
  const user = randomUUID(); const run = randomUUID();
  const first = spawnWorker([user, run, 'proc-redeliver-key', '100', '1000', 'hold']);
  const a = await first.first;
  first.child.kill('SIGKILL'); await first.closed;
  const second = spawnWorker([user, run, 'proc-redeliver-key', '100', '1000', 'exit']);
  const b = await second.first;
  assert.equal(b.state, 'duplicate'); assert.equal(b.reservationId, a.reservationId);
  await second.closed;
});
