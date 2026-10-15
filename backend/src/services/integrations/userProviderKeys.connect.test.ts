import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createTenantContext, type TenantContext } from '../../security/tenantContext.js';
import { connectUserSupabase, deleteUserProviderKey, getUserSupabaseStatus } from './userProviderKeys.js';

test('manual Supabase connection binds all writes before yielding and reports only verified provisioning', async () => {
  const context = createTenantContext({ userId: '11111111-1111-4111-8111-111111111111', via: 'remote_getuser' });
  const originalFetch = globalThis.fetch;
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'USER_SECRETS_ENCRYPTION_KEY'];
  const before = names.map(name => process.env[name]);
  process.env.SUPABASE_URL = 'https://credential-fixture.invalid';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-key';
  process.env.USER_SECRETS_ENCRYPTION_KEY = 'synthetic-encryption-fixture-not-a-secret';
  const revisions = new Map<string, string>();
  const rows = new Map<string, Record<string, unknown>>();
  let prepares = 0, writes = 0, external = 0, io = 0, defer = true;
  let privateBucketAvailable = false;
  let inventoryFailure = '';
  let release: () => void = () => {};
  let reached: () => void = () => {};
  const waiting = new Promise<void>(resolve => { reached = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  globalThis.fetch = async (input, init) => {
    io++;
    const url = new URL(String(input instanceof Request ? input.url : input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.host !== 'credential-fixture.invalid') {
      external++;
      assert.equal(url.host, 'fixtureproject.supabase.co');
      if (privateBucketAvailable) return reply([{ id: 'xroga-uploads', public: false }]);
      return reply({ message: 'synthetic denied' }, 403);
    }
    if (url.pathname.endsWith('/prepare_provider_key_write')) {
      prepares++;
      assert.equal(body.p_owner_id, context.userId);
      const revision = revisions.get(body.p_provider) ?? randomUUID();
      revisions.set(body.p_provider, revision);
      return reply(revision);
    }
    if (url.pathname.endsWith('/save_provider_key_if_current')) {
      writes++;
      assert.equal(body.p_owner_id, context.userId);
      if (defer && body.p_provider === 'apikey_supabase_anon') { reached(); await gate; }
      const accepted = revisions.get(body.p_provider) === body.p_revision;
      if (accepted) {
        revisions.set(body.p_provider, randomUUID());
        rows.set(body.p_provider, { provider: body.p_provider, access_token: body.p_access_token, metadata: body.p_metadata });
      }
      return reply(accepted);
    }
    if (url.pathname.endsWith('/revoke_provider_key')) {
      revisions.set(body.p_provider, randomUUID()); rows.delete(body.p_provider); return reply(true);
    }
    if (url.pathname === '/rest/v1/user_integrations') {
      const provider = url.searchParams.get('provider');
      if (provider?.startsWith('in.')) {
        if (inventoryFailure === 'outage') return reply({ message: 'synthetic unavailable' }, 503);
        if (inventoryFailure === 'malformed') return reply({});
        return reply([...revisions].filter(([name]) => provider.slice(4, -1).split(',').includes(name)).map(([name, revision]) => ({
        user_id: context.userId, provider: name, access_token: '', metadata: { revoked: true },
        ...rows.get(name), credential_revision: inventoryFailure === 'revision' ? randomUUID() : revision,
      })));
      }
      return reply(provider?.startsWith('like.') ? [...rows.values()] : []);
    }
    if (url.pathname === '/storage/v1/bucket') return reply([{ id: 'xroga-github-tokens', public: false }]);
    if (url.pathname.startsWith('/storage/')) return reply({});
    throw new Error(`Unexpected fixture path ${url.pathname}`);
  };
  try {
    const request = { projectUrl: 'https://fixtureproject.supabase.co', anonKey: 'SYNTHETIC_ANON_KEY_LONG', serviceRoleKey: 'SYNTHETIC_SERVICE_KEY_LONG', accessToken: 'SYNTHETIC_ACCESS_TOKEN_LONG', dbPassword: 'synthetic-password' };
    for (const forged of [context.userId, { ...context }, null]) {
      await assert.rejects(connectUserSupabase(forged as TenantContext, request));
    }
    assert.equal(io, 0);
    const jwt = (ref: unknown) => `e30.${Buffer.from(JSON.stringify({ ref })).toString('base64url')}.signature`;
    for (const field of ['anonKey', 'serviceRoleKey']) {
      await assert.rejects(connectUserSupabase(context, { ...request, [field]: jwt('otherproject') }), /does not match/);
    }
    assert.equal(io, 0, 'Known legacy ref mismatches fail before admission');
    const pending = connectUserSupabase(context, request);
    const denied = assert.rejects(pending, { code: 'CREDENTIAL_WRITE_CONFLICT' });
    await waiting;
    assert.equal(prepares, 5, 'All bundle keys admitted before any persistence');
    request.serviceRoleKey = 'MUTATED_KEY';
    for (const provider of ['supabase_url', 'supabase_anon', 'supabase', 'supabase_pat', 'supabase_db_password']) await deleteUserProviderKey(context, provider);
    release(); await denied;
    assert.equal(prepares, 5); assert.equal(writes, 2); assert.equal(rows.size, 0); assert.equal(external, 0);
    defer = false;
    const keysOnly = await connectUserSupabase(context, { projectUrl: request.projectUrl, anonKey: request.anonKey });
    assert.equal(keysOnly.status.provisioned, false);
    assert.equal(keysOnly.status.hasUrl, true); assert.equal(keysOnly.status.hasAnonKey, true);
    const failed = await connectUserSupabase(context, { projectUrl: request.projectUrl, anonKey: request.anonKey, serviceRoleKey: 'SYNTHETIC_SERVICE_KEY_LONG' });
    assert.equal(failed.provision?.ok, false); assert.equal(failed.status.provisioned, false);
    assert.equal(failed.status.ready, true);
    rows.set('apikey_supabase_pat', { provider: 'apikey_supabase_pat', metadata: { provider: 'supabase_pat' } });
    rows.set('apikey_supabase_db_password', { provider: 'apikey_supabase_db_password', access_token: 'synthetic-active-ciphertext', metadata: { provider: 'supabase_db_password' } });
    const status = await getUserSupabaseStatus(context.userId);
    assert.equal(status.provisioned, false); assert.equal(status.ready, true);
    assert.equal(status.hasAccessToken, true); assert.equal(status.hasDbPassword, true);
    assert.match(status.message, /not been verified/);
    privateBucketAvailable = true;
    const storageOnly = await connectUserSupabase(context, { projectUrl: request.projectUrl, anonKey: request.anonKey, serviceRoleKey: 'SYNTHETIC_SERVICE_KEY_LONG' });
    assert.equal(storageOnly.provision?.ok, true);
    assert.equal(storageOnly.provision?.schemaApplied, false);
    assert.equal(storageOnly.status.provisioned, false, 'A private bucket alone does not prove schema provisioning');
    const changing = { projectUrl: 'https://otherproject.supabase.co', anonKey: 'sb_publishable_synthetic_opaque' };
    const beforeBlocked = writes;
    await assert.rejects(connectUserSupabase(context, changing), /Disconnect the existing/);
    assert.equal(writes, beforeBlocked, 'Omitted active service credential cannot carry into another project');
    rows.delete('apikey_supabase');
    await assert.rejects(connectUserSupabase(context, changing), /Disconnect the existing/);
    assert.equal(writes, beforeBlocked, 'Omitted active database password cannot carry into another project');
    rows.delete('apikey_supabase_db_password');
    for (const failure of ['outage', 'malformed', 'revision']) {
      inventoryFailure = failure;
      await assert.rejects(connectUserSupabase(context, changing));
      assert.equal(writes, beforeBlocked, 'Unverified or stale inventory cannot mutate the bundle');
    }
    inventoryFailure = '';
    const patOnly = await connectUserSupabase(context, changing);
    assert.equal(patOnly.status.hasAccessToken, true, 'Account-scoped PAT may remain without project-specific credentials');
    assert.equal(patOnly.status.hasUrl, true);
    await connectUserSupabase(context, { ...changing, anonKey: jwt('otherproject') });
  } finally {
    release(); globalThis.fetch = originalFetch;
    names.forEach((name, index) => { if (before[index] === undefined) delete process.env[name]; else process.env[name] = before[index]; });
  }
});
