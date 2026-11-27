import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTenantContext } from '../../security/tenantContext.js';
import { explicitlyNamedConnectedToolkit, searchComposioTools } from './composioClient.js';

const connected = [
  { toolkit: 'googledocs', name: 'Google Docs' },
  { toolkit: 'googlesheets', name: 'Google Sheets' },
  { toolkit: 'canva', name: 'Canva' },
];

test('an explicitly named connected app is pinned before tool discovery', () => {
  assert.equal(
    explicitlyNamedConnectedToolkit('List three Google Sheets spreadsheets I own', connected),
    'googlesheets',
  );
  assert.equal(
    explicitlyNamedConnectedToolkit('Find my Canva designs', connected),
    'canva',
  );
});

test('multi-app and unnamed requests are not silently pinned to one app', () => {
  assert.equal(
    explicitlyNamedConnectedToolkit('Read Google Sheets and Google Docs', connected),
    undefined,
  );
  assert.equal(
    explicitlyNamedConnectedToolkit('Find my recent files', connected),
    undefined,
  );
});

test('tool search sends only the named app slug, even with several connected apps', async (t) => {
  const owner = '11111111-1111-4111-8111-111111111111';
  const context = createTenantContext({ userId: owner, via: 'remote_getuser' });
  const env = {
    COMPOSIO_API_KEY: 'synthetic-composio-key',
    SUPABASE_URL: 'https://explicit-toolkit-fixture.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-audit-store',
  };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  let searchQuery = '';
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === env.SUPABASE_URL) return Response.json(JSON.parse(String(init?.body)));
    if (url.pathname.endsWith('/toolkits')) return Response.json({ items: [
      { slug: 'googledocs', name: 'Google Docs', connected_account: { id: 'ca_docs', status: 'ACTIVE' } },
      { slug: 'googlesheets', name: 'Google Sheets', connected_account: { id: 'ca_sheets', status: 'ACTIVE' } },
    ] });
    if (url.pathname.endsWith('/search')) {
      searchQuery = JSON.parse(String(init?.body)).queries[0].use_case;
      return Response.json({ tool_schemas: {
        docs: { toolkit: 'googledocs', tool_slug: 'GOOGLEDOCS_SEARCH_DOCUMENTS', input_schema: { type: 'object' } },
        sheets: { toolkit: 'googlesheets', tool_slug: 'GOOGLESHEETS_SEARCH_SPREADSHEETS', input_schema: { type: 'object' } },
      } });
    }
    return Response.json({ session_id: 'trs_owned', config: { user_id: `xroga:${owner}`, tags: ['readOnlyHint'] } });
  });
  const result = await searchComposioTools(owner, {
    sessionId: 'trs_owned', query: 'Use Google Sheets to list spreadsheets', mode: 'read',
  }, context);
  assert.equal(result.explicitlyRequestedToolkit, 'googlesheets');
  assert.match(searchQuery, /for googlesheets:/);
  assert.doesNotMatch(searchQuery, /googledocs/);
});
