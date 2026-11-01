/**
 * Real operating-system processes against a real disposable PostgreSQL built from the real delivery, attempt-fencing and cancellation migrations.
 * A dispatcher and a worker are killed with SIGKILL at the moments that matter, and the database state machine must keep exactly one winner, deny the
 * dead process's late writes and never run the work twice. It exercises the SQL contract that the Cloud Run dispatcher and worker use. It is not a
 * deployed Google worker, Cloud Tasks or Cloud Run test, and the orphan reconciliation step is the same UPDATE the TypeScript reconciler issues.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import pg from 'pg';

const adminUrl = process.env.XB01_DELIVERY_TEST_DATABASE_URL ?? process.env.XB01_TENANT_TEST_DATABASE_URL;
if (process.env.XB01_DISPOSABLE_DATABASE !== '1' || !adminUrl) throw Error('Disposable delivery database required');
if (!['127.0.0.1', 'localhost'].includes(new URL(adminUrl).hostname)) throw Error('Only a loopback disposable database may be used');

const dbName = `b4_delivery_${randomBytes(4).toString('hex')}`;
const url = (() => { const u = new URL(adminUrl); u.pathname = `/${dbName}`; return u.toString(); })();
const mig = (name: string) => readFileSync(new URL(`../../supabase/migrations/${name}`, import.meta.url), 'utf8');

const OWNER = '33333333-3333-4333-8333-333333333333';
const SOURCE = 'b'.repeat(40);
const id = (n: number) => `${n.toString(16).padStart(8, '0')}-1111-4111-8111-111111111111`;
const PAYLOAD = JSON.stringify({ prompt: 'synthetic' });

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

before(async () => {
  await admin.connect();
  await admin.query(`CREATE DATABASE ${dbName}`);
  await db.connect();
  await db.query(BOOTSTRAP);
  await db.query(mig('20261015000300_swarm_run_attempt_fencing.sql'));
  await db.query(mig('20261016000600_cancelled_build_outcome_receipt.sql').split('-- This distinct receipt boundary')[0]!);
  await db.query(mig('20261026000000_google_canonical_deliveries.sql'));
});
after(async () => {
  await db.end().catch(() => undefined);
  await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`).catch(() => undefined);
  await admin.end().catch(() => undefined);
});

const svc = async <T = unknown>(sql: string): Promise<T> => {
  await db.query('SET ROLE service_role');
  try { return (await db.query(sql)).rows[0] as T; } finally { await db.query('RESET ROLE'); }
};
const enqueue = (n: number, extra = '') => `SELECT public.enqueue_google_canonical_run('${id(n)}','${id(100 + n)}','${OWNER}',NULL,'${PAYLOAD.replace('}', extra + '}')}','${SOURCE}') AS r`;
const reserveSql = (n: number, token: string) => `SELECT public.reserve_google_canonical_launch('${id(n)}','${SOURCE}','${token}') AS r`;
const claimSql = (n: number, worker: string, generation: string) => `SELECT public.claim_google_canonical_run('${id(n)}','${SOURCE}','${worker}','${generation}') AS r`;

/** A child process that connects as the service role, runs one statement, prints the answer and either exits or holds until killed. */
const childScript = `
import pg from 'pg';
const [sql, mode] = process.argv.slice(1);
const c = new pg.Client({ connectionString: process.env.DELIVERY_URL });
await c.connect(); await c.query('SET ROLE service_role');
const r = await c.query(sql);
console.log(JSON.stringify(r.rows[0]?.r ?? null));
if (mode === 'hold') setInterval(() => {}, 1000); else await c.end();
`;
function child(sql: string, mode: 'hold' | 'exit') {
  const proc = spawn(process.execPath, ['--input-type=module', '-e', childScript, sql, mode], { env: { ...process.env, DELIVERY_URL: url }, stdio: ['ignore', 'pipe', 'pipe'], cwd: process.cwd() });
  const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => proc.on('close', (code, signal) => resolve({ code, signal })));
  const answer = new Promise<Record<string, unknown> | null>((resolve, reject) => {
    let out = ''; proc.stdout.on('data', (d) => { out += String(d); const line = out.split('\n')[0]; if (line) { try { resolve(JSON.parse(line)); } catch { /* wait for the whole line */ } } });
    proc.stderr.on('data', (d) => { out += ''; void d; });
    proc.on('close', (code) => { if (!out) reject(new Error(`child exited ${code} without answering`)); });
  });
  return { proc, answer, closed, kill: async () => { proc.kill('SIGKILL'); const r = await closed; assert.equal(r.signal, 'SIGKILL', 'the process really died by SIGKILL'); } };
}
const deliveryRow = async (n: number) => (await db.query('SELECT state, launch_attempts, launch_token, worker_id, lease_generation FROM public.google_canonical_deliveries WHERE id=$1', [id(n)])).rows[0];
const runRow = async (n: number) => (await db.query('SELECT status, worker_id, lease_generation FROM public.swarm_runs WHERE id=$1', [id(100 + n)])).rows[0];

