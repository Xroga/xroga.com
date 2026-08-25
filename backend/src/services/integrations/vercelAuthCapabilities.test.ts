import assert from 'node:assert/strict';
import test from 'node:test';
import {
  probeVercelApiCapabilities,
  vercelCredentialCanDeploy,
} from './vercelAuth.js';

test('Vercel App OAuth credentials become deploy ready when App API permissions are available', () => {
  const readable = { canListProjects: true, canReadDeployments: true };
  assert.equal(vercelCredentialCanDeploy('sign_in_with_vercel', readable), true);
  assert.equal(vercelCredentialCanDeploy('personal_token', readable), true);
  assert.equal(vercelCredentialCanDeploy('integration_oauth', readable), true);
});

test('all credential kinds fail closed when either required API is unavailable', () => {
  const projectOnly = { canListProjects: true, canReadDeployments: false };
  const deploymentOnly = { canListProjects: false, canReadDeployments: true };
  assert.equal(vercelCredentialCanDeploy('sign_in_with_vercel', projectOnly), false);
  assert.equal(vercelCredentialCanDeploy('sign_in_with_vercel', deploymentOnly), false);
});

test('deploy readiness rejects identity-only tokens that can list projects', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes('/v9/projects')) return new Response('{"projects":[]}', { status: 200 });
    if (url.includes('/v6/deployments')) return new Response('forbidden', { status: 403 });
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;

  assert.deepEqual(await probeVercelApiCapabilities('identity-token'), {
    canListProjects: true,
    canReadDeployments: false,
  });
});

test('deploy readiness requires both project and deployment access', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async () => new Response('{}', { status: 200 })) as typeof fetch;

  assert.deepEqual(await probeVercelApiCapabilities('deploy-token'), {
    canListProjects: true,
    canReadDeployments: true,
  });
});

test('deploy readiness fails closed when either capability probe errors', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) throw new Error('network down');
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  assert.deepEqual(await probeVercelApiCapabilities('partial-token'), {
    canListProjects: false,
    canReadDeployments: true,
  });
});
