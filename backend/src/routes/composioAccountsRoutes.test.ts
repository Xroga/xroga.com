import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { after, afterEach, before, describe, it } from 'node:test';

import express from 'express';

import { composioAccountsRouter } from './composioAccountsRoutes.js';

const USER = '11111111-1111-4111-8111-111111111111';
const real = globalThis.fetch;

describe('multi-account routes', () => {
  let server: ReturnType<typeof express.application.listen>;
  let base = '';
  let upstream: Array<{ method: string; url: URL; body: unknown }> = [];
  let items: unknown[] = [];

  before(async () => {
    process.env.COMPOSIO_API_KEY = 'test-key';
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      const who = req.header('x-test-user');
      if (who) (req as unknown as { userId: string }).userId = who;
      next();
    });
    app.use('/accounts', composioAccountsRouter);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/accounts`;
    // Only calls to Composio are intercepted; calls to this test server pass through.
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.hostname !== 'backend.composio.dev') return real(input, init);
      upstream.push({ method: init?.method ?? 'GET', url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return Response.json(init?.method === 'PATCH' ? {} : { items });
    }) as typeof fetch;
  });
  after(() => {
    globalThis.fetch = real;
    delete process.env.COMPOSIO_API_KEY;
    delete process.env.XROGA_COMPOSIO_MULTI_ACCOUNT;
    return new Promise((done) => server.close(done));
  });
  afterEach(() => {
    upstream = [];
    items = [];
    delete process.env.XROGA_COMPOSIO_MULTI_ACCOUNT;
  });

  const call = async (path: string, init: { method?: string; user?: string | null; body?: unknown } = {}) => {
    const response = await real(`${base}${path}`, {
      method: init.method ?? 'GET',
      headers: { 'content-type': 'application/json', ...(init.user === null ? {} : { 'x-test-user': init.user ?? USER }) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  const account = (id: string, extra: Record<string, unknown> = {}) => ({ id, toolkit: { slug: 'gmail' }, status: 'ACTIVE', alias: null, ...extra });

  it('reports multi-account as off and calls nothing while it is off', async () => {
    const result = await call('/?toolkit=gmail');
    assert.deepEqual(result.body, { ok: true, multiAccount: false, accounts: [] });
    assert.equal(upstream.length, 0);
    assert.equal((await call('/ca_aaaa', { method: 'PATCH', body: { toolkit: 'gmail', alias: 'work-gmail' } })).status, 403);
    assert.equal(upstream.length, 0);
  });

  it('lists only the caller\'s own accounts and sends the caller\'s identity upstream', async () => {
    process.env.XROGA_COMPOSIO_MULTI_ACCOUNT = 'enabled';
    items = [account('ca_mine1'), account('ca_shared', { experimental: { account_type: 'SHARED' } })];
    const result = await call('/?toolkit=gmail');
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.accounts.map((entry: { id: string }) => entry.id), ['ca_mine1']);
    assert.deepEqual(upstream[0].url.searchParams.getAll('user_ids'), [`xroga:${USER}`]);
  });

  it('a user cannot rename an account that is not in their own list', async () => {
    process.env.XROGA_COMPOSIO_MULTI_ACCOUNT = 'enabled';
    items = [account('ca_mine1')];
    const denied = await call('/ca_someone_else', { method: 'PATCH', body: { toolkit: 'gmail', alias: 'work-gmail' } });
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 'COMPOSIO_ACCOUNT_NOT_OWNED');
    assert.ok(!upstream.some((entry) => entry.method === 'PATCH'));
    const ok = await call('/ca_mine1', { method: 'PATCH', body: { toolkit: 'gmail', alias: 'work-gmail' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.account.alias, 'work-gmail');
  });

  it('rejects malformed input without calling Composio', async () => {
    process.env.XROGA_COMPOSIO_MULTI_ACCOUNT = 'enabled';
    assert.equal((await call('/')).status, 400);
    assert.equal((await call('/?toolkit=bad%20toolkit')).status, 400);
    assert.equal((await call('/ca_mine1', { method: 'PATCH', body: { toolkit: 'gmail', alias: 'x' } })).status, 400);
    assert.equal((await call('/ca_mine1', { method: 'PATCH', body: { toolkit: 'gmail' } })).status, 400);
    assert.equal(upstream.length, 0);
  });

  it('without an identity nothing reaches Composio', async () => {
    process.env.XROGA_COMPOSIO_MULTI_ACCOUNT = 'enabled';
    const result = await call('/?toolkit=gmail', { user: null });
    assert.ok([401, 502].includes(result.status), `status ${result.status}`);
    assert.equal(upstream.length, 0);
  });
});
