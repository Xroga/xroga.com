import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import express from 'express';
import { SignJWT } from 'jose';
import { authMiddleware } from '../middleware/auth.js';
import { MemoryLeaseStore } from '../workers/leaseStore.js';
import { MemoryBrowserRunStore } from '../workers/browserRunStore.js';
import { createLocalBrowserRouter } from './localBrowser.js';
import { setSandboxRuntimeForTesting } from '../sandbox/sandboxRuntime.js';

const owner = '00000000-0000-4000-8000-000000000001';

test('repo-change and the extended repo-run: device-gated, strictly validated, and "not run" (never a pass) when no isolated worker exists', async t => {
  const env = {
    SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_JWT_SECRET: 'test-only-local-browser-signing-secret', SUPABASE_SERVICE_ROLE_KEY: '', REQUIRE_REMOTE_AUTH_CHECK: '0',
    XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS: owner, XROGA_LOCAL_BROWSER_VISION_PROBE: '', ZURELAY_DEEPSEEK_VISION_VERIFIED: '',
  };
  const before = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } setSandboxRuntimeForTesting(null); });
  const token = await new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' }).setSubject(owner).setAudience('authenticated')
    .setIssuer(`${env.SUPABASE_URL}/auth/v1`).setExpirationTime('2m').sign(new TextEncoder().encode(env.SUPABASE_JWT_SECRET));
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use((req: import('./localBrowserDevice.js').BrowserDeviceRequest, _res, next) => {
    if (req.get('x-fixture-device') === '1') req.revalidateBrowserDevice = async () => true;
    next();
  });
  const runs = new MemoryBrowserRunStore(); const leases = new MemoryLeaseStore();
  app.use(createLocalBrowserRouter(() => ({ runs, leases }), async () => { throw new Error('no model call expected'); }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections?.(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const send = (path: string, data: unknown, device: boolean) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, ...(device ? { 'x-fixture-device': '1' } : {}) }, body: JSON.stringify(data),
  });
  const started = await send('/runs', { goal: 'Check a change', startUrl: 'https://example.com/' }, false);
  assert.equal(started.status, 201);
  const { runId } = await started.json() as { runId: string };
  const change = { url: 'https://github.com/o/r', ref: 'main', edits: [{ path: 'a.py', find: 'x', replace: 'y' }] };

  const noDevice = await send(`/runs/${runId}/repo-change`, change, false); assert.equal(noDevice.status, 403, 'no verified device, no execution: ' + await noDevice.text());
  assert.equal((await send(`/runs/${runId}/repo-change`, { ...change, edits: [] }, true)).status, 400, 'at least one edit');
  assert.equal((await send(`/runs/${runId}/repo-change`, { ...change, extra: 1 }, true)).status, 400, 'unknown fields are refused');
  assert.equal((await send(`/runs/${runId}/repo-change`, { ...change, edits: Array.from({ length: 11 }, () => change.edits[0]) }, true)).status, 400, 'at most ten edits');

  assert.equal((await send(`/runs/${runId}/repo-run`, { url: 'https://github.com/o/r', command: 'python3', dependencies: { ecosystem: 'gem', packages: [{ name: 'a', version: '1.0.0' }] } }, true)).status, 400, 'only pip and npm');
  assert.equal((await send(`/runs/${runId}/repo-run`, { url: 'https://github.com/o/r', command: 'python3', repositories: Array.from({ length: 4 }, () => ({ url: 'https://github.com/o/s', directory: 'd' })) }, true)).status, 400, 'at most three more repositories');

  // With no usable isolated worker, a valid request is "not run": a 503 that names the cause, not a result.
  setSandboxRuntimeForTesting({ name: 'none-available', probe: async () => ({ available: false, runtime: 'none-available', reason: 'runtime_unavailable', detail: 'no worker' }), execute: async () => { throw new Error('must not run'); } } as never);
  const unavailable = await send(`/runs/${runId}/repo-change`, change, true);
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json() as { reason: string }).reason, 'SANDBOX_UNAVAILABLE');
});
