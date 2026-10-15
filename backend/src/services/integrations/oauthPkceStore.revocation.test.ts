import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { clearPkceSession, clearProviderToken, loadPkceSession, loadProviderToken, storePkceSession, storeProviderToken } from './oauthPkceStore.js';
import { getUserPluginPermissionMode, setUserPluginPermissionMode } from './pluginPermissionPolicy.js';

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
      if (req.method === 'POST') {
        rows.set(`${body.user_id}/${body.provider}`, body);
        return res.end('null');
      }
      const key = `${url.searchParams.get('user_id')?.slice(3)}/${url.searchParams.get('provider')?.slice(3)}`;
      return res.end(JSON.stringify(rows.has(key) ? [rows.get(key)] : []));
    });
  });
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_DB_PASSWORD'];
  const previous = new Map(keys.map(key => [key, process.env[key]]));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const session = { verifier: 'verifier', state: 'state', redirect_uri: 'http://127.0.0.1/callback', created_at: new Date().toISOString() };
  try {
    for (const key of keys) delete process.env[key];
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-only';
    await assert.rejects(storeProviderToken('owner', '../foreign', { access_token: 'token' }), /Invalid OAuth storage identity/);
    await assert.rejects(clearPkceSession('../owner', 'provider'), /Invalid OAuth storage identity/);
    assert.equal(calls.length, 0);
    outage = true;
    assert.equal(await getUserPluginPermissionMode('owner', 'github'), 'always_ask');
    await assert.rejects(storeProviderToken('owner', 'provider', { access_token: 'token' }), /could not be saved/);
    await assert.rejects(storePkceSession('owner', 'pkce', session), /could not be saved/);
    await assert.rejects(clearProviderToken('owner', 'provider'), /could not be recorded/);
    await assert.rejects(clearPkceSession('owner', 'pkce'), /could not be recorded/);
    assert.ok(calls.every(call => call.path === '/rest/v1/user_integrations'));
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
    await storePkceSession('owner', 'pkce', session);
    cleanupFailure = true;
    await assert.rejects(clearProviderToken('owner', 'provider'), /legacy cleanup is pending/);
    await assert.rejects(clearPkceSession('owner', 'pkce'), /legacy cleanup is pending/);
    calls.length = 0;
    assert.equal(await loadProviderToken('owner', 'provider'), null);
    assert.equal(await loadPkceSession('owner', 'pkce', 'state'), null);
    assert.equal((await loadProviderToken('other', 'provider'))?.access_token, 'other-token');
    assert.ok(calls.every(call => call.path === '/rest/v1/user_integrations'));
    cleanupFailure = false;
    await clearProviderToken('owner', 'provider');
    await clearPkceSession('owner', 'pkce');
    await storeProviderToken('owner', 'provider', { access_token: 'reconnected' });
    assert.equal((await loadProviderToken('owner', 'provider'))?.access_token, 'reconnected');
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
