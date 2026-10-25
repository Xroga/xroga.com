import assert from 'node:assert/strict';
import test from 'node:test';
import { getComposioCatalogToolkit, listComposioCatalog } from './composioClient.js';

test('legacy Composio toolkit metadata is not mistaken for deprecation', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.COMPOSIO_API_KEY;
  process.env.COMPOSIO_API_KEY = 'fixture-only';
  const items = [
    { slug: 'gmail', name: 'Gmail', deprecated: { toolkitId: 'fixture-id', getCurrentUserEndpoint: '/me' } },
    { slug: 'retired_app', name: 'Retired App', deprecated: true },
    { slug: 'legacy_retired', name: 'Legacy Retired', is_deprecated: true },
  ];
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/toolkits')) return Response.json({ items });
    if (url.pathname.endsWith('/toolkits/gmail')) return Response.json(items[0]);
    throw new Error(`Unexpected toolkit URL: ${url.pathname}`);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = previousKey;
  });

  const catalog = await listComposioCatalog({ search: 'gmail', limit: 3 });
  assert.deepEqual(catalog.items.map((item) => [item.slug, item.deprecated]), [
    ['gmail', false], ['retired_app', true], ['legacy_retired', true],
  ]);
  const direct = await getComposioCatalogToolkit('gmail');
  assert.equal(direct.deprecated, false);
});
