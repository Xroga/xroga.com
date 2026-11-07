import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { SignJWT } from 'jose';
import { authMiddleware } from '../middleware/auth.js';
import { MemoryLeaseStore } from '../workers/leaseStore.js';
import { MemoryBrowserRunStore } from '../workers/browserRunStore.js';
import { createLocalBrowserRouter } from './localBrowser.js';

const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';

test('local Chrome shares canonical ownership, turn fencing, cancellation and result storage', async t => {
  const env = {
    SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_JWT_SECRET: 'test-only-local-browser-signing-secret',
    SUPABASE_SERVICE_ROLE_KEY: '', REQUIRE_REMOTE_AUTH_CHECK: '0',
  };
  const before = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const tokenFor = (user: string) => new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' })
    .setSubject(user).setAudience('authenticated').setIssuer(`${env.SUPABASE_URL}/auth/v1`).setExpirationTime('2m')
    .sign(new TextEncoder().encode(env.SUPABASE_JWT_SECRET));
  const [ownerToken, otherToken] = await Promise.all([tokenFor(owner), tokenFor(other)]);
  const runs = new MemoryBrowserRunStore();
  const leases = new MemoryLeaseStore();
  const received: Array<{ runId: string; idempotency: string }> = [];
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use(createLocalBrowserRouter(() => ({ runs, leases }), async request => {
    await request.authority?.revalidate();
    assert.equal(request.modelId, 'deepseek_v4_1_flash_1017');
    assert.equal(request.platformCostCeiling, 3_000);
    assert.equal(request.body.stream, false);
    received.push({ runId: request.job.runId, idempotency: request.idempotencyKey });
    return { id: 'fixture-model', choices: [{ finish_reason: 'stop', message: { content: 'Read the catalog.' } }],
      usage: { prompt_tokens: 40, completion_tokens: 10, total_tokens: 50 } };
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const send = (path: string, method = 'GET', data?: unknown, crossTenant = false) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${crossTenant ? otherToken : ownerToken}` },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  try {
    assert.equal((await fetch(`http://127.0.0.1:${address.port}/session`)).status, 401);
    assert.deepEqual(await (await send('/session')).json(), { account: owner });
    const started = await send('/runs', 'POST', { goal: 'Compare items', startUrl: 'https://example.com/catalog' });
    assert.equal(started.status, 201);
    const { runId } = await started.json() as { runId: string };
    const path = `/runs/${runId}`;
    const request = { turn: 1, messages: [{ role: 'user', content: 'Read the catalog.' }] };
    assert.equal((await send(path, 'GET', undefined, true)).status, 404);
    assert.equal((await send(`${path}/turn`, 'POST', request, true)).status, 404);
    assert.deepEqual(await runs.listRecoverable(0, 10), []);
    assert.equal((await send(`${path}/turn`, 'POST', { ...request, messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://example.com/private.png' } }] }] })).status, 400);
    assert.equal((await send(`${path}/turn`, 'POST', { ...request, messages: [{ role: 'user', content: 'Bearer example-secret-token' }] })).status, 400);
    assert.equal(received.length, 0);
    assert.equal((await send(`${path}/turn`, 'POST', request)).status, 200);
    assert.equal((await send(`${path}/turn`, 'POST', request)).status, 409);
    assert.equal((await send(path, 'DELETE')).status, 200);
    assert.equal((await send(`${path}/turn`, 'POST', { ...request, turn: 2 })).status, 409);
    const finished = await send(`${path}/finish`, 'POST', { status: 'completed', result: 'Late result' });
    assert.equal(finished.status, 409);
    assert.equal((await send(`${path}/finish`, 'POST', { status: 'cancelled' })).status, 200);
    const snapshot = await (await send(path)).json() as { status: string; result: unknown };
    assert.equal(snapshot.status, 'cancelled');
    assert.equal(snapshot.result, null);
    assert.deepEqual(received.map(item => item.runId), [runId]);

    const extended = await send('/runs', 'POST', { goal: 'Read the attached specification', startUrl: 'https://example.com/', attachmentCount: 1 });
    const accepted = await extended.json() as { runId: string; maxTurns: number; remainingMs: number };
    assert.ok(accepted.maxTurns > 12);
    assert.equal(accepted.remainingMs, 90 * 60_000);
    const longPath = `/runs/${accepted.runId}`;
    for (let turn = 1; turn <= 15; turn++) {
      assert.equal((await send(`${longPath}/turn`, 'POST', { ...request, turn })).status, 200);
    }
    assert.equal((await send(`${longPath}/resume`, 'POST', {}, true)).status, 404);
    const resumed = await (await send(`${longPath}/resume`, 'POST', {})).json() as { runId: string; turns: number };
    assert.equal(resumed.runId, accepted.runId);
    assert.equal(resumed.turns, 15);
    assert.equal((await send(`${longPath}/turn`, 'POST', { ...request, turn: 15 })).status, 409);
    assert.equal((await send(`${longPath}/turn`, 'POST', { ...request, turn: 16 })).status, 200);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
