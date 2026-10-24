import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { test, type TestContext } from 'node:test';
import pg from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { captureAdmittedRunAttempt, createRunDurable, withRunAttempt } from '../ai/runStore.js';
import { createCanonicalExecutionState, SupabaseExecutionStateStore } from '../ai/executionRuntime.js';
import { SupabaseProjectRuntimeStore, projectWorkspaceFingerprint } from '../synthesis/projectRuntime/store.js';
import type { SoftwareProject } from '../synthesis/softwareProject.js';

export function registerWorkerRevisionTests(admin: SupabaseClient, getUsers: () => readonly { id: string; token: string }[]): void {
  async function fixture(t: TestContext) {
    assert.equal(process.env.CI, 'true'); assert.equal(process.env.XB01_DISPOSABLE_SUPABASE, '1');
    assert.equal(process.env.SUPABASE_URL, 'http://127.0.0.1:54321');
    const [owner, other] = getUsers(), runId = randomUUID(), projectId = `worker-${randomUUID()}`;
    t.after(async () => {
      for (const [table, key] of [['project_runtime_revisions', 'run_id'], ['execution_runs', 'run_id'], ['swarm_runs', 'id']]) {
        assert.equal((await admin.from(table).delete().eq(key, runId).eq('user_id', owner.id)).error, null);
      }
    });
    const project = { projectId, runId, contract: { projectId, runId }, workspace: { files: [{ path: 'index.html', content: 'OWNER_FILE' }] } } as SoftwareProject;
    const attempt = await withRunAttempt(async () => {
      await createRunDurable(owner.id, 'Synthetic worker revision', runId);
      const attempt = captureAdmittedRunAttempt(runId, owner.id);
      await new SupabaseExecutionStateStore(owner.id, attempt).save(createCanonicalExecutionState({ projectId, runId }));
      await new SupabaseProjectRuntimeStore(attempt).saveRevision(owner.id, project);
      return attempt;
    });
    const args = { p_owner_id: owner.id, p_run_id: runId, p_worker_id: attempt.workerId,
      p_generation: attempt.generation, p_project: project, p_fingerprint: projectWorkspaceFingerprint(project) };
    return { owner, other, runId, projectId, project, attempt, args };
  }
  test('real worker revision requires canonical parent lineage and issued current generation', async t => {
    const f = await fixture(t);
    for (const patch of [{ p_owner_id: f.other.id }, { p_worker_id: 'stale' }, { p_generation: randomUUID() },
      { p_project: { ...f.project, projectId: 'foreign', contract: { projectId: 'foreign', runId: f.runId } } },
      { p_project: { ...f.project, contract: { projectId: f.projectId, runId: randomUUID() } } }]) {
      const denied = await admin.rpc('persist_worker_project_revision', { ...f.args, ...patch });
      assert.equal(denied.error, null); assert.equal(denied.data, null);
    }
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
    const authenticated = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, { global: { headers: { Authorization: `Bearer ${f.owner.token}` } } });
    for (const client of [anon, authenticated]) assert.ok((await client.rpc('persist_worker_project_revision', f.args)).error);
    const revisions = await admin.from('project_runtime_revisions').select('*').eq('run_id', f.runId).eq('user_id', f.owner.id);
    assert.equal(revisions.error, null); assert.equal(revisions.data!.length, 1);
  });
  for (const cancel of [false, true]) test(`real worker revision waiting on parent lock cannot supersede ${cancel ? 'cancelled' : 'resumed'} state`, async t => {
    const f = await fixture(t), url = new URL(process.env.XB01_LOCAL_DATABASE_URL!);
    assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '54322'); assert.equal(url.pathname, '/postgres');
    const locker = new pg.Client({ connectionString: url.href, ssl: false }), writer = new pg.Client({ connectionString: url.href, ssl: false });
    await locker.connect(); await writer.connect(); let pending: Promise<pg.QueryResult> | undefined;
    try {
      await writer.query('set statement_timeout=10000');
      const writerPid = (await writer.query('select pg_backend_pid() as pid')).rows[0].pid;
      const lockerPid = (await locker.query('select pg_backend_pid() as pid')).rows[0].pid;
      await writer.query('set role service_role'); await locker.query('begin');
      await locker.query('select id from public.swarm_runs where id=$1 and user_id=$2 for update', [f.runId, f.owner.id]);
      pending = writer.query('select public.persist_worker_project_revision($1,$2,$3,$4,$5,$6) as receipt',
        [f.owner.id, f.runId, f.attempt.workerId, f.attempt.generation, JSON.stringify(f.project), f.args.p_fingerprint]);
      void pending.catch(() => {}); let blocked = false;
      for (let count = 0; count < 100; count++) {
        const observed = await locker.query('select pg_blocking_pids($1) as blockers', [writerPid]);
        if (observed.rows[0].blockers.includes(lockerPid)) { blocked = true; break; }
        await delay(20);
      }
      assert.equal(blocked, true, 'observe actual parent-row lock wait');
      if (cancel) await locker.query('select public.cancel_swarm_run_owned($1,$2)', [f.runId, f.owner.id]);
      else await locker.query("update public.swarm_runs set lease_generation=$3,worker_id='new-worker' where id=$1 and user_id=$2", [f.runId, f.owner.id, randomUUID()]);
      await locker.query('commit'); assert.equal((await pending).rows[0].receipt, null);
      const revisions = await admin.from('project_runtime_revisions').select('*').eq('run_id', f.runId).eq('user_id', f.owner.id);
      assert.equal(revisions.error, null); assert.equal(revisions.data!.length, 1);
    } finally { await locker.query('rollback'); if (pending) await pending.catch(() => {}); await writer.end(); await locker.end(); }
  });
}
