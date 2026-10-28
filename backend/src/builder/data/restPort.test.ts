import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SupabasePortError } from './port.js';
import { createRestSupabasePort, type SupabaseTransport } from './restPort.js';

const TOKEN = 'sbp_oauth_token_value_for_contract_tests_only';
const REF = 'abcdefghij1234567890';

interface Recorded {
  method: string;
  path: string;
  body: unknown;
  token: string;
}

function api(handler: (request: Recorded) => { status: number; body?: unknown }): { transport: SupabaseTransport; requests: Recorded[] } {
  const requests: Recorded[] = [];
  const transport: SupabaseTransport = async (token, path, init) => {
    const recorded: Recorded = { method: (init?.method ?? 'GET').toUpperCase(), path, body: init?.body ? JSON.parse(String(init.body)) : undefined, token };
    requests.push(recorded);
    const result = handler(recorded);
    return new Response(result.body === undefined ? null : JSON.stringify(result.body), { status: result.status });
  };
  return { transport, requests };
}

describe('Supabase REST adapter', () => {
  it('lists projects and ignores malformed entries', async () => {
    const { transport } = api(() => ({ status: 200, body: [{ id: REF, name: 'App', organization_id: 'org1', region: 'us-east-1' }, { id: 'bad!', name: 'x' }] }));
    const projects = await createRestSupabasePort(transport).listProjects(TOKEN);
    assert.deepEqual(projects, [{ ref: REF, name: 'App', organizationId: 'org1', region: 'us-east-1' }]);
  });

  it('asks for the keys WITHOUT revealing secrets, and returns only the publishable key', async () => {
    const { transport, requests } = api(() => ({ status: 200, body: [{ name: 'service_role', type: 'secret', api_key: 'sb_secret_hidden' }, { name: 'default', type: 'publishable', api_key: 'sb_publishable_ok' }] }));
    const config = await createRestSupabasePort(transport).getPublicConfig(TOKEN, REF);
    assert.equal(requests[0].path, `/projects/${REF}/api-keys?reveal=false`);
    assert.deepEqual(config, { url: `https://${REF}.supabase.co`, publishableKey: 'sb_publishable_ok' });
    assert.ok(!JSON.stringify(config).includes('sb_secret'));
  });

  it('accepts the legacy anon key, and refuses when only secrets are returned', async () => {
    const legacy = api(() => ({ status: 200, body: [{ name: 'anon', type: 'legacyAnonKey', api_key: 'eyJ.anon.sig' }] }));
    assert.equal((await createRestSupabasePort(legacy.transport).getPublicConfig(TOKEN, REF)).publishableKey, 'eyJ.anon.sig');
    const onlySecret = api(() => ({ status: 200, body: [{ name: 'service_role', type: 'secret', api_key: 'sb_secret_x' }] }));
    await assert.rejects(createRestSupabasePort(onlySecret.transport).getPublicConfig(TOKEN, REF), (error) => error instanceof SupabasePortError && error.code === 'forbidden');
    const leaked = api(() => ({ status: 200, body: [{ name: 'anon', type: 'publishable', api_key: 'sb_secret_masquerading' }] }));
    await assert.rejects(createRestSupabasePort(leaked.transport).getPublicConfig(TOKEN, REF), SupabasePortError);
  });

  it('applies SQL as one transaction and sends the token only in the authorization channel', async () => {
    const { transport, requests } = api(() => ({ status: 201, body: [] }));
    await createRestSupabasePort(transport).applySql(TOKEN, REF, 'create table public.t (id int);');
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].path, `/projects/${REF}/database/query`);
    assert.match((requests[0].body as { query: string }).query, /^begin;\n[\s\S]*\ncommit;$/);
    for (const request of requests) {
      assert.equal(request.token, TOKEN);
      assert.ok(!request.path.includes(TOKEN) && !JSON.stringify(request.body).includes(TOKEN));
    }
  });

  it('marks a server error during apply as ambiguous, a rejected statement as not applied', async () => {
    const flaky = api(() => ({ status: 502 }));
    await assert.rejects(createRestSupabasePort(flaky.transport).applySql(TOKEN, REF, 'select 1;'), (error) => error instanceof SupabasePortError && error.ambiguous === true);
    const rejected = api(() => ({ status: 400, body: { message: 'syntax error with secret detail' } }));
    await assert.rejects(createRestSupabasePort(rejected.transport).applySql(TOKEN, REF, 'bad sql'), (error) => error instanceof SupabasePortError && error.code === 'invalid_sql' && !error.ambiguous && !error.message.includes('secret detail'));
    const down: SupabaseTransport = async () => { throw new Error('socket hang up'); };
    await assert.rejects(createRestSupabasePort(down).applySql(TOKEN, REF, 'select 1;'), (error) => error instanceof SupabasePortError && error.ambiguous === true);
  });

  it('maps account problems to precise errors', async () => {
    for (const [status, code] of [[401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [429, 'rate_limited']] as const) {
      const { transport } = api(() => ({ status }));
      await assert.rejects(createRestSupabasePort(transport).listProjects(TOKEN), (error) => error instanceof SupabasePortError && error.code === code, String(status));
    }
  });

  it('inspects the public schema read-only: tables with RLS state and comments, and signed-out grants', async () => {
    const { transport, requests } = api((request) => {
      const query = (request.body as { query: string }).query;
      if (query.includes('pg_class')) return { status: 200, body: [{ name: 'tasks', rls: true, comment: 'xroga:schema:tasks:v1' }, { name: 'open', rls: false, comment: null }] };
      return { status: 200, body: [{ table_name: 'open' }] };
    });
    const catalog = await createRestSupabasePort(transport).inspect(TOKEN, REF);
    assert.deepEqual(catalog.tables, [{ name: 'tasks', rls: true, comment: 'xroga:schema:tasks:v1' }, { name: 'open', rls: false, comment: null }]);
    assert.deepEqual(catalog.anonGrants, ['open']);
    for (const request of requests) assert.match((request.body as { query: string }).query, /^select /i, 'inspection only reads');
  });

  it('rejects a malformed project reference before any request is made', async () => {
    const { transport, requests } = api(() => ({ status: 200, body: [] }));
    const port = createRestSupabasePort(transport);
    for (const bad of ['', '../x', 'a b', 'UPPERCASE12345', 'short']) {
      await assert.rejects(port.getPublicConfig(TOKEN, bad), SupabasePortError, bad);
      await assert.rejects(port.applySql(TOKEN, bad, 'select 1;'), SupabasePortError, bad);
      await assert.rejects(port.inspect(TOKEN, bad), SupabasePortError, bad);
    }
    assert.equal(requests.length, 0);
  });
});
