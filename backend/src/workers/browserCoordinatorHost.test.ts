import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { browserHostConfiguration, createBrowserCoordinatorHost } from './browserCoordinatorHost.js';
import { signRequest } from './browserCoordinator.js';

const env = () => ({
  XROGA_RUNTIME_ROLE: 'browser-coordinator',
  XROGA_BROWSER_COORDINATOR_SECRET: 'fixture-signing-key-not-a-credential-'.repeat(2),
  XROGA_BROWSER_IMAGE: `us-east4-docker.pkg.dev/fixture/browser@sha256:${'a'.repeat(64)}`,
  XROGA_BROWSER_PROXY_IMAGE: `us-east4-docker.pkg.dev/fixture/proxy@sha256:${'b'.repeat(64)}`,
});

test('coordinator host refuses API role, privileged credentials, mutable images and unbounded concurrency', () => {
  for (const change of [
    { XROGA_RUNTIME_ROLE: 'canonical-worker' },
    { SUPABASE_SERVICE_ROLE_KEY: 'fixture-never-forwarded' },
    { DATABASE_URL: 'fixture-never-connected' },
    { OPENROUTER_API_KEY: 'fixture-never-dispatched' },
    { XROGA_BROWSER_COORDINATOR_SECRET: 'short' },
    { XROGA_BROWSER_IMAGE: 'browser:latest' },
    { XROGA_BROWSER_PROXY_IMAGE: 'proxy:latest' },
    { XROGA_BROWSER_HOST_MAX_CONCURRENT: '0' },
    { XROGA_BROWSER_HOST_MAX_CONCURRENT: '3' },
    { XROGA_BROWSER_HOST_MAX_CONCURRENT: '1.5' },
    { PORT: 'NaN' },
    { PORT: '0' },
    { XROGA_BROWSER_HOST_BIND: '0.0.0.0' },
    { XROGA_BROWSER_HOST_BIND: '8.8.8.8' },
  ]) assert.throws(() => browserHostConfiguration({ ...env(), ...change }));
});

test('coordinator host defaults to one bounded job and loopback, with private binding explicit', () => {
  const config = browserHostConfiguration(env());
  assert.equal(config.bind, '127.0.0.1');
  assert.equal(config.port, 8080);
  assert.equal(config.maxConcurrent, 1);
  assert.equal(browserHostConfiguration({ ...env(), XROGA_BROWSER_HOST_BIND: '10.91.0.5' }).bind, '10.91.0.5');
  createBrowserCoordinatorHost(env(), options => {
    assert.equal(options.aiChannel, 'chromium', 'Preserve the existing full-Chromium channel for Stagehand extensions');
    assert.equal(options.browserImage, env().XROGA_BROWSER_IMAGE);
    assert.equal(options.proxyImage, env().XROGA_BROWSER_PROXY_IMAGE);
    assert.equal(options.gateway, undefined, 'Provider keys and accounting stay in the API');
    return { run: async () => { throw new Error('not started'); } };
  });
});

test('real coordinator listener keeps HMAC authentication and rejects invalid jobs before container dispatch', async () => {
  let constructed = 0;
  let runs = 0;
  const { server } = createBrowserCoordinatorHost(env(), () => {
    constructed++;
    return { run: async () => { runs++; throw new Error('must not dispatch'); } };
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  const send = (headers: Record<string, string>, body = '{}') => new Promise<number>(resolve => {
    const r = request({ hostname: '127.0.0.1', port, method: 'POST', path: '/v1/jobs', headers }, res => {
      res.resume(); res.on('end', () => resolve(res.statusCode!));
    });
    r.end(body);
  });
  try {
    assert.equal(await send({}), 401);
    assert.equal(await send(signRequest(env().XROGA_BROWSER_COORDINATOR_SECRET, 'POST', '/v1/jobs', '{}')), 400);
    const job = {
      version: 1, tenantId: 'tenant', userId: 'owner', projectId: 'project', runId: 'run', taskId: 'task', attempt: 1,
      allowedOrigins: ['https://example.com'], startUrl: 'https://example.com/',
      limits: { maxDurationMs: 60_000, maxNavigations: 5, maxRedirects: 1, maxPages: 1,
        maxResponseBytes: 1_000_000, maxArtifactBytes: 1_000_000, maxModelCostMicros: 0 },
    };
    for (const lease of [
      { workerId: 'worker', token: 1, expiresAt: Date.now() - 1 },
      { workerId: 'worker', token: 0, expiresAt: Date.now() + 60_000 },
      { workerId: 'worker', token: 1, expiresAt: null },
    ]) {
      const body = JSON.stringify({ job, plan: { steps: [{ op: 'screenshot', name: 'page.png' }], expect: [] }, lease });
      assert.equal(await send(signRequest(env().XROGA_BROWSER_COORDINATOR_SECRET, 'POST', '/v1/jobs', body), body), 400);
    }
    assert.equal(constructed, 1);
    assert.equal(runs, 0);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('invalid host configuration cannot initialize the Docker worker', () => {
  let constructed = false;
  assert.throws(() => createBrowserCoordinatorHost({ ...env(), SUPABASE_SERVICE_ROLE_KEY: 'fixture' }, () => {
    constructed = true;
    throw new Error('not reached');
  }));
  assert.equal(constructed, false);
});
