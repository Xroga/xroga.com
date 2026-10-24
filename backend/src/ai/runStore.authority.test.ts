import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createRunDurable, getRun, persistRunState, requestRunCancellation, isRunCancellationRequested, saveConversation, resumeRunDurable } from './runStore.js';

// HTTP boundary fixtures only. Real row-lock races live in the disposable DB suite.
test('worker persistence and cancellation fail closed at the HTTP boundary', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_DB_PASSWORD', 'NODE_ENV'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  const owner = randomUUID();
  const runId = randomUUID();
  const requests: { method: string; url: string; body: Record<string, unknown> }[] = [];
  let unavailable = false;
  let rpcAccepted = true;
  let remoteRecord: Record<string, unknown> = {};
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    requests.push({ method: req.method!, url: req.url!, body });
    res.setHeader('Content-Type', 'application/json');
    if (unavailable) { res.writeHead(400); res.end(JSON.stringify({ message: 'private fixture detail' })); return; }
    if (req.url?.includes('/rpc/')) { res.end(JSON.stringify(rpcAccepted)); return; }
    if (req.method === 'POST') { remoteRecord = body; res.writeHead(201); res.end(); return; }
    if (req.method === 'GET') { res.end(JSON.stringify(remoteRecord)); return; }
    remoteRecord = { ...remoteRecord, ...body };
    res.end(JSON.stringify([{ id: runId }]));
  });
  try {
    keys.forEach(key => delete process.env[key]);
    process.env.NODE_ENV = 'production';
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    await createRunDurable(owner, 'fixture', runId);
    const generation = requests[0].body.lease_generation;
    assert.equal(typeof generation, 'string');
    await persistRunState(runId);
    const write = requests.at(-1)!;
    assert.ok(write.url.endsWith('/rpc/persist_swarm_run_attempt'));
    assert.equal(write.body.p_owner_id, owner);
    assert.equal(write.body.p_generation, generation);
    assert.equal(Object.hasOwn(write.body.p_state as object, 'messages'), false);
    rpcAccepted = false;
    await assert.rejects(persistRunState(runId), { code: 'RUN_STATE_CONFLICT' });
    assert.equal(requests.filter(request => request.method === 'POST' && !request.url.includes('/rpc/')).length, 1);
    assert.equal(await saveConversation(runId, ['hello']), true);
    assert.deepEqual(requests.at(-1)?.body, { messages: ['hello'] });
    assert.ok(requests.at(-1)?.url.includes(`user_id=eq.${owner}`));
    remoteRecord = { ...remoteRecord, status: 'error', completed_at: new Date().toISOString(), iteration_count: 1, worker_id: null };
    const resumed = await resumeRunDurable(owner, 'retry', runId);
    assert.equal(resumed.status, 'running');
    assert.equal(resumed.iteration_count, 1);
    const claim = requests.at(-1)!;
    assert.ok(claim.url.includes(`lease_generation=eq.${generation}`));
    assert.ok(claim.url.includes('iteration_count=eq.1'));
    assert.notEqual(claim.body.lease_generation, generation);
    unavailable = true;
    await assert.rejects(requestRunCancellation(runId, owner), /Platform cancellation write is unavailable/);
    assert.equal(getRun(runId)?.status, 'running');
    assert.equal(await saveConversation(runId, ['lost']), false);
    assert.deepEqual(getRun(runId)?.messages, ['hello']);
    await assert.rejects(isRunCancellationRequested(runId, owner), /Run authority is unavailable/);
    assert.ok(requests.at(-1)?.url.includes(`user_id=eq.${owner}`));
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    await assert.rejects(requestRunCancellation(runId, owner), /unavailable/);
    await assert.rejects(isRunCancellationRequested(runId, owner), /unavailable/);
    assert.equal(getRun(runId)?.status, 'running');
  } finally {
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
