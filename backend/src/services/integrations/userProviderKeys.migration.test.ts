import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createTenantContext } from '../../security/tenantContext.js';
import { migrateLegacyProviderKey } from './userProviderKeys.js';

test('legacy provider-key migration is owner-bound, CAS protected and idempotent', async () => {
  const owner = '11111111-1111-4111-8111-111111111111';
  let row: Record<string, unknown> = {
    user_id: owner,
    provider: 'apikey_openai',
    access_token: `enc:${Buffer.from('fixture:SYNTHETIC_LEGACY_KEY').toString('base64')}`,
    metadata: { provider: 'openai', env_var: 'OPENAI_API_KEY', connected_at: new Date().toISOString(), masked: 'old' },
    credential_revision: randomUUID(),
  };
  let migrations = 0;
  const server = createServer((request, response) => {
    let text = '';
    request.on('data', chunk => { text += chunk; });
    request.on('end', () => {
      const path = request.url ?? '';
      const body = text ? JSON.parse(text) as Record<string, unknown> : {};
      response.setHeader('Content-Type', 'application/json');
      if (path.startsWith('/rest/v1/user_integrations?')) {
        response.end(JSON.stringify([row]));
      } else if (path.endsWith('/migrate_provider_key_to_vault')) {
        migrations++;
        const accepted = body.p_owner_id === owner && body.p_provider === 'apikey_openai'
          && body.p_expected_revision === row.credential_revision
          && body.p_expected_legacy_token === row.access_token
          && typeof body.p_vault_token === 'string' && body.p_vault_token.startsWith('vault:v3:');
        if (accepted) row = { ...row, access_token: body.p_vault_token, metadata: body.p_metadata, credential_revision: randomUUID() };
        response.end(JSON.stringify(accepted));
      } else if (path === '/storage/v1/bucket') {
        response.end(JSON.stringify([{ id: 'xroga-github-tokens', name: 'xroga-github-tokens', public: false }]));
      } else if (path.startsWith('/storage/')) {
        response.end('{}');
      } else {
        response.statusCode = 500;
        response.end(JSON.stringify({ message: 'unexpected fixture request' }));
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const names = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'NODE_ENV', 'XROGA_LEGACY_CREDENTIAL_MIGRATION'];
  const before = new Map(names.map(name => [name, process.env[name]]));
  try {
    process.env.SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'synthetic-loopback-key';
    process.env.NODE_ENV = 'test';
    const context = createTenantContext({ userId: owner, via: 'remote_getuser' });
    assert.equal(await migrateLegacyProviderKey(context, 'openai'), 'MIGRATED');
    assert.match(String(row.access_token), /^vault:v3:/);
    assert.ok(!String(row.access_token).includes('SYNTHETIC_LEGACY_KEY'));
    assert.equal(await migrateLegacyProviderKey(context, 'openai'), 'ALREADY_CURRENT');
    assert.equal(migrations, 1, 'a replay must not rotate or rewrite a current envelope');
    row = { ...row, access_token: '', metadata: { revoked: true }, credential_revision: randomUUID() };
    assert.equal(await migrateLegacyProviderKey(context, 'openai'), 'ABSENT_OR_REVOKED');
    assert.equal(migrations, 1, 'revoked rows never reach the migration mutation');
    await new Promise<void>(resolve => setTimeout(resolve, 30));
  } finally {
    for (const [name, value] of before) value === undefined ? delete process.env[name] : process.env[name] = value;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('production legacy reads require an explicit migration window', async () => {
  const priorNode = process.env.NODE_ENV;
  const priorWindow = process.env.XROGA_LEGACY_CREDENTIAL_MIGRATION;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.XROGA_LEGACY_CREDENTIAL_MIGRATION;
    const source = await import('./credentialVaultRuntime.js');
    assert.throws(() => source.requireLegacyCredentialMigrationWindow(), /explicit migration window/);
    process.env.XROGA_LEGACY_CREDENTIAL_MIGRATION = 'enabled';
    assert.doesNotThrow(() => source.requireLegacyCredentialMigrationWindow());
  } finally {
    priorNode === undefined ? delete process.env.NODE_ENV : process.env.NODE_ENV = priorNode;
    priorWindow === undefined ? delete process.env.XROGA_LEGACY_CREDENTIAL_MIGRATION : process.env.XROGA_LEGACY_CREDENTIAL_MIGRATION = priorWindow;
  }
});