test('a dispatcher killed after reserving the launch: the unknown outcome is not retried at once, is retried after its lease, and no worker ever ran', async () => {
  await svc(enqueue(1));
  const tokenA = id(201), tokenB = id(202), tokenC = id(203);
  const a = child(reserveSql(1, tokenA), 'hold');
  assert.equal((await a.answer as { state: string }).state, 'reserved');
  await a.kill();
  // the dead dispatcher's reservation keeps its lease: a replacement is told the delivery is busy, so an uncertain launch is not blindly repeated
  const b = child(reserveSql(1, tokenB), 'exit');
  assert.equal((await b.answer as { state: string }).state, 'busy');
  await b.closed;
  assert.equal((await deliveryRow(1)).launch_attempts, 1);
  // once the lease has run out the launch may be attempted again, under the attempt ceiling
  await db.query("UPDATE public.google_canonical_deliveries SET launch_lease_until = clock_timestamp() - interval '1 second' WHERE id=$1", [id(1)]);
  const c = child(reserveSql(1, tokenC), 'exit');
  assert.equal((await c.answer as { state: string }).state, 'reserved');
  await c.closed;
  const row = await deliveryRow(1);
  assert.equal(row.launch_attempts, 2); assert.equal(row.launch_token, tokenC, 'the new reservation owns the delivery');
  // the dead dispatcher's token can no longer record a launch against it
  assert.equal((await svc<{ r: boolean }>(`SELECT public.record_google_canonical_launch('${id(1)}','${tokenA}','projects/p-123456/locations/us-east4/operations/op-stale') AS r`)).r, false);
  // and through all of it, no worker was ever issued: nothing ran, so nothing can have run twice
  const run = await runRow(1); assert.equal(run.worker_id, null); assert.equal(run.lease_generation, null);
});

