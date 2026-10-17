import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { appendRunEvent, createRunDurable, getRun, hasAdmittedRunAttempt, listRunsForUserAsync, persistRunState, withRunAttempt } from './runStore.js';

test('history hydration cannot replace an admitted worker while its query is in flight', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV'];
  const prior = keys.map(key => process.env[key]);
  const owner = randomUUID(), id = randomUUID(), foreign = randomUUID();
  let persisted: Record<string, unknown> = {};
  let release: (() => void) | undefined;
  let arrived: (() => void) | undefined;
  let lastWrite: Record<string, unknown> | undefined;
  let holdRead = true;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.includes('/rpc/')) { lastWrite = body; res.end('true'); return; }
    if (req.method === 'POST') { persisted = body; res.writeHead(201); res.end(); return; }
    const snapshot = structuredClone(persisted);
    if (holdRead) await new Promise<void>(resolve => { release = resolve; arrived?.(); });
    res.end(JSON.stringify([snapshot, { ...snapshot, id: randomUUID(), user_id: foreign, prompt: 'FOREIGN_CANARY' }]));
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-only'; process.env.NODE_ENV = 'production';
    await withRunAttempt(async () => {
      const admitted = await createRunDurable(owner, 'fixture', id);
      const requestArrived = new Promise<void>(resolve => { arrived = resolve; });
      const listing = listRunsForUserAsync(owner);
      await requestArrived;
      assert.ok(appendRunEvent(id, 'progress', { message: 'newer local evidence' }));
      release!();
      const rows = await listing;
      assert.equal(getRun(id), admitted, 'history must retain the exact object holding the worker generation');
      assert.equal(rows.find(row => row.id === id), admitted);
      assert.equal(rows.length, 1, 'malformed foreign row cannot enter owner history/cache');
      assert.equal(hasAdmittedRunAttempt(id), true);
      assert.equal(getRun(id)?.lastSequence, 1);
      await persistRunState(id);
      assert.equal(lastWrite?.p_generation, persisted.lease_generation);
      assert.equal(lastWrite?.p_owner_id, owner);
    });
    holdRead = false;
    const coldId = randomUUID();
    persisted = { ...persisted, id: coldId, status: 'running' };
    await listRunsForUserAsync(owner);
    const hydrated = getRun(coldId);
    assert.equal(hydrated?.status, 'running');
    persisted = { ...persisted, status: 'complete', completed_at: new Date().toISOString() };
    const refreshed = await listRunsForUserAsync(owner);
    assert.equal(getRun(coldId)?.status, 'complete', 'unadmitted history cache must still refresh durable status');
    assert.notEqual(getRun(coldId), hydrated);
    assert.equal(refreshed.find(row => row.id === coldId)?.status, 'complete');
  } finally {
    release?.();
    keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; });
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
