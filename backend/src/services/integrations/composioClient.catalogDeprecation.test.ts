import assert from 'node:assert/strict';
import test from 'node:test';
import { getComposioCatalogToolkit, listComposioCatalog } from './composioClient.js';

test('legacy Composio toolkit metadata is not mistaken for deprecation', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.COMPOSIO_API_KEY;
  process.env.COMPOSIO_API_KEY = 'fixture-only';
  const requests:URL[]=[];
  const items = [
    { slug: 'gmail', name: 'Gmail', deprecated: { toolkitId: 'fixture-id', getCurrentUserEndpoint: '/me' } },
    { slug: 'retired_app', name: 'Retired App', deprecated: true },
    { slug: 'legacy_retired', name: 'Legacy Retired', is_deprecated: true },
  ];
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));requests.push(url);
    if (url.pathname.endsWith('/toolkits')) return Response.json({ items });
    if (url.pathname.endsWith('/toolkits/gmail')) return Response.json(items[0]);
    throw new Error(`Unexpected toolkit URL: ${url.pathname}`);
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = previousKey;
  });

  // Classification is tested against the complete fixture, independent of search.
  const catalog = await listComposioCatalog({ limit: 3 });
  assert.deepEqual(catalog.items.map((item) => [item.slug, item.deprecated]), [
    ['gmail', false], ['retired_app', true], ['legacy_retired', true],
  ]);
  const direct = await getComposioCatalogToolkit('gmail');
  assert.equal(direct.deprecated, false);
  const filtered=await listComposioCatalog({search:'gmail',limit:3});
  assert.deepEqual(filtered.items.map(item=>[item.slug,item.deprecated]),[['gmail',false]]);
  const privateSearch=await listComposioCatalog({search:'unreleased customer 918273',limit:3});
  assert.deepEqual(privateSearch.items,[]);
  assert.ok(requests.every(url=>!url.searchParams.has('search')&&!url.searchParams.has('query')&&!url.href.includes('918273')),'Raw catalog search stays local.');
});
