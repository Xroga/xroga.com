import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { isRunCancellationRequested } from './runStore.js';

test('cancellation polling rejects substituted identity and malformed state receipts', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV'];
  const prior = keys.map(key => process.env[key]);
  const owner = randomUUID(), run = randomUUID();
  const canonical = { id: run, user_id: owner, status: 'running', lease_generation: null, worker_id: null };
  let receipt: unknown = canonical;
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://127.0.0.1');
    assert.equal(req.method, 'GET');
    assert.equal(url.searchParams.get('id'), `eq.${run}`);
    assert.equal(url.searchParams.get('user_id'), `eq.${owner}`);
    assert.equal(url.searchParams.get('select'), 'id,user_id,status,lease_generation,worker_id');
    res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(receipt));
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only'; process.env.NODE_ENV = 'production';
    assert.equal(await isRunCancellationRequested(run, owner), false);
    receipt = { ...canonical, status: 'cancelled' };
    assert.equal(await isRunCancellationRequested(run, owner), true);
    for (receipt of [null, {}, { ...canonical, id: randomUUID() }, { ...canonical, user_id: randomUUID() },
      { ...canonical, status: 'unknown' }, { ...canonical, status: null }, { ...canonical, status: {} }]) {
      await assert.rejects(isRunCancellationRequested(run, owner), /Run authority is unavailable/);
    }
  } finally {
    keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; });
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