test('a worker killed after claiming: a second worker is denied, the old worker\'s late writes are fenced, and a resumed delivery has exactly one winner', async () => {
  await svc(enqueue(2));
  assert.equal(((await svc<{ r: { state: string } }>(reserveSql(2, id(210)))).r).state, 'reserved');
  const workerA = id(301), genA = id(401), workerB = id(302), genB = id(402), workerC = id(303), genC = id(403);
  const a = child(claimSql(2, workerA, genA), 'hold');
  const claimA = await a.answer as { workerId: string; generation: string; runId: string };
  assert.equal(claimA.workerId, workerA); assert.equal(claimA.generation, genA);
  await a.kill();

  // a duplicate delivery of the same job cannot take over a run that already has a worker generation
  const b = child(claimSql(2, workerB, genB), 'exit');
  assert.equal(await b.answer, null, 'the second worker is denied');
  await b.closed;
  assert.equal((await runRow(2)).worker_id, workerA, 'the run still belongs to the first worker generation');

  // orphan reconciliation (the same UPDATE the reconciler issues once the heartbeat is stale) ends the dead worker's run as interrupted
  await db.query("UPDATE public.swarm_runs SET heartbeat_at = clock_timestamp() - interval '10 minutes' WHERE id=$1", [id(102)]);
  await db.query("UPDATE public.swarm_runs SET status='error', output='{\"type\":\"error\",\"code\":\"BUILD_INTERRUPTED\",\"resumable\":true}', completed_at=clock_timestamp(), worker_id=NULL, lease_generation=NULL, heartbeat_at=NULL WHERE id=$1 AND status='running' AND heartbeat_at < clock_timestamp() - interval '5 minutes'", [id(102)]);
  assert.equal((await runRow(2)).status, 'error');

  // an explicit resume creates a different delivery and supersedes the old one, so old messages cannot replay against the run
  const resumed = `SELECT public.enqueue_google_canonical_run('${id(92)}','${id(102)}','${OWNER}',NULL,'{"prompt":"synthetic","clientMeta":{"resumeRun":true}}','${SOURCE}') AS r`;
  assert.equal(((await svc<{ r: { deliveryId: string } }>(resumed)).r).deliveryId, id(92));
  assert.equal((await deliveryRow(2)).state, 'superseded');
  assert.equal(((await svc<{ r: { state: string } }>(reserveSql(2, id(211)))).r).state, 'acknowledged', 'the old delivery no longer has launch authority');
  assert.equal(((await svc<{ r: { state: string } }>(reserveSql(92, id(212)))).r).state, 'reserved');

  // the resumed delivery has exactly one winner among racing real worker processes
  const racers = [child(claimSql(92, workerC, genC), 'exit'), child(claimSql(92, workerB, genB), 'exit')];
  const answers = await Promise.all(racers.map((r) => r.answer));
  await Promise.all(racers.map((r) => r.closed));
  const winners = answers.filter((x) => x !== null) as Array<{ workerId: string; generation: string }>;
  assert.equal(winners.length, 1, 'exactly one canonical worker claim');
  const win = winners[0]!;

  // fencing: the dead worker's late result is rejected, the winner's is accepted once, and a contradicting repeat is rejected
  const state = { prompt: 'synthetic', status: 'complete', output: { type: 'text', text: 'ok' }, feature_category: null, token_usage: null, completed_at: '2026-10-29T00:00:00Z', iteration_count: 1, events: [], last_sequence: 0 };
  const persist = (worker: string, generation: string) => `SELECT public.persist_swarm_run_attempt('${id(102)}','${OWNER}','${worker}','${generation}','${JSON.stringify(state)}') AS r`;
  assert.equal((await svc<{ r: boolean }>(persist(workerA, genA))).r, false, 'the killed worker\'s late result is fenced out');
  assert.equal((await svc<{ r: boolean }>(persist(win.workerId, win.generation))).r, true);
  const record = (worker: string, generation: string, failed: boolean) => `SELECT public.record_google_canonical_result('${id(92)}','${OWNER}','${worker}','${generation}',${failed},'[]') AS r`;
  assert.equal((await svc<{ r: boolean }>(record(workerA, genA, false))).r, false, 'a stale generation cannot record a delivery result');
  assert.equal((await svc<{ r: boolean }>(record(win.workerId, win.generation, false))).r, true);
  assert.equal((await svc<{ r: boolean }>(record(win.workerId, win.generation, true))).r, false, 'a contradicting second result is rejected');
});

test('cancellation after admission: the queued delivery cannot be launched or claimed, and a killed worker\'s late result is fenced', async () => {
  await svc(enqueue(3));
  const cancelled = await svc<{ r: { status: string } }>(`SELECT public.cancel_swarm_run_owned('${id(103)}','${OWNER}') AS r`);
  assert.equal(cancelled.r.status, 'cancelled');
  assert.equal(((await svc<{ r: { state: string } }>(reserveSql(3, id(220)))).r).state, 'acknowledged', 'a cancelled run gets no launch');
  const w = child(claimSql(3, id(311), id(411)), 'exit');
  assert.equal(await w.answer, null, 'and no worker claim');
  await w.closed;
  const state = { prompt: 'synthetic', status: 'complete', output: { type: 'text', text: 'late' }, feature_category: null, token_usage: null, completed_at: '2026-10-29T00:00:00Z', iteration_count: 1, events: [], last_sequence: 0 };
  assert.equal((await svc<{ r: boolean }>(`SELECT public.persist_swarm_run_attempt('${id(103)}','${OWNER}','${id(311)}','${id(411)}','${JSON.stringify(state)}') AS r`)).r, false, 'a late result can never flip a cancelled run to complete');
  assert.equal((await runRow(3)).status, 'cancelled');
});
