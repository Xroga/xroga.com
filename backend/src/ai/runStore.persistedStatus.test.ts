import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { getRunAsync, listRunsForUserAsync } from './runStore.js';

test('cold and history hydration preserve legacy state without fabricating completion', async () => {
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV'];
  const prior = keys.map(key => process.env[key]);
  const owner = randomUUID();
  const expected: Record<string, string> = { pending: 'running', planning: 'running', building: 'running',
    reviewing: 'running', testing: 'running', verifying: 'running', running: 'running',
    completed: 'complete', complete: 'complete', failed: 'error', error: 'error', cancelled: 'cancelled' };
  const rows = [...Object.keys(expected), 'unknown', 'constructor', null, {}].map(status => ({
    id: randomUUID(), user_id: owner, status, prompt: 'fixture', created_at: '2026-01-01T00:00:00Z', iteration_count: 0,
  }));
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://127.0.0.1');
    assert.equal(req.method, 'GET'); assert.equal(url.searchParams.get('user_id'), `eq.${owner}`);
    const id = url.searchParams.get('id')?.slice(3);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(id ? rows.find(row => row.id === id) : rows));
  });
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only'; process.env.NODE_ENV = 'production';
    for (const row of rows) {
      if (typeof row.status === 'string' && Object.hasOwn(expected, row.status)) {
        assert.equal((await getRunAsync(row.id, owner, true))?.status, expected[row.status]);
      } else {
        await assert.rejects(getRunAsync(row.id, owner, true), /Run authority is unavailable/);
        assert.equal(await getRunAsync(row.id, owner), null);
      }
    }
    const history = await listRunsForUserAsync(owner);
    assert.equal(history.length, Object.keys(expected).length);
    for (const row of history) assert.equal(row.status, expected[rows.find(stored => stored.id === row.id)!.status as string]);
  } finally {
    keys.forEach((key, index) => { if (prior[index] === undefined) delete process.env[key]; else process.env[key] = prior[index]; });
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
