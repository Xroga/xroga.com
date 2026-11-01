import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import type pg from 'pg';
import { createCanonicalExecutionState, ExecutionScheduler } from '../ai/executionRuntime.js';
import { createDisposableDb, PG_TEST_URL } from '../storage/testing/pgFixture.js';
import { PostgresBrowserRunStore, type BrowserRunSpec } from './browserRunStore.js';
import { PostgresLeaseStore } from './postgresLeaseStore.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(here, '../../../supabase/migrations/20261026100000_browser_runs_durable.sql');
const skip = PG_TEST_URL ? false : 'STORAGE_TEST_DATABASE_URL not set: real-Postgres tests not run (these are the only tests that exercise the browser-run SQL)';

const SPEC: BrowserRunSpec = { goal: 'g', startUrl: 'https://example.com/', allowedOrigins: ['https://example.com'], limits: { maxDurationMs: 1000 }, plan: { steps: [], expect: [] }, driveProject: null };
const task = () => ({
  id: 'browser-1', objective: 'g', operationType: 'browser_automation', requiredCapabilities: ['browser_automation'], selectedRuntime: 'xroga-browser-worker', selectedProvider: null, selectedModel: null,
  requiredContextReferences: [], allowedFiles: [], expectedOutputSchema: {}, dependencies: [], riskLevel: 'medium' as const, timeoutMs: 1000, retryPolicy: { maximumAttempts: 1, initialBackoffMs: 1, maximumBackoffMs: 1 },
  budget: { maximumUsd: 0 }, validationMethod: [], evidenceRequirements: [], fallbackRoutes: [], status: 'pending' as const, attempts: 0, evidence: [],
});
const newState = (runId: string) => createCanonicalExecutionState({ projectId: `user:u1`, runId, requiredCapabilities: ['browser_automation'], tasks: [task()] });
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('durable browser runs against real PostgreSQL', { skip }, () => {
  let pool: pg.Pool; let drop: () => Promise<void>; let store: PostgresBrowserRunStore;
  before(async () => {
    const db = await createDisposableDb();
    pool = db.pool; drop = db.drop;
    await pool.query(readFileSync(MIGRATION, 'utf8'));
    await pool.query(readFileSync(path.resolve(here, '../../../supabase/migrations/20261024000000_worker_task_leases.sql'), 'utf8'));
    store = new PostgresBrowserRunStore(pool);
  });
  after(async () => { await drop(); });

  it('stores a run, loads it only for its owner, and round-trips the state and spec', async () => {
    await store.create({ tenantId: 't1', userId: 'u1', state: newState(id(1)), spec: SPEC });
    const mine = await store.load('u1', id(1));
    assert.equal(mine?.status, 'queued');
    assert.deepEqual(mine?.spec, SPEC);
    assert.equal(mine?.state.tasks[0]?.id, 'browser-1');
    assert.equal(await store.load('u2', id(1)), null);
    assert.equal((await store.loadInternal(id(1)))?.tenantId, 't1');
    assert.equal(await store.stateStore('u2').load(id(1)), null);
  });

  it('saves state for the owner only, derives the status, and never reopens a finished run', async () => {
    await store.create({ tenantId: 't1', userId: 'u1', state: newState(id(2)), spec: SPEC });
    const lease = await new PostgresLeaseStore(pool).acquire({tenantId:'t1',runId:id(2),taskId:'execute'},'worker',30000);
    assert.ok(lease);
    const own = store.stateStore('u1',()=>lease);
    const state = (await own.load(id(2)))!;
    state.tasks[0]!.status = 'running';
    await own.save(state);
    assert.equal((await store.load('u1', id(2)))?.status, 'running');
    await assert.rejects(store.stateStore('u2',()=>lease).save(state), /no longer authoritative/);
    state.tasks[0]!.status = 'completed';
    await own.save(state);
    assert.equal((await store.load('u1', id(2)))?.status, 'completed');
    state.tasks[0]!.objective = 'late rewrite';
    await own.save(state); // the scheduler may repeat a terminal checkpoint
    assert.equal((await store.load('u1',id(2)))?.state.tasks[0]?.objective,'g');
    await assert.rejects(store.stateStore('u1').save(state), /no longer authoritative/);
    state.tasks[0]!.status = 'running';
    await assert.rejects(own.save(state), /no longer authoritative/);
    assert.equal((await store.load('u1', id(2)))?.status, 'completed');
  });

  it('cancel is durable, owner-scoped and idempotent, and refuses a finished run', async () => {
    await store.create({ tenantId: 't1', userId: 'u1', state: newState(id(3)), spec: SPEC });
    assert.equal(await store.requestCancel('u2', id(3)), 'not_found');
    assert.equal(await store.isCancelRequested(id(3)), false);
    assert.equal(await store.requestCancel('u1', id(3)), 'requested');
    assert.equal(await store.requestCancel('u1', id(3)), 'requested');
    assert.equal(await store.isCancelRequested(id(3)), true);
    assert.equal((await store.load('u1', id(3)))?.cancelRequested, true);
    assert.equal(await store.requestCancel('u1', id(2)), 'already_finished');
    assert.equal(await store.requestCancel('u1', id(99)), 'not_found');
  });

  it('rejects a checkpoint from a worker after its durable execution lease is replaced', async () => {
    const runId=id(20), key={tenantId:'t1',runId,taskId:'execute'};
    await store.create({tenantId:'t1',userId:'u1',state:newState(runId),spec:SPEC});
    const leases=new PostgresLeaseStore(pool);
    const old=await leases.acquire(key,'old-worker',30000); assert.ok(old);
    await leases.release(old);
    const current=await leases.acquire(key,'new-worker',30000); assert.ok(current);
    const oldStore=store.stateStore('u1',()=>old);
    const currentStore=store.stateStore('u1',()=>current);
    const oldState=newState(runId); oldState.tasks[0]!.status='completed';
    await assert.rejects(oldStore.save(oldState),/no longer authoritative/);
    const liveState=newState(runId); liveState.tasks[0]!.status='running';
    await currentStore.save(liveState);
    assert.equal((await store.load('u1',runId))?.status,'running');
    liveState.tasks[0]!.status='completed';
    await currentStore.save(liveState);
  });

  it('counts active runs per tenant and lists stale unfinished runs only', async () => {
    assert.equal(await store.countActive('t1'), 2, 'runs 1 and 3 are unfinished; run 2 is completed');
    assert.equal(await store.countActive('t-other'), 0);
    await pool.query("update public.browser_runs set updated_at = now() - interval '10 minutes' where run_id = $1", [id(1)]);
    const stale = await store.listRecoverable(120_000, 10);
    assert.deepEqual(stale.map((r) => r.runId), [id(1)]);
    await store.markDispatched(id(1));
    assert.deepEqual(await store.listRecoverable(120_000, 10), [], 'a dispatched run is left alone until it goes stale again');
  });

  it('is closed to the public roles', async () => {
    const r = await pool.query<{ rls: boolean }>("select relrowsecurity as rls from pg_class where oid = 'public.browser_runs'::regclass");
    assert.equal(r.rows[0]?.rls, true);
    const grants = await pool.query<{ grantee: string }>("select grantee from information_schema.role_table_grants where table_schema='public' and table_name='browser_runs' and grantee in ('anon','authenticated','PUBLIC')");
    assert.deepEqual(grants.rows, []);
  });

  it('does not persist a success after cancellation wins the database race', async () => {
    const runId=id(21),key={tenantId:'t1',runId,taskId:'execute'};
    await store.create({tenantId:'t1',userId:'u1',state:newState(runId),spec:SPEC});
    const lease=await new PostgresLeaseStore(pool).acquire(key,'worker',30000);assert.ok(lease);
    const state=newState(runId), writable=store.stateStore('u1',()=>lease);
    assert.equal(await store.requestCancel('u1',runId),'requested');
    state.tasks[0]!.status='completed';
    await assert.rejects(writable.save(state),/no longer authoritative/);
    state.tasks[0]!.status='cancelled';
    await writable.save(state);
    assert.equal((await store.load('u1',runId))?.status,'cancelled');
  });

  it('allows the scheduler to finish through fenced checkpoints without rewriting terminal state', async () => {
    const runId=id(22),key={tenantId:'t1',runId,taskId:'execute'};
    const state=newState(runId);
    await store.create({tenantId:'t1',userId:'u1',state,spec:SPEC});
    const lease=await new PostgresLeaseStore(pool).acquire(key,'worker',30000);assert.ok(lease);
    let calls=0;
    await new ExecutionScheduler(store.stateStore('u1',()=>lease)).run(state,{
      browser_automation:async()=>{calls++;return {output:'synthetic',validated:true,evidence:[{id:'fixture',kind:'test',summary:'local',timestamp:new Date().toISOString()}]};},
    });
    assert.equal(calls,1);
    assert.equal((await store.load('u1',runId))?.status,'completed');
  });

  it('allows an already-cancelled scheduler to persist cancellation without dispatching work', async () => {
    const runId=id(23),key={tenantId:'t1',runId,taskId:'execute'};
    const state=newState(runId);
    await store.create({tenantId:'t1',userId:'u1',state,spec:SPEC});
    const lease=await new PostgresLeaseStore(pool).acquire(key,'worker',30000);assert.ok(lease);
    assert.equal(await store.requestCancel('u1',runId),'requested');
    const abort=new AbortController();abort.abort();let calls=0;
    await new ExecutionScheduler(store.stateStore('u1',()=>lease)).run(state,{
      browser_automation:async()=>{calls++;throw new Error('must not dispatch');},
    },abort.signal);
    assert.equal(calls,0);
    assert.equal((await store.load('u1',runId))?.status,'cancelled');
  });
});
