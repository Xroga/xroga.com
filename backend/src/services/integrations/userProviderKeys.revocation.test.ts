import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { deleteUserProviderKey, getUserProviderKey, listUserProviderKeys, resolveProviderEnvForDeploy } from './userProviderKeys.js';

test('unavailable credential authority never reads a legacy mirror or reports successful revocation', async () => {
  const paths: string[] = [];
  const bodies: string[] = [];
  let mode = 'unavailable';
  const server = createServer((req, res) => {
    paths.push(req.url ?? '');
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      bodies.push(body);
      if (mode === 'unavailable') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: '42P01', message: 'relation user_integrations does not exist: SYNTHETIC_ERROR_CANARY' }));
      } else if (req.url?.startsWith('/storage/')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'SYNTHETIC_CLEANUP_ERROR_CANARY' }));
      } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(req.method === 'POST' ? null : [{ provider: 'apikey_openai', access_token: '', metadata: { revoked: true } }]));
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const previous = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
  process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-local-test-key';
  try {
    const user = '11111111-1111-4111-8111-111111111111';
    for (const provider of ['openai', 'custom', 'custom_named_key']) {
      assert.equal(await getUserProviderKey(user, provider), null);
      await assert.rejects(deleteUserProviderKey(user, provider), { message: 'Credential revocation could not be recorded. Retry shortly.' });
    }
    await assert.rejects(listUserProviderKeys(user), { message: 'Credential lookup unavailable. Retry shortly.' });
    await assert.rejects(resolveProviderEnvForDeploy(user), { message: 'Credential lookup unavailable. Retry shortly.' });
    assert.ok(paths.length >= 8);
    assert.ok(paths.every((path) => path.startsWith('/rest/v1/user_integrations')), 'No Storage fallback may bypass unavailable revocation state');
    mode = 'cleanup';
    const start = paths.length;
    await assert.rejects(deleteUserProviderKey(user, 'openai'), { message: 'Credential revoked, but legacy copy cleanup is pending. Retry shortly.' });
    assert.ok(paths[start].startsWith('/rest/v1/user_integrations'));
    assert.ok(paths[start + 1].startsWith('/storage/'));
    const tombstone = JSON.parse(bodies[start]);
    assert.equal(tombstone.user_id, user);
    assert.equal(tombstone.provider, 'apikey_openai');
    assert.equal(tombstone.access_token, '');
    assert.equal(tombstone.metadata.revoked, true);
    const reads = paths.length;
    assert.equal(await getUserProviderKey(user, 'openai'), null);
    assert.equal(await getUserProviderKey(user, 'custom'), null);
    assert.deepEqual(await listUserProviderKeys(user), []);
    assert.deepEqual(await resolveProviderEnvForDeploy(user), {});
    assert.ok(paths.slice(reads).every((path) => path.startsWith('/rest/v1/user_integrations')));
  } finally {
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
