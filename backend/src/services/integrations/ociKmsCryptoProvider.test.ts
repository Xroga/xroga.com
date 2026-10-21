import assert from 'node:assert/strict';
import test from 'node:test';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { OciKmsCryptoProvider, createOciKmsCryptoProvider, requireOciWorkloadIdentity, type OciKmsTransport } from './ociKmsCryptoProvider.js';
import { CredentialVault, type VaultIdentity } from './credentialVault.js';
import { createTenantContext } from '../../security/tenantContext.js';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const keyId = 'ocid1.key.oc1.me-dubai-1.fixture.aaaaaaaa';
const v1 = 'ocid1.keyversion.oc1.me-dubai-1.fixture.aaaaaaaa';
const v2 = 'ocid1.keyversion.oc1.me-dubai-1.fixture.bbbbbbbb';
test('OCI application identity admission rejects user sessions, wrong subjects and expired tokens without emitting them', () => {
  const principal='ocid1.fnfunc.oc1.me-dubai-1.fixture.aaaaaaaa';
  const jwt=(sub:string,exp:number)=>`ST$e30.${Buffer.from(JSON.stringify({sub,exp})).toString('base64url')}.synthetic`;
  requireOciWorkloadIdentity(jwt(principal,200),principal,100000);
  for(const token of [jwt(principal,99),jwt('ocid1.user.oc1..founder',200),jwt(principal+'b',200),'malformed']) {
    assert.throws(()=>requireOciWorkloadIdentity(token,principal,100000),{message:'Managed credential key operation failed.'});
  }
  assert.throws(()=>requireOciWorkloadIdentity(jwt('ocid1.user.oc1..founder',200),'ocid1.user.oc1..founder',100000));
});
function fixture() {
  const versions = new Map([[v1, randomBytes(32)], [v2, randomBytes(32)]]);
  const calls: unknown[] = [];
  let current = v1;
  const transport: OciKmsTransport = {
    async encrypt(input) {
      calls.push(structuredClone(input));
      const version = input.keyVersionId ?? current, key = versions.get(version)!;
      const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(JSON.stringify(input.associatedData)));
      const data = Buffer.concat([cipher.update(Buffer.from(input.plaintext, 'base64')), cipher.final()]);
      return { keyId: input.keyId, keyVersionId: version, encryptionAlgorithm: input.encryptionAlgorithm,
        ciphertext: Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64') };
    },
    async decrypt(input) {
      calls.push(structuredClone(input));
      const bytes = Buffer.from(input.ciphertext, 'base64'), key = versions.get(input.keyVersionId!);
      if (!key) throw new Error('PRIVATE_PROVIDER_CANARY');
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      decipher.setAAD(Buffer.from(JSON.stringify(input.associatedData)));
      return { plaintext: Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('base64') };
    },
  };
  return { transport, calls, rotate: () => { current = v2; } };
}

test('OCI adapter binds exact AAD and versions, and old ciphertext survives key rotation', async () => {
  const f = fixture(), provider = new OciKmsCryptoProvider(keyId, f.transport), plain = randomBytes(32), aad = Buffer.from('exact-identity');
  const old = await provider.wrapDataKey(plain, aad);
  assert.deepEqual(await provider.unwrapDataKey(old, aad), plain);
  await assert.rejects(provider.unwrapDataKey(old, Buffer.from('foreign-identity')), { message: 'Managed credential key operation failed.' });
  f.rotate(); const next = await provider.wrapDataKey(plain, aad);
  const decode = (wrappedKey: string) => JSON.parse(Buffer.from(wrappedKey.slice(8), 'base64url').toString());
  assert.equal(decode(old.wrappedKey).versionId, v1); assert.equal(decode(next.wrappedKey).versionId, v2);
  assert.deepEqual(await provider.unwrapDataKey(old, aad), plain);
  assert.deepEqual(await provider.unwrapDataKey(next, aad), plain);
  await assert.rejects(provider.unwrapDataKey({ ...old, keyId: `${keyId}b` }, aad));
  const substituted = `ocikms1:${Buffer.from(JSON.stringify({ ...decode(old.wrappedKey), versionId: v2 })).toString('base64url')}`;
  await assert.rejects(provider.unwrapDataKey({ keyId, wrappedKey: substituted }, aad));
  assert.ok(!JSON.stringify(f.calls).includes('exact-identity'), 'Provider logging context contains a bounded AAD digest, not raw identity');
});

