import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deployToAllPlatforms,
  hasManagedVercelDeployment,
  isManagedVercelCredentialCandidate,
  managedVercelProjectName,
} from './githubDeploy.js';

const STATIC_SITE = [
  {
    path: 'index.html',
    content: '<!DOCTYPE html><html><body><h1>Coffee for curious minds</h1></body></html>',
  },
];

test('managed Vercel never treats a product API key as deployment authority', () => {
  assert.equal(isManagedVercelCredentialCandidate(), false);
  assert.equal(isManagedVercelCredentialCandidate('vck_example'), false);
  assert.equal(isManagedVercelCredentialCandidate('vcp_example'), true);
  assert.equal(isManagedVercelCredentialCandidate('vci_example'), true);
  assert.equal(isManagedVercelCredentialCandidate('legacy-token'), true);
});

test('managed Vercel uses the existing Xroga project instead of creating user projects', (t) => {
  const original = process.env.VERCEL_MANAGED_PROJECT_NAME;
  t.after(() => {
    if (original === undefined) delete process.env.VERCEL_MANAGED_PROJECT_NAME;
    else process.env.VERCEL_MANAGED_PROJECT_NAME = original;
  });

  delete process.env.VERCEL_MANAGED_PROJECT_NAME;
  assert.equal(managedVercelProjectName(), 'xroga-managed-builds');
  process.env.VERCEL_MANAGED_PROJECT_NAME = ' Xroga Managed Builds ';
  assert.equal(managedVercelProjectName(), 'xroga-managed-builds');
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
    if (method === 'PATCH' && url.includes('/v9/projects/xroga-managed-builds')) {
      return new Response(JSON.stringify({ name: 'xroga-managed-builds', ssoProtection: null }), {
        status: 200,
      });
    }
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
  const body = JSON.parse(create.body ?? '{}');
  assert.equal(body.name, 'xroga-managed-builds');
  assert.equal('target' in body, false);
  const protection = calls.find(
    (call) => call.method === 'PATCH' && call.url.includes('/v9/projects/xroga-managed-builds'),
  );
  assert.ok(protection);
  assert.deepEqual(JSON.parse(protection.body ?? '{}'), { ssoProtection: null });
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
  globalThis.fetch = (async (input, init) => {
    const url = String(input);
    urls.push(url);
    if ((init?.method ?? 'GET') === 'PATCH' && url.includes('/v9/projects/xroga-managed-builds')) {
      return new Response(JSON.stringify({ name: 'xroga-managed-builds', ssoProtection: null }), {
        status: 200,
      });
    }
    return new Response('deployment rejected', { status: 403 });
  }) as typeof fetch;

  const result = await deployToAllPlatforms('orbit-coffee', STATIC_SITE, undefined);
  assert.equal(result.deployPlatform, 'none');
  assert.equal(result.deployUrl, '');
  assert.match(result.deployError ?? '', /Managed Vercel: Vercel deploy failed: 403/i);
  assert.equal(urls.some((url) => url.includes('netlify.com')), false);
});

test('managed Vercel never reports a protected login page as a verified preview', async (t) => {
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

  const calls: string[] = [];
  globalThis.fetch = (async (input) => {
    calls.push(String(input));
    return new Response('project protection could not be changed', { status: 403 });
  }) as typeof fetch;

  const result = await deployToAllPlatforms('orbit-coffee', STATIC_SITE, undefined);
  assert.equal(result.deployPlatform, 'none');
  assert.equal(result.deployUrl, '');
  assert.equal(result.deployVerified, false);
  assert.match(result.deployError ?? '', /managed preview publishing setup failed: 403/i);
  assert.equal(calls.some((url) => url.includes('/v13/deployments')), false);
});
