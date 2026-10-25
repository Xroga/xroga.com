// Opt-in isolated provider probe. No IAM, key management, DB or live-credential
// writes. The operator rotates only the named SOFTWARE test key between phases.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createOciKmsCryptoProvider, OciKmsCryptoProvider, type OciKmsTransport } from '../../backend/src/services/integrations/ociKmsCryptoProvider.js';
import { CredentialVault, type VaultIdentity } from '../../backend/src/services/integrations/credentialVault.js';
import { createTenantContext } from '../../backend/src/security/tenantContext.js';

const arg = (name: string) => {
  const index = process.argv.indexOf(name), value = process.argv[index + 1];
  assert.ok(index >= 0 && value && !value.startsWith('--'), `Required ${name}`); return value;
};
const phase = arg('--phase'), keyId = arg('--key'), endpoint = arg('--endpoint'), version = arg('--version');
assert.ok(['prepare', 'rotation'].includes(phase));
assert.equal(process.env.NODE_ENV, 'test', 'Isolated Cloud Shell probe only, never production');
const requests: Record<string, unknown>[] = [], cases: string[] = [];
const provider = await createOciKmsCryptoProvider({ keyId, endpoint, authMode: 'cloud_shell', encryptVersionId: version });
function observed(transport: OciKmsTransport): OciKmsTransport {
  const execute = async (operation: 'encrypt' | 'decrypt', input: any) => {
    try {
      const result = operation === 'encrypt' ? await transport.encrypt(input) : await transport.decrypt(input);
      assert.ok(typeof result.requestId === 'string' && result.requestId.length > 5, 'Real OCI request receipt required');
      requests.push({ operation, keyId: input.keyId, keyVersionId: input.keyVersionId, requestId: result.requestId, result: 'SUCCESS' });
      return result;
    } catch (error: any) {
      requests.push({ operation, result: 'DENIED', status: Number.isInteger(error?.statusCode) ? error.statusCode : null,
        code: typeof error?.serviceCode === 'string' && /^[A-Za-z0-9_]{1,80}$/.test(error.serviceCode) ? error.serviceCode : null,
        requestId: typeof error?.opcRequestId === 'string' ? error.opcRequestId.slice(0, 300) : null });
      throw error;
    }
  };
  return { encrypt: input => execute('encrypt', input), decrypt: input => execute('decrypt', input) };
}
const transport = observed(provider.transport), managed = new OciKmsCryptoProvider(keyId, transport, version);
const vault = new CredentialVault(managed), owner = '11111111-1111-4111-8111-111111111111';
const actor = createTenantContext({ userId: owner, via: 'persisted_owner' });
const binding: VaultIdentity = { tenant: owner, owner, provider: 'isolated-oci-probe', account: 'synthetic-account', credentialType: 'synthetic', recordId: 'synthetic-record', revision: 'probe-revision-1', scope: 'non-production-verification' };
const expected = 'SYNTHETIC_XROGA_KMS_PROBE_NOT_A_LIVE_CREDENTIAL';
const decodeVersion = (wrappedKey: string) => JSON.parse(Buffer.from(wrappedKey.slice(8), 'base64url').toString()).versionId;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const statePath = 'xroga-oci-synthetic-state.json';
if (phase === 'prepare') {
  const dataKey = randomBytes(32), aad = Buffer.from('synthetic-tenant/exact-account/revision1');
  try {
    const wrapped = await managed.wrapDataKey(dataKey, aad);
    assert.equal(decodeVersion(wrapped.wrappedKey), version);
    assert.deepEqual(await managed.unwrapDataKey(wrapped, aad), dataKey); cases.push('REAL_WRAP_UNWRAP_EXACT_VERSION');
    const before = requests.length;
    await assert.rejects(managed.unwrapDataKey(wrapped, Buffer.from('wrong-account')));
    assert.ok(requests.length > before && requests.at(-1)?.result === 'DENIED'); cases.push('REAL_WRONG_AAD_DENIED');
    const absent = new OciKmsCryptoProvider(`${keyId.slice(0, -1)}${keyId.endsWith('a') ? 'b' : 'a'}`, transport, version);
    await assert.rejects(absent.wrapDataKey(dataKey, aad));
    assert.equal(requests.at(-1)?.result, 'DENIED'); cases.push('REAL_UNAVAILABLE_KEY_DENIED');
    const unsignedBody = JSON.stringify({ keyId, plaintext: dataKey.toString('base64'), encryptionAlgorithm: 'AES_256_GCM' });
    const response = await fetch(`${endpoint}/20180608/encrypt`, { method: 'POST', headers: { 'Content-Type': 'application/json',
      date: new Date().toUTCString(), 'x-content-sha256': createHash('sha256').update(unsignedBody).digest('base64'),
      'Content-Length': String(Buffer.byteLength(unsignedBody)) }, body: unsignedBody,
      redirect: 'error', signal: AbortSignal.timeout(15000) });
    assert.ok([401, 403].includes(response.status), 'Unauthenticated real request must be denied');
    requests.push({ operation: 'unauthenticated-encrypt', status: response.status, requestId: response.headers.get('opc-request-id'), result: 'DENIED' });
    cases.push('REAL_UNAUTHENTICATED_REQUEST_DENIED_NOT_SCOPED_IAM_PROOF');
  } finally { dataKey.fill(0); }
  const ciphertext = await vault.seal(actor, binding, expected);
  assert.equal(await vault.open(actor, binding, ciphertext), expected); cases.push('REAL_CANONICAL_VAULT_ROUNDTRIP');
  for (const field of ['account', 'provider', 'credentialType', 'recordId', 'revision', 'scope'] as const) await assert.rejects(vault.open(actor, { ...binding, [field]: 'foreign' }, ciphertext));
  await assert.rejects(vault.open(createTenantContext({ userId: '22222222-2222-4222-8222-222222222222', via: 'persisted_owner' }), binding, ciphertext));
  cases.push('REAL_VAULT_IDENTITY_NEGATIVES');
  await writeFile(statePath, JSON.stringify({ keyId, endpoint, version, binding, ciphertext }), { mode: 0o600, flag: 'wx' });
  cases.push('SYNTHETIC_CIPHERTEXT_PRESERVED_FOR_PROCESS_RESTART');
} else {
  const state = JSON.parse(await readFile(statePath, 'utf8'));
  assert.equal(state.keyId, keyId); assert.equal(state.endpoint, endpoint); assert.notEqual(state.version, version);
  assert.equal(await vault.open(actor, state.binding, state.ciphertext), expected); cases.push('REAL_OLD_VERSION_RECOVERY_AFTER_PROCESS_RESTART_AND_ROTATION');
  const next = { ...state.binding, revision: 'probe-revision-2' };
  const rotated = await vault.rotate(actor, state.binding, next, state.ciphertext);
  const record = JSON.parse(Buffer.from(rotated.slice('vault:v3:'.length), 'base64url').toString());
  assert.equal(decodeVersion(record.wrappedKey), version);
  assert.equal(await vault.open(actor, next, rotated), expected);
  assert.equal(await vault.open(actor, state.binding, state.ciphertext), expected);
  await assert.rejects(vault.open(actor, state.binding, rotated)); cases.push('REAL_NEW_VERSION_ROTATION_AND_OLD_READER_COMPATIBILITY');
  await writeFile('xroga-oci-synthetic-rotated.json', JSON.stringify({ keyId, version, binding: next, ciphertext: rotated }), { mode: 0o600, flag: 'wx' });
}
const receipt = { version: 1, result: 'PASS_ISOLATED_PROVIDER_CRYPTO_NOT_PRODUCTION_CUTOVER', phase, timestamp: new Date().toISOString(),
  keyId, endpoint, keyVersionId: version, authMode: 'CLOUD_SHELL_DELEGATED_OPERATOR_NOT_APPLICATION_RUNTIME', node: process.version,
  cases, requests, originalSoftwareSource: 'd750836bfa44bd6fa668f827a4529ed49dec5269',
  scopedApplicationIamVerified: false, productionRuntimeAuthenticationVerified: false, liveCredentialsMigrated: false,
  keyBackupVerified: false, recoveryScope: 'Retained SOFTWARE key versions plus synthetic ciphertext, not provider key backup',
  syntheticStateSha256: hash(await readFile(statePath, 'utf8')) };
await writeFile(`xroga-oci-${phase}-receipt.json`, JSON.stringify(receipt, null, 2), { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify(receipt));
