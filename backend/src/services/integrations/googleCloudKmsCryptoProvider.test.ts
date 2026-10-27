import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { ApplicationDefaultGoogleKmsTransport, GoogleCloudKmsCryptoProvider, type GoogleCloudKmsTransport } from './googleCloudKmsCryptoProvider.js';
import { Compute } from 'google-auth-library';

test('native production KMS selects metadata-only authentication without operator ADC discovery', async () => {
  for (const environment of [
    {NODE_ENV:'production'},
    {K_SERVICE:'xroga-api', K_REVISION:'synthetic-revision'},
    {XROGA_GOOGLE_CLOUD_AUTH_MODE:'metadata_adc'},
  ]) {
    const transport = new ApplicationDefaultGoogleKmsTransport(undefined, environment);
    assert.ok(await transport.client() instanceof Compute);
  }
  for (const name of ['GOOGLE_APPLICATION_CREDENTIALS','GOOGLE_CREDENTIALS',
    'CLOUDSDK_AUTH_CREDENTIAL_FILE_OVERRIDE','GCE_METADATA_HOST','GCE_METADATA_IP',
    'FLY_APP_NAME','FLY_MACHINE_ID','XROGA_GOOGLE_WIF_AUDIENCE','XROGA_GOOGLE_WIF_SERVICE_ACCOUNT',
    'XROGA_FLY_OIDC_ISSUER','XROGA_FLY_OIDC_ORGANIZATION_ID','XROGA_FLY_OIDC_IMAGE_DIGESTS']) {
    assert.throws(() => new ApplicationDefaultGoogleKmsTransport(undefined,
      {K_SERVICE:'xroga-api', [name]:'PRIVATE_INVALID_IDENTITY_CANARY'}),
      {message:'Invalid native Google credential identity configuration.'});
  }
});

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
