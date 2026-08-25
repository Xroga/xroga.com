import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureVercelGitProject } from './githubDeploy.js';

test('keeps an existing matching GitHub-linked Vercel project', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const calls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    calls.push(`${init?.method ?? 'GET'} ${String(input)}`);
    return new Response(
      JSON.stringify({ link: { type: 'github', org: 'Xroga', repo: 'client-product' } }),
      { status: 200 },
    );
  }) as typeof fetch;

  const result = await ensureVercelGitProject({
    token: 'oauth-access-token',
    projectName: 'client-product',
    githubRepo: 'Xroga/client-product',
  });

  assert.deepEqual(result, {
    created: false,
    linked: true,
    projectName: 'client-product',
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!, /^GET /);
});

test('creates a team-scoped project linked to the generated GitHub repository', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    calls.push({ url: String(input), init });
    if (!init?.method) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify({ id: 'prj_1', name: 'customer-analytics' }), {
      status: 200,
    });
  }) as typeof fetch;

  const result = await ensureVercelGitProject({
    token: 'oauth-access-token',
    projectName: 'customer-analytics',
    githubRepo: 'customer/customer-analytics',
    teamId: 'team_123',
    framework: 'nextjs',
  });

  assert.deepEqual(result, {
    created: true,
    linked: true,
    projectName: 'customer-analytics',
  });
  assert.equal(calls.length, 2);
  assert.equal(
    calls[1]?.url,
    'https://api.vercel.com/v11/projects?teamId=team_123',
  );
  assert.equal(calls[1]?.init?.method, 'POST');
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    name: 'customer-analytics',
    framework: 'nextjs',
    gitRepository: { type: 'github', repo: 'customer/customer-analytics' },
  });
});

test('returns a non-fatal Git-link error so explicit OAuth deployment can continue', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return calls === 1
      ? new Response('not found', { status: 404 })
      : new Response(
          JSON.stringify({
            error: {
              message: 'Install the Vercel GitHub Integration for this repository first',
            },
          }),
          { status: 403 },
        );
  }) as typeof fetch;

  const result = await ensureVercelGitProject({
    token: 'oauth-access-token',
    projectName: 'client-product',
    githubRepo: 'customer/client-product',
  });

  assert.equal(result.created, false);
  assert.equal(result.linked, false);
  assert.match(result.error ?? '', /could not create the Git-linked project \(403\)/i);
});
