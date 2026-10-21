import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test, type TestContext } from 'node:test';
import { createTenantContext } from '../../security/tenantContext.js';
import { CredentialVault, type VaultIdentity } from './credentialVault.js';
import { DevelopmentCryptoProvider, type CryptoProvider } from './cryptoProvider.js';
const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const CANARY = 'SYNTHETIC_VAULT_CANARY_NOT_A_REAL_CREDENTIAL';
function fixture(t: TestContext) {
  const previous = new Map(['NODE_ENV', 'VERCEL_ENV', 'FLY_APP_NAME'].map(key => [key, process.env[key]]));
  process.env.NODE_ENV = 'test'; delete process.env.VERCEL_ENV; delete process.env.FLY_APP_NAME;
  t.after(() => { for (const [key, value] of previous) value === undefined ? delete process.env[key] : process.env[key] = value; });
  const keys = new Map([['old-key', randomBytes(32)], ['new-key', randomBytes(32)]]);
  const provider = new DevelopmentCryptoProvider('old-key', keys), vault = new CredentialVault(provider);
  t.after(() => { provider.destroy(); for (const key of keys.values()) key.fill(0); });
  const actor = createTenantContext({ userId: OWNER, via: 'remote_getuser' });
  const binding: VaultIdentity = { tenant: OWNER, owner: OWNER, provider: 'github', account: 'synthetic-account-A',
    credentialType: 'oauth_access_token', recordId: 'synthetic-record-A', revision: randomUUID(), scope: 'server-private' };
  return { keys, provider, vault, actor, binding };
}
function mutate(ciphertext: string, change: (record: Record<string, any>) => void): string {
  const record = JSON.parse(Buffer.from(ciphertext.slice('vault:v3:'.length), 'base64url').toString('utf8'));
  change(record); return `vault:v3:${Buffer.from(JSON.stringify(record)).toString('base64url')}`;
}

test('canonical vault uses randomized record data keys and binds every identity field, not ambient auth secrets', async t => {
  const f = fixture(t), first = await f.vault.seal(f.actor, f.binding, CANARY), second = await f.vault.seal(f.actor, f.binding, CANARY);
  assert.notEqual(first, second); assert.equal(first.includes(CANARY), false);
  assert.equal(await f.vault.open(f.actor, f.binding, first), CANARY);
  for (const change of [{ provider: 'vercel' }, { account: 'synthetic-account-B' }, { credentialType: 'oauth_refresh_token' },
    { recordId: 'synthetic-record-B' }, { revision: randomUUID() }, { scope: 'frontend-public' }, { owner: OTHER }, { tenant: OTHER }]) {
    await assert.rejects(f.vault.open(f.actor, { ...f.binding, ...change }, first), /could not authenticate/);
  }
  await assert.rejects(f.vault.open(createTenantContext({ userId: OTHER, via: 'remote_getuser' }), f.binding, first), /could not authenticate/);
  await assert.rejects(f.vault.open({ ...f.actor }, f.binding, first), { code: 'TENANT_AUTH_REQUIRED' });
});

test('vault rejects ciphertext, tag, wrapped-key and key identity substitution, downgrade and malformed envelopes', async t => {
  const f = fixture(t), encrypted = await f.vault.seal(f.actor, f.binding, CANARY);
  const variants = [encrypted.replace(/^vault:v3/, 'vault:v2'), encrypted + '=', 'enc:c3ludGhldGlj', 'x'.repeat(180001),
    mutate(encrypted, r => { r.keyId = 'unknown-key'; }), mutate(encrypted, r => { r.wrappedKey += ':extra'; }),
    mutate(encrypted, r => { r.version = 2; }), mutate(encrypted, r => { r.extra = true; })];
  for (const field of ['ciphertext', 'wrappedKey']) {
    for (const position of [2, 3, 4]) variants.push(mutate(encrypted, r => {
      const parts = r[field].split(':');
      // Wrapped dev keys have four parts, data envelopes have five.
      const index = Math.min(position, parts.length - 1), bytes = Buffer.from(parts[index], 'base64url'); bytes[0] ^= 1;
      parts[index] = bytes.toString('base64url'); r[field] = parts.join(':');
    }));
  }
  for (const invalid of variants) await assert.rejects(f.vault.open(f.actor, f.binding, invalid), /could not authenticate/);
});

