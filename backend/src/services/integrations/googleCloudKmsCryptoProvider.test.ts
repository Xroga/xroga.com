import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { GoogleCloudKmsCryptoProvider, type GoogleCloudKmsTransport } from './googleCloudKmsCryptoProvider.js';

const keyName = 'projects/xroga1/locations/us-central1/keyRings/credential-vault/cryptoKeys/envelope-key';

test('managed KMS adapter binds the exact key and AAD and returns only provider ciphertext', async () => {
  const calls: unknown[][] = [];
  const plain = randomBytes(32), aad = Buffer.from('owner/provider/account/type/record/scope');
  const transport: GoogleCloudKmsTransport = {
    async encrypt(key, value, binding) { calls.push(['encrypt', key, value, binding]); return { ciphertext: Buffer.from('provider-ciphertext').toString('base64') }; },
    async decrypt(key, value, binding) { calls.push(['decrypt', key, value, binding]); return { plaintext: plain.toString('base64') }; },
  };
  const provider = new GoogleCloudKmsCryptoProvider(keyName, transport);
  const wrapped = await provider.wrapDataKey(plain, aad);
  assert.deepEqual(wrapped, { keyId: keyName, wrappedKey: `gcpkms1:${Buffer.from('provider-ciphertext').toString('base64')}` });
  assert.deepEqual(await provider.unwrapDataKey(wrapped, aad), plain);
  assert.deepEqual(calls, [
    ['encrypt', keyName, plain.toString('base64'), aad.toString('base64')],
    ['decrypt', keyName, Buffer.from('provider-ciphertext').toString('base64'), aad.toString('base64')],
  ]);
});

test('managed KMS adapter rejects wrong keys, malformed responses and plaintext substitution', async () => {
  const aad = Buffer.from('binding'), plain = randomBytes(32);
  const transport: GoogleCloudKmsTransport = {
    async encrypt() { return { ciphertext: 'not base64' }; },
    async decrypt() { return { plaintext: Buffer.alloc(31).toString('base64') }; },
  };
  const provider = new GoogleCloudKmsCryptoProvider(keyName, transport);
  await assert.rejects(provider.wrapDataKey(plain, aad), /Managed credential key operation failed/);
  await assert.rejects(provider.unwrapDataKey({ keyId: keyName, wrappedKey: `gcpkms1:${Buffer.from('cipher').toString('base64')}` }, aad), /Managed credential key operation failed/);
  await assert.rejects(provider.unwrapDataKey({ keyId: keyName.replace('envelope-key', 'other'), wrappedKey: 'gcpkms1:AAAA' }, aad), /Managed credential key operation failed/);
  assert.throws(() => new GoogleCloudKmsCryptoProvider('projects/forged'), /Invalid Google Cloud KMS key resource/);
});
