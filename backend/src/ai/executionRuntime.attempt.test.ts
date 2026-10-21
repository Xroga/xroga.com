import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createCanonicalExecutionState, ExecutionScheduler, InMemoryExecutionStateStore, SupabaseExecutionStateStore } from './executionRuntime.js';
import { captureAdmittedRunAttempt, createRunDurable, withRunAttempt } from './runStore.js';
import { runUniversalSynthesisFoundation } from '../synthesis/foundation.js';

test('checkpoint writer requires captured authority, snapshots and serializes writes, and never falls back after rejection', async () => {
  const userId = randomUUID(), runId = randomUUID();
  const state = createCanonicalExecutionState({ projectId: 'project', runId, databaseProjectId: randomUUID() });
  assert.throws(() => captureAdmittedRunAttempt(runId, userId), { code: 'RUN_STATE_CONFLICT' });
  await assert.rejects(new SupabaseExecutionStateStore(userId).save(state), { code: 'RUN_STATE_CONFLICT' });
  assert.throws(() => new SupabaseExecutionStateStore(userId, { runId,userId,workerId:'forged',generation:randomUUID() }), { code: 'RUN_STATE_CONFLICT' });
  const prior = [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY], originalFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'http://127.0.0.1:49224'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only';
  const writes: any[] = []; let accepted = true;
  let release: (() => void) | undefined;
  globalThis.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path === '/rest/v1/swarm_runs' && init?.method === 'POST') return new Response(null,{status:201});
    assert.equal(path, '/rest/v1/rpc/persist_execution_checkpoint_attempt');
    writes.push(JSON.parse(String(init?.body)));
    if (writes.length === 1) await new Promise<void>(resolve => { release = resolve; });
    return Response.json(accepted);
  };
  try {
    const attempt = await withRunAttempt(async () => {
      await createRunDurable(userId,'Synthetic checkpoint fixture',runId);
      return captureAdmittedRunAttempt(runId,userId);
    });
    assert.throws(() => new SupabaseExecutionStateStore(userId, structuredClone(attempt)), { code:'RUN_STATE_CONFLICT' });
    assert.throws(() => new SupabaseExecutionStateStore(userId, { ...attempt }), { code:'RUN_STATE_CONFLICT' });
    await assert.rejects(new SupabaseExecutionStateStore(randomUUID(), attempt).save(state), { code: 'RUN_STATE_CONFLICT' });
    await assert.rejects(new SupabaseExecutionStateStore(userId, attempt).save({...state,runId:randomUUID()}), { code: 'RUN_STATE_CONFLICT' });
    assert.equal(writes.length,0,'forged or mismatched authority must fail before checkpoint IO');
    const store = new SupabaseExecutionStateStore(userId, attempt);
    const first = store.save(state);
    state.blockers.push('second snapshot');
    const second = store.save(state);
    while (!release) await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].p_state.blockers, []);
    release(); await Promise.all([first, second]);
    assert.deepEqual(writes[1].p_state.blockers, ['second snapshot']);
    assert.equal(writes[0].p_generation, attempt.generation);
    accepted = false;
    const rejected = new SupabaseExecutionStateStore(userId, attempt);
    state.tasks = [{ id:'probe',objective:'probe',operationType:'probe',requiredCapabilities:[],selectedRuntime:'node',selectedProvider:null,
      selectedModel:null,requiredContextReferences:[],allowedFiles:[],expectedOutputSchema:{},dependencies:[],riskLevel:'low',timeoutMs:1000,
      retryPolicy:{maximumAttempts:1,initialBackoffMs:0,maximumBackoffMs:0},budget:{},validationMethod:[],evidenceRequirements:[],fallbackRoutes:[],status:'ready',attempts:0,evidence:[] }];
    let calls = 0;
    await assert.rejects(new ExecutionScheduler(rejected).run(state, { probe: async () => { calls++; return {output:{},evidence:[],validated:true}; } }), { code: 'RUN_STATE_CONFLICT' });
    assert.equal(calls, 0, 'rejected admission checkpoint must precede all task side effects');
    const count = writes.length;
    await assert.rejects(rejected.save(state), { code: 'RUN_STATE_CONFLICT' });
    assert.equal(writes.length, count, 'failed queue cannot hide loss of authority with a later successful write');
  } finally {
    release?.(); globalThis.fetch = originalFetch;
    ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'].forEach((key,index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; });
  }
});

test('fresh foundation captures database project binding before its first durable checkpoint', async () => {
  const databaseProjectId = randomUUID(), memory = new InMemoryExecutionStateStore();
  let writes = 0;
  await runUniversalSynthesisFoundation({runId:randomUUID(),projectId:'repository-context',databaseProjectId,prompt:'Build a local CLI tool',files:[],
    store:{load:runId=>memory.load(runId),save:async state=>{assert.equal(state.databaseProjectId,databaseProjectId);writes++;await memory.save(state);}}});
  assert.ok(writes > 0);
});