test('vault rotation uses a new revision and key while retaining old reader compatibility until conditional cutover', async t => {
  const f = fixture(t), encrypted = await f.vault.seal(f.actor, f.binding, CANARY);
  const nextProvider = new DevelopmentCryptoProvider('new-key', f.keys), nextVault = new CredentialVault(nextProvider);
  t.after(() => nextProvider.destroy());
  const next = { ...f.binding, revision: randomUUID() }, rotated = await nextVault.rotate(f.actor, f.binding, next, encrypted);
  assert.notEqual(rotated, encrypted); assert.equal(await nextVault.open(f.actor, next, rotated), CANARY);
  assert.equal(await nextVault.open(f.actor, f.binding, encrypted), CANARY);
  await assert.rejects(nextVault.open(f.actor, f.binding, rotated), /could not authenticate/);
  await assert.rejects(nextVault.rotate(f.actor, f.binding, f.binding, encrypted), /could not authenticate/);
  await assert.rejects(nextVault.rotate(f.actor, f.binding, { ...next, account: 'foreign-account' }, encrypted), /could not authenticate/);
  // These cryptographic checks do not certify DB CAS, revocation or migration.
});

test('provider key buffers are erased on success and failure and bindings are snapshotted across an asynchronous key operation', async t => {
  const f = fixture(t); let captured: Uint8Array | undefined; let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(r => entered = r), gate = new Promise<void>(r => release = r);
  const provider: CryptoProvider = { kind: 'development', wrapDataKey: async (key, associated) => {
    captured = key; entered(); await gate; return f.provider.wrapDataKey(key, associated);
  }, unwrapDataKey: (envelope, associated) => f.provider.unwrapDataKey(envelope, associated) };
  const vault = new CredentialVault(provider), original = { ...f.binding }, pending = vault.seal(f.actor, f.binding, CANARY);
  await ready; f.binding.account = 'changed-during-key-wait'; release();
  const encrypted = await pending; assert.ok(captured); assert.equal(captured.every(byte => byte === 0), true);
  assert.equal(await vault.open(f.actor, original, encrypted), CANARY);
  const broken = new CredentialVault({ kind: 'development', wrapDataKey: async key => { captured = key; throw new Error(CANARY); }, unwrapDataKey: async () => { throw new Error(CANARY); } });
  await assert.rejects(broken.seal(f.actor, original, CANARY), error => error instanceof Error && !error.message.includes(CANARY));
  assert.equal(captured.every(byte => byte === 0), true);
});

test('development crypto refuses production, unknown runtime and production-host flags, even after construction', async t => {
  const f = fixture(t), encrypted = await f.vault.seal(f.actor, f.binding, CANARY);
  for (const mode of ['production', 'staging', undefined]) {
    mode === undefined ? delete process.env.NODE_ENV : process.env.NODE_ENV = mode;
    assert.throws(() => new DevelopmentCryptoProvider('old-key', f.keys), /prohibited/);
    await assert.rejects(f.vault.open(f.actor, f.binding, encrypted), /prohibited/);
  }
  process.env.NODE_ENV = 'test';
  for (const field of ['VERCEL_ENV', 'FLY_APP_NAME']) {
    process.env[field] = field === 'VERCEL_ENV' ? 'production' : 'synthetic-hosted-app';
    assert.throws(() => new CredentialVault(f.provider), /prohibited/); delete process.env[field];
  }
  f.provider.destroy(); await assert.rejects(f.vault.open(f.actor, f.binding, encrypted), /could not authenticate/);
});
