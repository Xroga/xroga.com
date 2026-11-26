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
const approvalId = '00000000-0000-4000-8000-000000000013';
const receiptId = '00000000-0000-4000-8000-000000000014';

test('changes through a connected app need discovery, an exact approval of their own, and are never destructive or financial', async t => {
  const env = {
    SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_JWT_SECRET: 'test-only-plugin-actions-signing-secret',
    SUPABASE_SERVICE_ROLE_KEY: '', REQUIRE_REMOTE_AUTH_CHECK: '0',
    XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS: `${owner},${other}`,
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
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  let revoked = false;
  const executed: string[] = [];
  const cancelled: string[] = [];
  const prepared: Array<{ toolSlug: string; summary: string; forced: boolean; arguments: unknown }> = [];
  app.use((req: import('./localBrowserDevice.js').BrowserDeviceRequest, _res, next) => {
    if (req.get('x-fixture-device') === '1') req.revalidateBrowserDevice = async () => !revoked;
    next();
  });
  type Adapter = NonNullable<Parameters<typeof createLocalBrowserRouter>[2]>;
  const adapter = {
    configured: () => true,
    discover: async () => ({ sessionId: 's', toolkits: [], tools: [] }),
    prepare: async () => { throw new Error('reads are not used here'); },
    confirm: async (_context: unknown, id: string, expected: { toolkit: string; toolSlug: string }) => {
      assert.equal(id, approvalId);
      // The saved plan names the toolkit in lower case; discovery may report it in any case.
      assert.equal(expected.toolkit, 'wordpress');
      executed.push(expected.toolSlug);
      return { confirmation: { receipt: { id: receiptId } }, execution: { toolSlug: expected.toolSlug, resultText: 'Created the draft post.' } };
    },
    cancel: async (_user: string, id: string) => { cancelled.push(id); },
    discoverActions: async (user: string) => {
      assert.equal(user, owner);
      return { sessionId: 'action-session', toolkits: [
        { toolkit: 'wordpress', connected: true, noAuth: false },
        { toolkit: 'notconnected', connected: false, noAuth: false },
      ], tools: [
        { slug: 'WORDPRESS_CREATE_DRAFT_POST', toolkit: 'WordPress', risk: 'write', description: 'Create a draft post', inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' } }, required: ['title'] } },
        { slug: 'WORDPRESS_LIST_POSTS', toolkit: 'wordpress', risk: 'read', inputSchema: {} },
        { slug: 'WORDPRESS_DELETE_POST', toolkit: 'wordpress', risk: 'destructive', inputSchema: {} },
        { slug: 'NOTCONNECTED_CREATE', toolkit: 'notconnected', risk: 'write', inputSchema: {} },
      ] };
    },
    prepareAction: async (input: { toolSlug?: string; fixedSelection?: { toolSlug: string; arguments: unknown; summary: string }; forceConfirmation?: boolean }) => {
      const selected = input.fixedSelection!;
      prepared.push({ toolSlug: selected.toolSlug, summary: selected.summary, forced: input.forceConfirmation === true, arguments: selected.arguments });
      return { status: 'ready', plan: { toolSlug: selected.toolSlug, toolkit: 'wordpress', risk: 'write', arguments: selected.arguments } };
    },
    createActionConfirmation: async () => ({
      id: approvalId, summary: 'Create a draft post (wordpress)', approval: { accountReference: 'fixture-wordpress-connection' },
      argumentsPreview: '{"title":"Hello"}',
    }),
  } as unknown as Adapter;
  app.use(createLocalBrowserRouter(() => ({ runs, leases }), async () => { throw new Error('no model here'); }, adapter));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const send = (path: string, method = 'GET', data?: unknown, crossTenant = false, device = true) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method, headers: { 'content-type': 'application/json', authorization: `Bearer ${crossTenant ? otherToken : ownerToken}`, ...(device ? { 'x-fixture-device': '1' } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  try {
    const started = await send('/runs', 'POST', { goal: 'Draft a post', startUrl: 'https://example.com/blog' });
    assert.equal(started.status, 201);
    const { runId } = await started.json() as { runId: string };
    const base = `/runs/${runId}`;
    const search = (device = true) => send(`${base}/plugin-action-search`, 'POST', { query: 'create a draft blog post' }, false, device);
    const act = (slug: string, args: unknown = { title: 'Hello' }) =>
      send(`${base}/plugin-act`, 'POST', { slug, arguments: args, request: 'Create the draft post' });
    const review = (decision: 'approve' | 'deny', crossTenant = false) =>
      send(`${base}/plugin-act-review`, 'POST', { approvalId, decision }, crossTenant);

    // Only the signed-in device can use it, and nothing is prepared before discovery.
    assert.equal((await search(false)).status, 403);
    assert.equal((await act('WORDPRESS_CREATE_DRAFT_POST')).status, 403);

    // Discovery offers only connected, non-read, non-destructive tools.
    const found = await search();
    assert.equal(found.status, 200);
    assert.deepEqual((await found.json() as { tools: { slug: string }[] }).tools.map(item => item.slug), ['WORDPRESS_CREATE_DRAFT_POST']);
    assert.equal((await search()).status, 409);

    // A tool that was not offered cannot be prepared, however it is asked for.
    for (const slug of ['WORDPRESS_DELETE_POST', 'WORDPRESS_LIST_POSTS', 'NOTCONNECTED_CREATE', 'SOMETHING_ELSE']) {
      assert.equal((await act(slug)).status, 403, slug);
    }
    assert.equal(prepared.length, 0);

    // Arguments the tool does not define, or a missing required one, are refused with the names before any approval exists.
    const bad = await act('WORDPRESS_CREATE_DRAFT_POST', { title: 'Hello', bogus: 1, search_type: 'x' });
    assert.equal(bad.status, 422);
    const badBody = await bad.json() as { error: string; unknown: string[]; missing: string[]; allowed: string[] };
    assert.deepEqual({ error: badBody.error, unknown: badBody.unknown, missing: badBody.missing }, { error: 'BROWSER_PLUGIN_ARGUMENTS_INVALID', unknown: ['bogus', 'search_type'], missing: [] });
    assert.deepEqual(badBody.allowed, ['title', 'content']);
    const lacking = await act('WORDPRESS_CREATE_DRAFT_POST', { content: 'x' });
    assert.equal(lacking.status, 422);
    assert.deepEqual((await lacking.json() as { missing: string[] }).missing, ['title']);
    assert.equal(prepared.length, 0);

    // The offered tool is prepared with the agent's arguments, always for individual confirmation, and nothing runs yet.
    const requested = await act('WORDPRESS_CREATE_DRAFT_POST');
    assert.equal(requested.status, 200);
    const approval = (await requested.json() as { approval: { id: string; account: string; argumentsPreview: string; risk: string } }).approval;
    assert.deepEqual(approval, { id: approvalId, summary: 'Create a draft post (wordpress)', account: 'fixture-wordpress-connection', argumentsPreview: '{"title":"Hello"}', risk: 'write' });
    assert.deepEqual(prepared, [{ toolSlug: 'WORDPRESS_CREATE_DRAFT_POST', summary: 'Create the draft post (WordPress)', forced: true, arguments: { title: 'Hello' } }]);
    assert.deepEqual(executed, []);

    // The same change is not requested twice, and a second one waits for the first approval.
    assert.equal((await act('WORDPRESS_CREATE_DRAFT_POST')).status, 409);

    // Another user, or a revoked device, cannot approve it.
    assert.equal((await review('approve', true)).status, 404);
    revoked = true;
    assert.equal((await review('approve')).status, 403);
    revoked = false;
    assert.deepEqual(executed, []);

    // Approving runs exactly that action once; the approval cannot be used again.
    const approved = await review('approve');
    assert.equal(approved.status, 200);
    assert.deepEqual(await approved.json(), { receiptId, result: 'Created the draft post.' });
    assert.deepEqual(executed, ['WORDPRESS_CREATE_DRAFT_POST']);
    assert.equal((await review('approve')).status, 409);
    assert.equal((await review('deny')).status, 409);
    assert.deepEqual(cancelled, []);
  } finally {
    server.close();
  }
});

test('the action routes are unavailable when a release has no action adapter', async t => {
  const env = {
    SUPABASE_URL: 'http://127.0.0.1:1', SUPABASE_JWT_SECRET: 'test-only-plugin-actions-signing-secret',
    SUPABASE_SERVICE_ROLE_KEY: '', REQUIRE_REMOTE_AUTH_CHECK: '0', XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS: owner,
  };
  const before = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const token = await new SignJWT({ role: 'authenticated' }).setProtectedHeader({ alg: 'HS256' }).setSubject(owner)
    .setAudience('authenticated').setIssuer(`${env.SUPABASE_URL}/auth/v1`).setExpirationTime('2m')
    .sign(new TextEncoder().encode(env.SUPABASE_JWT_SECRET));
  const app = express();
  app.use(express.json());
  app.use(authMiddleware);
  app.use((req: import('./localBrowserDevice.js').BrowserDeviceRequest, _res, next) => { req.revalidateBrowserDevice = async () => true; next(); });
  type Adapter = NonNullable<Parameters<typeof createLocalBrowserRouter>[2]>;
  const readOnly = { configured: () => true, discover: async () => ({ sessionId: 's', toolkits: [], tools: [] }), prepare: async () => { throw new Error('x'); },
    confirm: async () => { throw new Error('x'); }, cancel: async () => undefined } as unknown as Adapter;
  const store = { runs: new MemoryBrowserRunStore(), leases: new MemoryLeaseStore() };
  app.use(createLocalBrowserRouter(() => store, async () => { throw new Error('x'); }, readOnly));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const call = (path: string, data: unknown) => fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(data),
  });
  try {
    const started = await call('/runs', { goal: 'Draft', startUrl: 'https://example.com' });
    const { runId } = await started.json() as { runId: string };
    assert.equal((await call(`/runs/${runId}/plugin-action-search`, { query: 'create a post' })).status, 403);
  } finally {
    server.close();
  }
});
