import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import express from '../../backend/node_modules/express/index.js';
import { SignJWT } from 'jose';
import { createBrowserDeviceRouter, createLocalBrowserAuth } from '../../backend/src/routes/localBrowserDevice.ts';

// Run with a disposable PGlite module path. No Xroga or Supabase service credentials are used.
const { PGlite } = await import(pathToFileURL(process.argv[2]));
const db = await PGlite.create();
const owner = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const extensionId = 'a'.repeat(32);
const origin = 'chrome-extension://' + extensionId;
const salt = () => randomBytes(32).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('base64url');
Object.assign(process.env, {
  SUPABASE_URL: 'http://127.0.0.1:1',
  SUPABASE_JWT_SECRET: 'local-device-integration-only',
  SUPABASE_SERVICE_ROLE_KEY: '',
  REQUIRE_REMOTE_AUTH_CHECK: '0',
  XROGA_LOCAL_BROWSER_ALLOWED_USER_IDS: owner + ',' + other,
});
await db.exec('create schema auth; create table auth.users (id uuid primary key); create role anon; create role authenticated; create role service_role;');
await db.query('insert into auth.users values ($1), ($2)', [owner, other]);
const migration = await readFile(new URL('../../supabase/migrations/20261108181114_local_browser_device_sessions.sql', import.meta.url), 'utf8');
await db.exec(migration);
for (const role of ['anon', 'authenticated', 'service_role']) {
  const { rows } = await db.query("select has_table_privilege($1, 'public.local_browser_device_sessions', 'select,insert,update,delete') as allowed", [role]);
  assert.equal(rows[0].allowed, false);
}
assert.equal((await db.query("select relrowsecurity from pg_class where oid = 'public.local_browser_device_sessions'::regclass")).rows[0].relrowsecurity, true);

const database = () => ({
  async query(statement, params) {
    const result = await db.query(statement, params);
    return { ...result, rowCount: result.rows.length || result.affectedRows || 0 };
  },
});
const app = express();
app.use(express.json());
app.use('/device', createBrowserDeviceRouter(database, () => extensionId));
const authenticate = createLocalBrowserAuth(database, () => extensionId);
app.get('/session', authenticate, (req, res) => res.json({ account: req.userId }));
app.get('/unrelated', authenticate, (_req, res) => res.sendStatus(200));
const server = app.listen(0, '127.0.0.1');
await once(server, 'listening');

const userToken = account => new SignJWT({ role: 'authenticated' }).setSubject(account)
  .setProtectedHeader({ alg: 'HS256' }).setAudience('authenticated').setIssuer('http://127.0.0.1:1/auth/v1')
  .setExpirationTime('3m').sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET));
const send = (path, { method = 'POST', body, token, from = origin } = {}) =>
  fetch('http://127.0.0.1:' + server.address().port + path, {
    method, headers: { 'content-type': 'application/json', origin: from, ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

try {
  const verifier = salt();
  const [ownerToken, otherToken] = await Promise.all([userToken(owner), userToken(other)]);
  const authorize = (token, proof) => send('/device/authorize', { token, body: { extensionId, challenge: hash(proof) } });
  const issued = await authorize(ownerToken, verifier);
  assert.equal(issued.status, 201);
  assert.equal(issued.headers.get('cache-control'), 'no-store');
  const { code } = await issued.json();
  const exchange = (account, proof, from) => send('/device/exchange', { from, body: { account, verifier: proof, code } });
  assert.equal((await exchange(other, verifier)).status, 401);
  assert.equal((await exchange(owner, salt())).status, 401);
  assert.equal((await exchange(owner, verifier, 'https://example.invalid')).status, 403);
  const exchanges = await Promise.all([exchange(owner, verifier), exchange(owner, verifier)]);
  assert.deepEqual(exchanges.map(response => response.status).sort(), [200, 401]);
  const device = await exchanges.find(response => response.ok).json();
  const session = token => send('/session', { method: 'GET', token });
  assert.deepEqual(await (await session(device.access)).json(), { account: owner });
  assert.equal((await send('/unrelated', { method: 'GET', token: device.access })).status, 401);
  assert.equal((await send('/device/authorize', { token: device.access, body: { extensionId, challenge: hash(salt()) } })).status, 401);
  assert.equal((await send('/device/' + device.deviceId, { method: 'DELETE', token: otherToken })).status, 204);
  assert.equal((await session(device.access)).status, 200);
  const refresh = () => send('/device/refresh', { body: { deviceId: device.deviceId, deviceKey: device.deviceKey } });
  const renewed = await (await refresh()).json();
  assert.equal((await session(device.access)).status, 401);
  assert.deepEqual(await (await session(renewed.access)).json(), { account: owner });
  await db.query("update public.local_browser_device_sessions set access_expires_at = now() - interval '1 second' where id = $1", [device.deviceId]);
  assert.equal((await session(renewed.access)).status, 401);
  const newest = await (await refresh()).json();
  assert.equal((await send('/device/revoke', { body: { deviceId: device.deviceId, deviceKey: device.deviceKey } })).status, 204);
  assert.equal((await session(newest.access)).status, 401);
  assert.equal((await refresh()).status, 401);
  const secondVerifier = salt();
  const second = await (await authorize(otherToken, secondVerifier)).json();
  const otherDevice = await (await send('/device/exchange', { body: { account: other, verifier: secondVerifier, code: second.code } })).json();
  assert.deepEqual(await (await session(otherDevice.access)).json(), { account: other });
  await db.query('delete from auth.users where id = $1', [other]);
  assert.equal((await session(otherDevice.access)).status, 401);
  console.log(JSON.stringify({ passed: true, database: 'disposable PostgreSQL WASM', actors: 2, modelCalls: 0, assertions: 'RLS grants, PKCE, single-use exchange, scope, refresh, expiration, revocation, owner isolation' }));
} finally {
  server.close();
  await db.close();
}
