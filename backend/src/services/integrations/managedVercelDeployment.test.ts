import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deployToAllPlatforms,
  hasManagedVercelDeployment,
  managedVercelProjectName,
} from './githubDeploy.js';

const STATIC_SITE = [
  {
    path: 'index.html',
    content: '<!DOCTYPE html><html><body><h1>Coffee for curious minds</h1></body></html>',
  },
];

test('managed Vercel names are stable per user and isolated across users', () => {
  const first = managedVercelProjectName('Orbit Coffee', 'user-a');
  assert.equal(first, managedVercelProjectName('Orbit Coffee', 'user-a'));
  assert.notEqual(first, managedVercelProjectName('Orbit Coffee', 'user-b'));
  assert.match(first, /^xroga-orbit-coffee-[a-f0-9]{8}$/);
  assert.ok(first.length <= 40);
});

test('a user without a Vercel token deploys through Xroga managed Vercel', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalVercel = process.env.VERCEL_API_KEY;
  const originalTeam = process.env.VERCEL_TEAM_ID;
  process.env.VERCEL_API_KEY = 'platform-test-token';
  process.env.VERCEL_TEAM_ID = 'team_test';
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalVercel === undefined) delete process.env.VERCEL_API_KEY;
    else process.env.VERCEL_API_KEY = originalVercel;
    if (originalTeam === undefined) delete process.env.VERCEL_TEAM_ID;
    else process.env.VERCEL_TEAM_ID = originalTeam;
  });

  const calls: Array<{ url: string; method: string; body?: string }> = [];
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ url, method, body: typeof init?.body === 'string' ? init.body : undefined });
    if (method === 'POST' && url.includes('/v13/deployments')) {
      return new Response(JSON.stringify({ id: 'dpl_managed', url: 'orbit-test.vercel.app' }), {
        status: 200,
      });
    }
    if (url.includes('/v13/deployments/dpl_managed')) {
      return new Response(
        JSON.stringify({
          id: 'dpl_managed',
          url: 'orbit-test.vercel.app',
          readyState: 'READY',
          alias: ['orbit-test.vercel.app'],
        }),
        { status: 200 },
      );
    }
    if (url === 'https://orbit-test.vercel.app') {
      return new Response(STATIC_SITE[0]!.content, {
        status: 200,
        headers: { 'content-type': 'text/html' },
      });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  }) as typeof fetch;

  assert.equal(hasManagedVercelDeployment(), true);
  const result = await deployToAllPlatforms('Orbit Coffee', STATIC_SITE, undefined);
  assert.equal(result.deployPlatform, 'vercel');
  assert.equal(result.deployVerified, true);
  assert.equal(result.vercel?.authority, 'managed');
  assert.equal(result.deployUrl, 'https://orbit-test.vercel.app');
  const create = calls.find((call) => call.method === 'POST');
  assert.ok(create);
  assert.equal(JSON.parse(create.body ?? '{}').name, 'orbit-coffee');
  assert.equal(calls.some((call) => call.url.includes('netlify.com')), false);
});

test('managed Vercel failure is reported truthfully without a Netlify substitution', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalVercel = process.env.VERCEL_API_KEY;
  const originalNetlify = process.env.NETLIFY_ACCESS_TOKEN;
  process.env.VERCEL_API_KEY = 'platform-test-token';
  process.env.NETLIFY_ACCESS_TOKEN = 'netlify-test-token';
  t.after(() => {
    globalThis.fetch = originalFetch;
    if (originalVercel === undefined) delete process.env.VERCEL_API_KEY;
    else process.env.VERCEL_API_KEY = originalVercel;
    if (originalNetlify === undefined) delete process.env.NETLIFY_ACCESS_TOKEN;
    else process.env.NETLIFY_ACCESS_TOKEN = originalNetlify;
  });

  const urls: string[] = [];
  globalThis.fetch = (async (input) => {
    urls.push(String(input));
    return new Response('deployment rejected', { status: 403 });
  }) as typeof fetch;

  const result = await deployToAllPlatforms('orbit-coffee', STATIC_SITE, undefined);
  assert.equal(result.deployPlatform, 'none');
  assert.equal(result.deployUrl, '');
  assert.match(result.deployError ?? '', /Managed Vercel: Vercel deploy failed: 403/i);
  assert.equal(urls.some((url) => url.includes('netlify.com')), false);
});
