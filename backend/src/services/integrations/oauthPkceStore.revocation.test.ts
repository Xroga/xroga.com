import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { clearPkceSession, clearProviderToken, loadProviderToken, storePkceSession, storeProviderToken } from './oauthPkceStore.js';
import { getUserPluginPermissionMode, setUserPluginPermissionMode } from './pluginPermissionPolicy.js';
import { getSupabaseOAuthAccessToken } from './supabaseAuth.js';
import { createTenantContext } from '../../security/tenantContext.js';
const context=createTenantContext({userId:'11111111-1111-4111-8111-111111111111',via:'remote_getuser'});

test('shared OAuth requires authority, persists revocation and rejects path traversal before I/O', async () => {
  const calls: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];
  const rows = new Map<string, Record<string, unknown>>();
  let outage = false, cleanupFailure = false, toolkitOutage = false;
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; });
    req.on('end', () => {
      const url = new URL(req.url ?? '', 'http://127.0.0.1');
      const body = raw ? JSON.parse(raw) : {};
      calls.push({ path: url.pathname, method: req.method ?? '', body });
      const storage = url.pathname.startsWith('/storage/');
      const fail = outage || (toolkitOutage && url.searchParams.get('provider') === 'eq.xroga_plugin_permission_policy__github') || (storage && cleanupFailure && req.method === 'DELETE');
      res.writeHead(fail ? 400 : 200, { 'Content-Type': 'application/json' });
      if (fail) return res.end(JSON.stringify({ message: 'SYNTHETIC_PRIVATE_FAILURE', code: '42P01' }));
      if (url.pathname === '/storage/v1/bucket') return res.end(JSON.stringify([{ id: 'xroga-github-tokens', public: false }]));
      if (storage) return res.end(JSON.stringify({ access_token: 'stale', verifier: 'stale', state: 'state' }));
      if (url.pathname === '/rest/v1/rpc/begin_oauth_session') {
        rows.set(`${body.p_owner_id}/${body.p_provider}`, { user_id:body.p_owner_id, provider:body.p_provider,
          access_token:body.p_session.verifier, metadata:body.p_session });
        return res.end('true');
      }
      if (url.pathname === '/rest/v1/rpc/save_oauth_connection') {
        const key=`${body.p_owner_id}/${body.p_provider}`,current=rows.get(key);
        if (!current || current.credential_revision!==body.p_revision
          || (body.p_expected_refresh_token!=null && current.refresh_token!==body.p_expected_refresh_token)) return res.end('false');
        rows.set(key,{...current,access_token:body.p_access_token,refresh_token:body.p_refresh_token,
          metadata:body.p_metadata,credential_revision:randomUUID()});return res.end('true');
      }
      if (req.method === 'POST') {
        rows.set(`${body.user_id}/${body.provider}`, body);
        return res.end('null');
      }
      const key = `${url.searchParams.get('user_id')?.slice(3)}/${url.searchParams.get('provider')?.slice(3)}`;
      if (req.method === 'PATCH') {
        const current = rows.get(key);
        if (current?.refresh_token !== url.searchParams.get('refresh_token')?.slice(3)) return res.end('[]');
        rows.set(key, { ...current, ...body });
      }
      return res.end(JSON.stringify(rows.has(key) ? [rows.get(key)] : []));
    });
  });
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_DB_PASSWORD'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  const originalFetch = globalThis.fetch;
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const session = { verifier: 'verifier', state: 'state', redirect_uri: 'http://127.0.0.1/callback', created_at: new Date().toISOString() };
  try {
    for (const key of keys) delete process.env[key];
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    await assert.rejects(storeProviderToken('owner', '../foreign', { access_token: 'token' }), /Invalid OAuth storage identity/);
    await assert.rejects(clearPkceSession(context, '../provider'), /Invalid OAuth storage identity/);
    assert.equal(calls.length, 0);
    outage = true;
    assert.equal(await getUserPluginPermissionMode('owner', 'github'), 'always_ask');
    await assert.rejects(storeProviderToken('owner', 'provider', { access_token: 'token' }), /could not be saved/);
    await assert.rejects(storePkceSession(context, 'supabase_oauth_pkce', session), /could not be saved/);
    await assert.rejects(clearProviderToken('owner', 'provider'), /could not be recorded/);
    await assert.rejects(clearPkceSession(context, 'supabase_oauth_pkce'), /could not be recorded/);
    assert.ok(calls.every(call => call.path === '/rest/v1/user_integrations' || call.path === '/rest/v1/rpc/begin_oauth_session'));
    outage = false;
    assert.equal(await getUserPluginPermissionMode('owner', 'github'), 'low_risk');
    await setUserPluginPermissionMode('owner', 'full_access');
    assert.equal(await getUserPluginPermissionMode('owner', 'github'), 'full_access');
    toolkitOutage = true;
    calls.length = 0;
    assert.equal(await getUserPluginPermissionMode('owner', 'github'), 'always_ask');
    assert.equal(calls.length, 1, 'unavailable toolkit policy cannot fall back to global full access or a mirror');
    toolkitOutage = false;
    await setUserPluginPermissionMode('owner', 'read_only', 'github');
    assert.equal(await getUserPluginPermissionMode('owner', 'github'), 'read_only');
    outage = true;
    assert.equal(await getUserPluginPermissionMode('owner', 'github'), 'always_ask');
    outage = false;
    await storeProviderToken('owner', 'xroga_plugin_permission_policy__github', { access_token: 'malformed' });
    assert.equal(await getUserPluginPermissionMode('owner', 'github'), 'always_ask');
    await clearProviderToken('owner', 'xroga_plugin_permission_policy__github');
    assert.equal(await getUserPluginPermissionMode('owner', 'github'), 'always_ask');
    await storeProviderToken('owner', 'provider', { access_token: 'token' });
    await storeProviderToken('other', 'provider', { access_token: 'other-token' });
    await storePkceSession(context, 'supabase_oauth_pkce', session);
    cleanupFailure = true;
    await assert.rejects(clearProviderToken('owner', 'provider'), /legacy cleanup is pending/);
    await assert.rejects(clearPkceSession(context, 'supabase_oauth_pkce'), /legacy cleanup is pending/);
    calls.length = 0;
    assert.equal(await loadProviderToken('owner', 'provider'), null);
    assert.equal((await loadProviderToken('other', 'provider'))?.access_token, 'other-token');
    assert.ok(calls.every(call => call.path === '/rest/v1/user_integrations'));
    cleanupFailure = false;
    await clearProviderToken('owner', 'provider');
    await clearPkceSession(context, 'supabase_oauth_pkce');
    await storeProviderToken('owner', 'provider', { access_token: 'reconnected' });
    assert.equal((await loadProviderToken('owner', 'provider'))?.access_token, 'reconnected');
    const expired = { access_token: 'EXPIRED', refresh_token: 'ORIGINAL_REFRESH', metadata: { expires_at: '2000-01-01T00:00:00Z' } };
    const seedSupabase=(token:Record<string,unknown>)=>rows.set('owner/supabase_oauth',{
      user_id:'owner',provider:'supabase_oauth',...token,credential_revision:randomUUID()});
    seedSupabase(expired);
    let tokenRequests = 0;
    let revokeDuringRefresh = false;
    let providerFailure = false;
    globalThis.fetch = async (input, init) => {
      const target = String(input instanceof Request ? input.url : input);
      if (target === 'https://api.supabase.com/v1/oauth/token') {
        tokenRequests++;
        if (revokeDuringRefresh) await clearProviderToken('owner', 'supabase_oauth');
        return Response.json(providerFailure ? { error_description: 'SYNTHETIC_PRIVATE_ERROR' } : { access_token: 'REFRESHED', refresh_token: 'ROTATED_REFRESH', expires_in: 3600 }, { status: providerFailure ? 400 : 200 });
      }
      assert.ok(target.startsWith(process.env.SUPABASE_URL!), 'test network must remain loopback-only');
      return originalFetch(input, init);
    };
    assert.equal(await getSupabaseOAuthAccessToken('owner'), 'REFRESHED');
    assert.equal((await loadProviderToken('owner', 'supabase_oauth'))?.refresh_token, 'ROTATED_REFRESH');
    seedSupabase(expired);
    revokeDuringRefresh = true;
    assert.equal(await getSupabaseOAuthAccessToken('owner'), null);
    assert.equal(await loadProviderToken('owner', 'supabase_oauth'), null);
    assert.equal((await loadProviderToken('other', 'provider'))?.access_token, 'other-token');
    revokeDuringRefresh = false;
    providerFailure = true;
    seedSupabase(expired);
    assert.equal(await getSupabaseOAuthAccessToken('owner'), null, 'a failed refresh cannot return the expired credential');
    seedSupabase({ ...expired, refresh_token: null });
    assert.equal(await getSupabaseOAuthAccessToken('owner'), null);
    seedSupabase({ ...expired, refresh_token: null, metadata: { expires_at: '1970-01-01T00:00:00Z' } });
    assert.equal(await getSupabaseOAuthAccessToken('owner'), null);
    seedSupabase({ ...expired, metadata: { expires_at: 'malformed' } });
    assert.equal(await getSupabaseOAuthAccessToken('owner'), null);
    assert.equal(tokenRequests, 3);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
