/**
 * Real disposable PostgreSQL for the operator diagnostics function, built from the real delivery, fencing, cancellation, ledger and diagnostics
 * migrations. Each stalled state is seeded on purpose and the report is checked for exact counts, for the samples, for not exposing run content, and
 * for being unreachable by anonymous and signed-in roles. Not a live Supabase receipt.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const adminUrl = process.env.XB01_DIAGNOSTICS_TEST_DATABASE_URL ?? process.env.XB01_TENANT_TEST_DATABASE_URL;
if (process.env.XB01_DISPOSABLE_DATABASE !== '1' || !adminUrl) throw Error('Disposable diagnostics database required');
if (!['127.0.0.1', 'localhost'].includes(new URL(adminUrl).hostname)) throw Error('Only a loopback disposable database may be used');

const dbName = `b4_diag_${randomBytes(4).toString('hex')}`;
const url = (() => { const u = new URL(adminUrl); u.pathname = `/${dbName}`; return u.toString(); })();
const mig = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const OWNER = '33333333-3333-4333-8333-333333333333';
const SOURCE = 'b'.repeat(40);
const id = (n: number) => `${n.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
const CANARY = 'SECRET_PROMPT_CANARY_DO_NOT_REPORT';

const BOOTSTRAP = `
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS auth; CREATE TABLE auth.users(id UUID PRIMARY KEY);
CREATE TABLE public.projects(id UUID PRIMARY KEY,user_id UUID REFERENCES auth.users(id));
CREATE TABLE public.swarm_runs(id UUID PRIMARY KEY,user_id UUID NOT NULL REFERENCES auth.users(id),
 project_id UUID REFERENCES public.projects(id),prompt TEXT NOT NULL,status TEXT, current_agent TEXT,
 iteration_count INTEGER DEFAULT 0,defects_found INTEGER DEFAULT 0,output JSONB,error TEXT,
 created_at TIMESTAMPTZ DEFAULT now(),completed_at TIMESTAMPTZ,messages JSONB,feature_category TEXT,
 token_usage JSONB,events JSONB NOT NULL DEFAULT '[]',last_sequence BIGINT NOT NULL DEFAULT 0,
 worker_id TEXT,heartbeat_at TIMESTAMPTZ,lease_generation UUID);
ALTER TABLE public.swarm_runs ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON public.swarm_runs,public.projects TO service_role;
INSERT INTO auth.users VALUES ('${OWNER}');`;

const admin = new pg.Client({ connectionString: adminUrl });
const db = new pg.Client({ connectionString: url });
const minutesAgo = (m: number) => `clock_timestamp() - interval '${m} minutes'`;

before(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName}`);
  await db.connect();
  await db.query(BOOTSTRAP);
  await db.query(mig('20261015000300_swarm_run_attempt_fencing.sql'));
  await db.query(mig('20261016000600_cancelled_build_outcome_receipt.sql').split('-- This distinct receipt boundary')[0]!);
  await db.query(mig('20261026000000_google_canonical_deliveries.sql'));
  await db.query(mig('20261029100000_engineering_resource_ledger.sql'));
  await db.query(mig('20261029110000_engineering_operator_diagnostics.sql'));
  await db.query(mig('20261029110000_engineering_operator_diagnostics.sql')); // applying it twice must not fail
});
after(async () => {
  await db.end().catch(() => undefined);
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
  await admin.end().catch(() => undefined);
});

const enqueue = async (n: number) => db.query(`SELECT public.enqueue_google_canonical_run('${id(n)}','${id(100 + n)}','${OWNER}',NULL,'{"prompt":"${CANARY}"}','${SOURCE}')`);
const diagnostics = async () => (await db.query("SELECT public.engineering_diagnostics('60 minutes','5 minutes','2 hours') AS r")).rows[0].r;

test('an empty system reports zeros, not an error', async () => {
  const d = await diagnostics();
  assert.equal(d.runs.queuedWaiting, 0); assert.equal(d.deliveries.pending, 0); assert.equal(d.reservations.open, 0);
  assert.deepEqual(d.samples.staleWorkerRunIds, []);
});

test('each stalled state is counted exactly, with samples, and nothing about the run content is reported', async () => {
  await enqueue(1); await enqueue(2); await enqueue(3);
  // 1: a request waiting 10 minutes for capacity. 2: launching with an expired lease and a 90 minute wait. 3: pending at the 5 attempt ceiling.
  await db.query(`UPDATE public.swarm_runs SET heartbeat_at = ${minutesAgo(10)} WHERE id = $1`, [id(101)]);
  await db.query(`UPDATE public.swarm_runs SET heartbeat_at = ${minutesAgo(90)} WHERE id = $1`, [id(102)]);
  await db.query(`UPDATE public.google_canonical_deliveries SET state='launching', launch_lease_until = ${minutesAgo(1)} WHERE id = $1`, [id(2)]);
  await db.query('UPDATE public.google_canonical_deliveries SET launch_attempts = 5 WHERE id = $1', [id(3)]);
  // a worker-held run gone stale, a legacy run with no heartbeat, and a finished run that must not count
  await db.query(`INSERT INTO public.swarm_runs(id,user_id,prompt,status,worker_id,lease_generation,heartbeat_at) VALUES ($1,$2,$3,'running','w-1',$4,${minutesAgo(10)})`, [id(204), OWNER, CANARY, id(404)]);
  await db.query('INSERT INTO public.swarm_runs(id,user_id,prompt,status) VALUES ($1,$2,$3,$4)', [id(205), OWNER, CANARY, 'running']);
  await db.query(`INSERT INTO public.swarm_runs(id,user_id,prompt,status,heartbeat_at) VALUES ($1,$2,$3,'complete',${minutesAgo(500)})`, [id(206), OWNER, CANARY]);

  const d = await diagnostics();
  assert.equal(d.runs.queuedWaiting, 3, 'runs 101, 102 and 103 are admitted and unclaimed');
  assert.equal(d.runs.queuedPastWait, 1, 'only run 102 has waited past the 60 minute bound');
  assert.ok(d.runs.queuedOldestSeconds >= 90 * 60 - 5, 'the oldest wait is reported in seconds');
  assert.equal(d.runs.staleWorkerRuns, 1); assert.equal(d.runs.runningWithoutHeartbeat, 1, 'the finished run counts nowhere');
  assert.equal(d.deliveries.pending, 2); assert.equal(d.deliveries.launchingLeaseExpired, 1); assert.equal(d.deliveries.atAttemptCeiling, 1); assert.equal(d.deliveries.running, 0);
  assert.deepEqual(d.samples.queuedPastWaitRunIds, [id(102)]);
  assert.deepEqual(d.samples.staleWorkerRunIds, [id(204)]);
  assert.deepEqual(d.samples.launchingExpiredDeliveryIds, [id(2)]);
  assert.doesNotMatch(JSON.stringify(d), new RegExp(CANARY), 'a prompt never appears in the report');
  const reported = JSON.stringify(d);
  assert.ok(!reported.includes('w-1') && !reported.includes(id(404)), 'neither does a worker id or a lease generation');
});

test('open and stale reservations, overruns and sweeps are reported', async () => {
  const user = OWNER;
  const reserve = async (key: string, units: number) => (await db.query("SELECT public.reserve_engineering_resource($1,$2,'sandbox_compute_seconds',$3,$4,1000000,'1 day') AS r", [user, id(150), units, key])).rows[0].r.reservationId as string;
  const fresh = await reserve('diag-fresh-0001', 100);
  const stale = await reserve('diag-stale-0001', 100);
  const over = await reserve('diag-over-00001', 100);
  await db.query(`UPDATE public.engineering_resource_reservations SET created_at = ${minutesAgo(180)} WHERE id = $1`, [stale]);
  await db.query('SELECT public.settle_engineering_resource($1,$2,$3)', [user, over, 250]);
  let d = await diagnostics();
  assert.equal(d.reservations.open, 2); assert.equal(d.reservations.openOlderThanStale, 1); assert.equal(d.reservations.overrunsLast24h, 1);
  assert.deepEqual(d.samples.openStaleReservationIds, [stale]);
  assert.ok(d.reservations.oldestOpenSeconds >= 180 * 60 - 5);
  await db.query("SELECT public.sweep_stale_engineering_reservations('1 hour')");
  d = await diagnostics();
  assert.equal(d.reservations.open, 1, 'only the fresh hold is still open'); assert.equal(d.reservations.openOlderThanStale, 0); assert.equal(d.reservations.sweptLast24h, 1);
  assert.ok(fresh);
});

test('per-tenant limits can be listed, and invalid thresholds fail closed', async () => {
  await db.query('SELECT public.set_engineering_resource_limit($1,$2,$3)', [OWNER, 'storage_bytes', 777]);
  const listed = (await db.query('SELECT public.list_engineering_resource_limits($1) AS r', [OWNER])).rows[0].r;
  assert.equal(listed.length, 1); assert.equal(listed[0].category, 'storage_bytes'); assert.equal(Number(listed[0].cap), 777);
  assert.deepEqual((await db.query('SELECT public.list_engineering_resource_limits($1) AS r', [id(999)])).rows[0].r, []);
  await assert.rejects(db.query("SELECT public.engineering_diagnostics('10 seconds','5 minutes','2 hours')"), /DIAGNOSTICS_INVALID/);
  await assert.rejects(db.query("SELECT public.engineering_diagnostics(NULL,'5 minutes','2 hours')"), /DIAGNOSTICS_INVALID/);
});

test('the diagnostics functions are not reachable by anonymous or signed-in roles, and the service role can run them', async () => {
  for (const role of ['anon', 'authenticated']) {
    const r = (await db.query("SELECT has_function_privilege($1,'public.engineering_diagnostics(interval,interval,interval)','EXECUTE') d, has_function_privilege($1,'public.list_engineering_resource_limits(uuid)','EXECUTE') l", [role])).rows[0];
    assert.deepEqual([r.d, r.l], [false, false], `${role} cannot run diagnostics`);
  }
  const svc = (await db.query("SELECT has_function_privilege('service_role','public.engineering_diagnostics(interval,interval,interval)','EXECUTE') d")).rows[0];
  assert.equal(svc.d, true, 'positive control');
});
