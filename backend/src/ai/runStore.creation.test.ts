import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { activeRunIds, createRunDurable, getRun, listRunsForUser } from './runStore.js';

test('durable creation is insert-only, rejects collisions and drops failed local leases', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_DB_PASSWORD', 'NODE_ENV'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  const userId = randomUUID();
  let mode = 'conflict';
  let writes = 0;
  const server = createServer(async (req, res) => {
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/rest/v1/swarm_runs');
    assert.equal(req.headers.prefer?.includes('resolution=merge-duplicates') ?? false, false);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const row = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(row.user_id, userId);
    writes++;
    if (mode === 'success') { res.writeHead(201); res.end(); }
    else {
      res.writeHead(mode === 'conflict' ? 409 : 400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: mode === 'conflict' ? '23505' : 'XX000', message: 'private database detail' }));
    }
  });
  try {
    keys.forEach(key => delete process.env[key]);
    process.env.NODE_ENV = 'production';
    const missingId = randomUUID();
    await assert.rejects(createRunDurable(userId, 'fixture', missingId), /Durable run storage is unavailable/);
    assert.equal(getRun(missingId), null);
    assert.equal(activeRunIds().includes(missingId), false);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    for (mode of ['conflict', 'failure']) {
      const id = randomUUID();
      await assert.rejects(createRunDurable(userId, 'fixture', id), mode === 'conflict' ? /already exists/ : /Durable run creation failed/);
      assert.equal(getRun(id), null);
      assert.equal(activeRunIds().includes(id), false);
      assert.equal(listRunsForUser(userId).some(run => run.id === id), false);
    }
    mode = 'success';
    const id = randomUUID();
    const outcomes = await Promise.allSettled([createRunDurable(userId, 'first', id), createRunDurable(userId, 'second', id)]);
    assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(writes, 3);
    assert.equal(getRun(id)?.prompt, 'first');
  } finally {
    for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
