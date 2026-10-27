import assert from 'node:assert/strict';
import test from 'node:test';
import { listConnectedComposioToolkits } from './composioClient.js';

test('connected toolkit lookup stays within Composio session page limit', async (t) => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.COMPOSIO_API_KEY;
  const requested: URL[] = [];
  process.env.COMPOSIO_API_KEY = 'test-key';
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    requested.push(url);
    if (url.pathname.endsWith('/toolkits')) {
      if (Number(url.searchParams.get('limit')) > 50) {
        return Response.json({ message: 'limit must be less than or equal to 50' }, { status: 400 });
      }
      return Response.json({
        items: [{ slug: 'gmail', name: 'Gmail', connected_account: { id: 'ca_test', status: 'ACTIVE' } }],
      });
    }
    return Response.json({
      session_id: 'trs_test',
      config: {
        user_id: 'xroga:test-user',
        tags: ['readOnlyHint'],
        workbench: { enable: false, enable_proxy_execution: false },
        execute: { enable_multi_execute: false },
      },
    });
  }) as typeof fetch;
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.COMPOSIO_API_KEY;
    else process.env.COMPOSIO_API_KEY = previousKey;
  });

  const toolkits = await listConnectedComposioToolkits('test-user', {
    sessionId: 'trs_test',
    toolkits: ['gmail'],
  });
  assert.equal(toolkits[0]?.toolkit, 'gmail');
  const listing = requested.find((url) => url.pathname.endsWith('/toolkits'));
  assert.ok(listing);
  assert.equal(listing.searchParams.get('limit'), '50');
  assert.equal(listing.searchParams.get('toolkits'), 'gmail');
  assert.equal(listing.searchParams.get('is_connected'), 'true');
});
