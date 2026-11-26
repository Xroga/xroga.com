import assert from 'node:assert/strict';
import { test } from 'node:test';
import { API_URL } from './api';
import { publicConnectCatalogPage } from './publicConnectCatalog';

test('public catalog reads use only the configured platform origin without account credentials', async (t) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const expected = { ok: true, items: [], totalItems: 0 };
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(expected), { status: 200 });
  });
  assert.deepEqual(await publicConnectCatalogPage('a&redirect=https://untrusted.example'), expected);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  const destination = new URL(url);
  assert.equal(destination.origin, new URL(API_URL).origin);
  assert.equal(destination.pathname, '/api/public/integrations/catalog');
  assert.deepEqual([...destination.searchParams], [
    ['limit', '250'], ['sortBy', 'usage'], ['cursor', 'a&redirect=https://untrusted.example'],
  ]);
  assert.equal(init.method, 'GET');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.cache, 'default');
  assert.deepEqual(init.headers, { Accept: 'application/json' });
  assert.equal(init.body, undefined);
  assert.ok(init.signal instanceof AbortSignal);
  assert.equal(init.signal.aborted, false);
});

test('public catalog rejects unavailable and malformed responses without retrying', async (t) => {
  const responses = [
    new Response('', { status: 503 }),
    ...[
      { ok: false, items: [], totalItems: 0 },
      { ok: true, items: {}, totalItems: 0 },
      { ok: true, items: [], totalItems: -1 },
      { ok: true, items: [], totalItems: 1.5 },
    ].map(value => new Response(JSON.stringify(value), { status: 200 })),
  ];
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => responses[calls++]);
  await assert.rejects(publicConnectCatalogPage(), /PUBLIC_PLUGIN_CATALOG_UNAVAILABLE/);
  for (let i = 0; i < 4; i++) {
    await assert.rejects(publicConnectCatalogPage(), /INVALID_PUBLIC_PLUGIN_CATALOG/);
  }
  assert.equal(calls, 5);
});
