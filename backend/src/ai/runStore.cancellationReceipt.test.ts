import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { requestRunCancellation } from './runStore.js';

test('cold cancellation uses exact DB receipt and rejects stale learning without unfenced fallback', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV'];
  const prior = keys.map(key => process.env[key]);
  const owner = randomUUID(), run = randomUUID(), time = new Date().toISOString();
  const canonical = { id: run, user_id: owner, status: 'cancelled', lease_generation: null, completed_at: time, created_at: time,
    iteration_count: 7, feature_category: 'chat', output: { type: 'error', error: 'Build stopped.', code: 'BUILD_CANCELLED' } };
  let receipt: unknown = canonical;
  let learningAccepted = false;
  const calls: { path: string; method: string; body: Record<string, unknown> }[] = [];
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
    calls.push({ path: req.url!, method: req.method!, body });
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.includes('/rpc/cancel_swarm_run_owned')) { res.end(JSON.stringify(receipt)); return; }
    if (req.url?.includes('/rpc/persist_cancelled_build_outcome')) { res.end(JSON.stringify(learningAccepted)); return; }
    assert.equal(req.method, 'DELETE', 'no unfenced insert/update fallback');
    res.writeHead(204); res.end();
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only'; process.env.NODE_ENV = 'production';
    receipt = null;
    assert.equal(await requestRunCancellation(run, owner), false);
    for (receipt of [false, [], { ...canonical, id: randomUUID() }, { ...canonical, user_id: randomUUID() },
      { ...canonical, lease_generation: randomUUID() }, { ...canonical, iteration_count: 0 },
      { ...canonical, completed_at: 'bad' }, { ...canonical, status: 'running' }, { ...canonical, output: {} }]) {
      await assert.rejects(requestRunCancellation(run, owner), /receipt is invalid/);
    }
    assert.ok(calls.every(call => call.path.includes('/rpc/cancel_swarm_run_owned')));
    receipt = canonical;
    assert.equal(await requestRunCancellation(run, owner), true);
    const learning = calls.at(-1)!;
    assert.ok(learning.path.includes('/rpc/persist_cancelled_build_outcome'));
    assert.equal(Object.hasOwn(learning.body, 'p_generation'), false);
    assert.equal(learning.body.p_completed_at, canonical.completed_at);
    const row = learning.body.p_outcome as Record<string, unknown>;
    assert.equal(row.iteration_count, 7); assert.equal(row.feature_category, 'chat');
    assert.equal(row.terminal_status, 'cancelled'); assert.equal(row.user_id, owner); assert.equal(row.run_id, run);
    learningAccepted = true;
    assert.equal(await requestRunCancellation(run, owner), true);
    assert.equal(calls.at(-1)?.method, 'DELETE');
  } finally {
    keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; });
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
