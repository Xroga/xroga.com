import assert from 'node:assert/strict';
import test from 'node:test';
import {
  probeVercelApiCapabilities,
  vercelCredentialCanDeploy,
  verifyVercelPersonalTokenForDeploy,
} from './vercelAuth.js';

test('identity grants never claim deploy readiness from read-only list endpoints', () => {
  const readable = { canListProjects: true, canReadDeployments: true };
  assert.equal(vercelCredentialCanDeploy('sign_in_with_vercel', readable), false);
  assert.equal(vercelCredentialCanDeploy('personal_token', readable), true);
  assert.equal(vercelCredentialCanDeploy('integration_oauth', readable), true);
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

test('personal token verification explains account-scope rejection before saving', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input) => {
    assert.match(String(input), /\/v2\/user/);
    return new Response('not found', { status: 404 });
  }) as typeof fetch;

  assert.deepEqual(await verifyVercelPersonalTokenForDeploy('team-token'), {
    ok: false,
    reason: 'account_scope_required',
    status: 404,
  });
});

test('personal token verification rejects credentials without deployment reads', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes('/v2/user')) {
      return new Response('{"user":{"username":"xroga","id":"user_1"}}', { status: 200 });
    }
    if (url.includes('/v9/projects')) return new Response('{"projects":[]}', { status: 200 });
    if (url.includes('/v6/deployments')) return new Response('forbidden', { status: 403 });
    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;

  assert.deepEqual(await verifyVercelPersonalTokenForDeploy('read-only-token'), {
    ok: false,
    reason: 'deploy_access_required',
    capability: {
      canListProjects: true,
      canReadDeployments: false,
    },
  });
});

test('personal token verification returns owner only after deployment checks pass', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes('/v2/user')) {
      return new Response('{"user":{"username":"xroga","id":"user_1"}}', { status: 200 });
    }
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  assert.deepEqual(await verifyVercelPersonalTokenForDeploy('deploy-token'), {
    ok: true,
    username: 'xroga',
    providerUserId: 'user_1',
  });
});
