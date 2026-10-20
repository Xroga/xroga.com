import { randomBytes } from 'node:crypto';
import { requireTenantContext, type TenantContext } from '../../security/tenantContext.js';
import { canonicalAuthorityJson } from '../../security/authority/digest.js';
import { openCredentialEnvelope, sealCredentialEnvelope, type CredentialEnvelopeContext } from './credentialEnvelope.js';
import { requireCryptoProvider, type CryptoProvider, type WrappedDataKey } from './cryptoProvider.js';

export type VaultIdentity = Omit<Extract<CredentialEnvelopeContext, { domain: 'vault' }>, 'domain'>;
interface VaultCiphertext extends WrappedDataKey { version: 3; algorithm: 'AES-256-GCM'; ciphertext: string }
const fail = (): never => { throw new Error('CredentialVault could not authenticate this credential.'); };

function identity(context: TenantContext, value: VaultIdentity): Extract<CredentialEnvelopeContext, { domain: 'vault' }> {
  const actor = requireTenantContext(context);
  // Clone and bound exact JSON before invoking an asynchronous key provider.
  const copy = JSON.parse(canonicalAuthorityJson(value)) as VaultIdentity;
  if (Object.keys(copy).sort().join(',') !== 'account,credentialType,owner,provider,recordId,revision,scope,tenant'
    || copy.owner !== actor.userId || copy.tenant !== actor.tenantId) return fail();
  for (const field of Object.values(copy)) {
    if (typeof field !== 'string' || !field || Buffer.byteLength(field) > 180 || /[\u0000-\u001f\u007f]/.test(field)) return fail();
  }
  return Object.freeze({ domain: 'vault', ...copy });
}
function associated(value: VaultIdentity): Buffer {
  return Buffer.from(canonicalAuthorityJson({ purpose: 'xroga-vault-data-key', version: 3, identity: value }));
}
function parse(value: string): VaultCiphertext {
  try {
    if (typeof value !== 'string' || value.length > 180_000 || !value.startsWith('vault:v3:')) return fail();
    const encoded = value.slice('vault:v3:'.length);
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return fail();
    const bytes = Buffer.from(encoded, 'base64url'); if (bytes.toString('base64url') !== encoded) return fail();
    const record = JSON.parse(bytes.toString('utf8')) as VaultCiphertext;
    if (Object.keys(record).sort().join(',') !== 'algorithm,ciphertext,keyId,version,wrappedKey'
      || record.version !== 3 || record.algorithm !== 'AES-256-GCM'
      || typeof record.keyId !== 'string' || !record.keyId || record.keyId.length > 1024
      || typeof record.wrappedKey !== 'string' || !record.wrappedKey || record.wrappedKey.length > 12_000
      || typeof record.ciphertext !== 'string' || !record.ciphertext.startsWith('v2:data-key:')) return fail();
    return record;
  } catch { return fail(); }
}

/** Canonical backend envelope boundary. Persist through existing conditional
 * credential revisions, never an unconditional upsert. This class cannot create
 * connection authority, bypass tombstones, or certify a production KMS. */
export class CredentialVault {
  constructor(private readonly provider: CryptoProvider) { requireCryptoProvider(provider); }
  async seal(context: TenantContext, binding: VaultIdentity, plain: string): Promise<string> {
    requireCryptoProvider(this.provider);
    const scope = identity(context, binding), key = randomBytes(32);
    try {
      const ciphertext = sealCredentialEnvelope(plain, key, 'data-key', scope);
      const wrapped = await this.provider.wrapDataKey(key, associated(scope));
      const record: VaultCiphertext = { version: 3, algorithm: 'AES-256-GCM', keyId: wrapped.keyId, wrappedKey: wrapped.wrappedKey, ciphertext };
      const result = `vault:v3:${Buffer.from(canonicalAuthorityJson(record)).toString('base64url')}`;
      parse(result); return result;
    } catch { return fail(); }
    finally { key.fill(0); }
  }
  async open(context: TenantContext, binding: VaultIdentity, ciphertext: string): Promise<string> {
    requireCryptoProvider(this.provider);
    const scope = identity(context, binding), record = parse(ciphertext);
    let key: Uint8Array | undefined;
    try {
      key = await this.provider.unwrapDataKey({ keyId: record.keyId, wrappedKey: record.wrappedKey }, associated(scope));
      return openCredentialEnvelope(record.ciphertext, key, 'data-key', scope);
    } catch { return fail(); }
    finally { key?.fill(0); }
  }
  /** Re-encrypt to the selected key and new revision. The caller MUST persist
   * using its original credential epoch/CAS. Never renew a revoked row here. */
  async rotate(context: TenantContext, previous: VaultIdentity, next: VaultIdentity, ciphertext: string): Promise<string> {
    const oldScope = identity(context, previous), newScope = identity(context, next);
    if (oldScope.revision === newScope.revision || Object.keys(oldScope).filter(key => key !== 'revision')
      .some(key => oldScope[key as keyof typeof oldScope] !== newScope[key as keyof typeof newScope])) return fail();
    const { domain: _oldDomain, ...oldBinding } = oldScope;
    const { domain: _newDomain, ...newBinding } = newScope;
    const plain = await this.open(context, oldBinding, ciphertext);
    return this.seal(context, newBinding, plain);
  }
}
