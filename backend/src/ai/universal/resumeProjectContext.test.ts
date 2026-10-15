import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { projectContextKey, requireResumeProjectContext } from './projectContext.js';

test('resume target comes from durable repository branch and root, not new client values', () => {
  const runId = randomUUID();
  const original = { repo: 'org/one', branch: 'feature/a', projectRoot: '/packages/a' };
  const state = { runId, projectId: projectContextKey(original), repository: { owner: 'org', name: 'one' }, selectedBranch: 'feature/a' };
  assert.deepEqual(requireResumeProjectContext(state, runId, {}), original);
  const databaseProjectId = randomUUID();
  assert.deepEqual(requireResumeProjectContext({ ...state, databaseProjectId }, runId, { projectId: databaseProjectId }), original);
  assert.throws(() => requireResumeProjectContext({ ...state, databaseProjectId }, runId, { projectId: randomUUID() }), { code: 'RUN_RESUME_TARGET_MISMATCH' });
  assert.throws(() => requireResumeProjectContext(state, runId, { projectId: databaseProjectId }), { code: 'RUN_RESUME_LINEAGE_UNAVAILABLE' });
  assert.deepEqual(requireResumeProjectContext(state, runId, { ...original, repo: 'ORG/ONE', projectRoot: '/packages/a/' }), original);
  for (const change of [{ repo: 'org/two' }, { branch: 'feature/b' }, { projectRoot: '/packages/b' }]) {
    assert.throws(() => requireResumeProjectContext(state, runId, change), { code: 'RUN_RESUME_TARGET_MISMATCH' });
  }
  for (const bad of [null, { ...state, runId: randomUUID() }, { ...state, projectId: '%broken::%key::root' },
    { ...state, selectedBranch: 'other' }, { ...state, repository: { owner: 'org', name: 'other' } }]) {
    assert.throws(() => requireResumeProjectContext(bad, runId, {}), { code: 'RUN_RESUME_LINEAGE_UNAVAILABLE' });
  }
  const standalone = { ...state, projectId: `run:${runId}`, repository: null, selectedBranch: 'main' };
  assert.equal(requireResumeProjectContext(standalone, runId, {}), null);
  assert.throws(() => requireResumeProjectContext(standalone, runId, { repo: original.repo }), { code: 'RUN_RESUME_TARGET_MISMATCH' });
});

test('actual pipeline refuses changed resume lineage before worker claims or provider IO', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const prior = keys.map(key => process.env[key]);
  const originalFetch = globalThis.fetch;
  const userId = randomUUID(), runId = randomUUID();
  const projectId = projectContextKey({ repo: 'org/original', branch: 'topic', projectRoot: '/app' });
  const paths: string[] = [];
  process.env.SUPABASE_URL = 'http://127.0.0.1:49223';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    paths.push(url.pathname);
    assert.equal(url.origin, process.env.SUPABASE_URL);
    assert.equal(url.pathname, '/rest/v1/execution_runs');
    assert.equal(init?.method ?? 'GET', 'GET');
    assert.equal(url.searchParams.get('user_id'), `eq.${userId}`);
    assert.equal(url.searchParams.get('run_id'), `eq.${runId}`);
    return Response.json({ run_id: runId, user_id: userId, project_id: projectId,
      state: { runId, projectId, repository: { owner: 'org', name: 'original' }, selectedBranch: 'topic' } });
  };
  try {
    const { runBuildPipeline } = await import('../pipeline.js');
    for (const change of [{ githubTargetRepo: 'org/foreign-target' }, { githubTargetBranch: 'other' }, { projectRoot: '/other' }]) {
      await assert.rejects(runBuildPipeline({ runId, userId, prompt: 'resume', clientMeta: { resumeRun: true, ...change } }), { code: 'RUN_RESUME_TARGET_MISMATCH' });
    }
    assert.equal(paths.length, 3, 'each denied resume performs only its owner-scoped checkpoint lookup');
    await assert.rejects(runBuildPipeline({ runId, userId, projectId: randomUUID(), prompt: 'resume', clientMeta: { resumeRun: true } }), { code: 'RUN_RESUME_LINEAGE_UNAVAILABLE' });
    assert.equal(paths.length, 4, 'legacy checkpoint cannot authorize a database project substitution');
  } finally {
    globalThis.fetch = originalFetch;
    keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; });
  }
});
