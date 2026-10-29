import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { captureAdmittedRunAttempt, createRunDurable, withRunAttempt } from '../../ai/runStore.js';
import { persistWorkerSoftwareProjectRevision, SupabaseProjectRuntimeStore } from './store.js';
import type { SoftwareProject } from '../softwareProject.js';

test('worker revisions require issued attempt and failed save cannot become a completion receipt', async () => {
  const owner = randomUUID(), runId = randomUUID();
  const project = { projectId: 'logical-project', runId, contract: { projectId: 'logical-project', runId },
    workspace: { files: [{ path: 'index.html', content: 'ORIGINAL' }] } } as SoftwareProject;
  const oldFetch = globalThis.fetch, prior = [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY];
  process.env.SUPABASE_URL = 'http://127.0.0.1:49228'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'fixture-only';
  const writes: any[] = []; let mode = 'accept'; const stored = new Map<string, Record<string, unknown>>();
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === '/rest/v1/swarm_runs' && init?.method === 'POST') return new Response(null, { status: 201 });
    if (path === '/rest/v1/project_runtime_revisions' && (init?.method ?? 'GET') === 'GET') {
      const id = /revision_id=eq.([0-9a-f-]+)/i.exec(new URL(String(input)).search)?.[1] ?? '';
      return Response.json(stored.has(id) ? [stored.get(id)] : []);
    }
    assert.equal(path, '/rest/v1/rpc/persist_worker_project_revision');
    const body = JSON.parse(String(init?.body)); writes.push(body);
    if (mode === 'stale') return Response.json(null);
    if (mode === 'outage') return Response.json({ message: 'PRIVATE_DATABASE_CANARY' }, { status: 400 });
    if (mode === 'mutate') (project.workspace.files[0] as { content: string }).content = 'MUTATED';
    const row = { revision_id: randomUUID(), user_id: body.p_owner_id, project_id: body.p_project.projectId,
      run_id: body.p_run_id, workspace_fingerprint: body.p_fingerprint, revision_number: 1, created_at: new Date().toISOString() };
    stored.set(row.revision_id, { ...row, software_project: body.p_project });
    return Response.json(row);
  };
  try {
    await assert.rejects(persistWorkerSoftwareProjectRevision(owner, project), { code: 'RUN_STATE_CONFLICT' });
    assert.throws(() => new SupabaseProjectRuntimeStore({ userId: owner, runId, workerId: 'forged', generation: randomUUID() }), { code: 'RUN_STATE_CONFLICT' });
    assert.equal(writes.length, 0);
    await withRunAttempt(async () => {
      await createRunDurable(owner, 'Synthetic worker revision', runId);
      const attempt = captureAdmittedRunAttempt(runId, owner), store = new SupabaseProjectRuntimeStore(attempt);
      await assert.rejects(store.saveRevision(randomUUID(), project), { code: 'RUN_STATE_CONFLICT' });
      assert.equal(writes.length, 0);
      mode = 'mutate';
      const saved = await store.saveRevision(owner, project);
      assert.equal(saved.project.workspace.files[0].content, 'ORIGINAL');
      assert.equal(writes[0].p_generation, attempt.generation);
      mode = 'accept'; assert.equal((await persistWorkerSoftwareProjectRevision(owner, project)).saved, true);
      mode = 'stale'; await assert.rejects(persistWorkerSoftwareProjectRevision(owner, project), { code: 'RUN_STATE_CONFLICT' });
      mode = 'outage'; await assert.rejects(persistWorkerSoftwareProjectRevision(owner, project), error =>
        error instanceof Error && error.message === 'Project revision was not persisted.');
    });
  } finally {
    globalThis.fetch = oldFetch;
    ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].forEach((key, i) => { if (prior[i] === undefined) delete process.env[key]; else process.env[key] = prior[i]; });
  }
});