test('OCI adapter preserves canonical CredentialVault identity and rotation semantics', async () => {
  const f = fixture(), vault = new CredentialVault(new OciKmsCryptoProvider(keyId, f.transport));
  const owner = '11111111-1111-4111-8111-111111111111', context = createTenantContext({ userId: owner, via: 'persisted_owner' });
  const binding: VaultIdentity = { tenant: owner, owner, provider: 'fixture', account: 'fixture-account', credentialType: 'api-key', recordId: 'fixture-record', revision: 'revision1', scope: 'isolated-test' };
  const cipher = await vault.seal(context, binding, 'SYNTHETIC_CREDENTIAL');
  assert.equal(await vault.open(context, binding, cipher), 'SYNTHETIC_CREDENTIAL');
  for (const field of ['account', 'provider', 'credentialType', 'recordId', 'revision', 'scope'] as const) {
    await assert.rejects(vault.open(context, { ...binding, [field]: 'foreign' }, cipher));
  }
  const foreign = createTenantContext({ userId: '22222222-2222-4222-8222-222222222222', via: 'persisted_owner' });
  await assert.rejects(vault.open(foreign, binding, cipher));
  f.rotate(); const next = { ...binding, revision: 'revision2' }, rotated = await vault.rotate(context, binding, next, cipher);
  assert.equal(await vault.open(context, next, rotated), 'SYNTHETIC_CREDENTIAL');
  assert.equal(await vault.open(context, binding, cipher), 'SYNTHETIC_CREDENTIAL');
  await assert.rejects(vault.rotate(context, binding, { ...next, account: 'foreign' }, cipher));
});

test('OCI adapter rejects malformed or substituted receipts and does not leak provider failures', async () => {
  const f = fixture(), aad = Buffer.from('binding'), plain = randomBytes(32);
  const good = await f.transport.encrypt({ keyId, encryptionAlgorithm: 'AES_256_GCM', associatedData: { purpose: 'test', keyId, aadSha256: 'hash' }, plaintext: plain.toString('base64') });
  for (const receipt of [{ ...good, ciphertext: 'bad' }, { ...good, keyId: `${keyId}b` }, { ...good, keyVersionId: undefined }, { ...good, encryptionAlgorithm: 'RSA_OAEP_SHA_1' }, { ...good, keyVersionId: v2 }]) {
    const provider = new OciKmsCryptoProvider(keyId, { ...f.transport, encrypt: async () => receipt }, v1);
    await assert.rejects(provider.wrapDataKey(plain, aad), { message: 'Managed credential key operation failed.' });
  }
  const provider = new OciKmsCryptoProvider(keyId, { encrypt: async () => { throw new Error('PRIVATE_PROVIDER_CANARY'); }, decrypt: async () => ({ plaintext: Buffer.alloc(31).toString('base64') }) });
  await assert.rejects(provider.wrapDataKey(plain, aad), { message: 'Managed credential key operation failed.' });
  await assert.rejects(provider.unwrapDataKey({ keyId, wrappedKey: `ocikms1:${Buffer.from(JSON.stringify({ versionId: v1, ciphertext: 'AAAA' })).toString('base64url')}` }, aad));
  for (const wrappedKey of ['ocikms1:!!', 'gcpkms1:AAAA', 'ocikms1:e30', 'ocikms1:AAAA']) await assert.rejects(provider.unwrapDataKey({ keyId, wrappedKey }, aad));
});

test('OCI factory rejects unsafe endpoints and Cloud Shell identity on production hosts before authentication', async () => {
  for (const endpoint of ['http://fixture-crypto.kms.me-dubai-1.oci.oraclecloud.com', 'https://attacker.invalid', 'https://fixture-crypto.kms.me-dubai-1.oci.oraclecloud.com/path', 'https://fixture-crypto.kms.me-dubai-1.oci.oraclecloud.com.attacker.invalid']) {
    await assert.rejects(createOciKmsCryptoProvider({ endpoint, keyId, authMode: 'cloud_shell' }), /endpoint/);
  }
  const prior = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    await assert.rejects(createOciKmsCryptoProvider({ endpoint: 'https://fixture-crypto.kms.me-dubai-1.oci.oraclecloud.com', keyId, authMode: 'cloud_shell' }), /verification-only/);
  } finally { prior === undefined ? delete process.env.NODE_ENV : process.env.NODE_ENV = prior; }
});

test('OCI workload sessions refuse permanent API-key profiles without reading their key material', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xroga-oci-auth-')), configFile = join(directory, 'config');
  await writeFile(configFile, '[DEFAULT]\ntenancy=synthetic\nregion=me-dubai-1\nuser=synthetic\nfingerprint=synthetic\nkey_file=must-not-read-permanent-key\n', { mode: 0o600 });
  try {
    await assert.rejects(createOciKmsCryptoProvider({ endpoint: 'https://fixture-crypto.kms.me-dubai-1.oci.oraclecloud.com', keyId, authMode: 'workload_session', configFile }), /Short-lived Cloud Shell delegation or session authentication is required/);
  } finally { await unlink(configFile); await rmdir(directory); }
});
