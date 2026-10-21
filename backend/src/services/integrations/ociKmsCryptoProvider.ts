import { createHash } from 'node:crypto';
import type { CryptoProvider, WrappedDataKey } from './cryptoProvider.js';
import { createOciWorkloadFederation, type OciFederationConfiguration } from './ociWorkloadFederation.js';

const fail = (): never => { throw new Error('Managed credential key operation failed.'); };
const ocid = (value: unknown, type: 'key' | 'keyversion'): value is string => typeof value === 'string'
  && value.length < 512 && new RegExp(`^ocid1\\.${type}\\.oc1\\.[a-z0-9-]+\\.[a-z0-9.]+$`).test(value);
function base64(value: unknown, size?: number): Buffer {
  if (typeof value !== 'string' || !value || value.length > 4096
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return fail();
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value || (size !== undefined && bytes.length !== size)) return fail();
  return bytes;
}
export interface OciKmsRequest {
  keyId: string; keyVersionId?: string; encryptionAlgorithm: 'AES_256_GCM';
  associatedData: { purpose: string; keyId: string; aadSha256: string };
}
export interface OciKmsTransport {
  encrypt(input: OciKmsRequest & { plaintext: string }): Promise<{ ciphertext?: unknown; keyId?: unknown; keyVersionId?: unknown; encryptionAlgorithm?: unknown; requestId?: string }>;
  decrypt(input: OciKmsRequest & { ciphertext: string }): Promise<{ plaintext?: unknown; requestId?: string }>;
}

/** Same CredentialVault boundary and v3 container. OCI wraps only the random
 * data key. Identity AAD is hashed into a bounded, unambiguous provider context.
 * Old key versions remain readable after rotation, never silently remapped. */
export class OciKmsCryptoProvider implements CryptoProvider {
  readonly kind = 'managed' as const;
  constructor(readonly keyId: string, readonly transport: OciKmsTransport, readonly encryptVersionId?: string) {
    if (!ocid(keyId, 'key') || (encryptVersionId !== undefined && !ocid(encryptVersionId, 'keyversion'))) throw new Error('Invalid OCI KMS key identity.');
  }
  private context(aad: Uint8Array): OciKmsRequest['associatedData'] {
    if (!(aad instanceof Uint8Array) || aad.byteLength > 8192) return fail();
    return { purpose: 'xroga-vault-key-wrap-v1', keyId: this.keyId, aadSha256: createHash('sha256').update(aad).digest('hex') };
  }
  async wrapDataKey(value: Uint8Array, aad: Uint8Array): Promise<WrappedDataKey> {
    if (!(value instanceof Uint8Array) || value.byteLength !== 32) return fail();
    const plain = Buffer.from(value), associatedData = this.context(aad);
    try {
      const result = await this.transport.encrypt({ keyId: this.keyId, keyVersionId: this.encryptVersionId,
        encryptionAlgorithm: 'AES_256_GCM', associatedData, plaintext: plain.toString('base64') });
      base64(result.ciphertext);
      if (result.keyId !== this.keyId || !ocid(result.keyVersionId, 'keyversion')
        || (this.encryptVersionId && result.keyVersionId !== this.encryptVersionId)
        || result.encryptionAlgorithm !== 'AES_256_GCM') return fail();
      return { keyId: this.keyId, wrappedKey: `ocikms1:${Buffer.from(JSON.stringify({ versionId: result.keyVersionId, ciphertext: result.ciphertext })).toString('base64url')}` };
    } catch { return fail(); }
    finally { plain.fill(0); }
  }
  async unwrapDataKey(envelope: WrappedDataKey, aad: Uint8Array): Promise<Uint8Array> {
    try {
      if (envelope?.keyId !== this.keyId || typeof envelope.wrappedKey !== 'string' || envelope.wrappedKey.length > 8000
        || !/^ocikms1:[A-Za-z0-9_-]+$/.test(envelope.wrappedKey)) return fail();
      const encoded = envelope.wrappedKey.slice(8), bytes = Buffer.from(encoded, 'base64url');
      if (bytes.toString('base64url') !== encoded) return fail();
      const record = JSON.parse(bytes.toString('utf8'));
      if (!record || Object.keys(record).sort().join(',') !== 'ciphertext,versionId' || !ocid(record.versionId, 'keyversion')) return fail();
      base64(record.ciphertext);
      const result = await this.transport.decrypt({ keyId: this.keyId, keyVersionId: record.versionId,
        encryptionAlgorithm: 'AES_256_GCM', associatedData: this.context(aad), ciphertext: record.ciphertext });
      return base64(result.plaintext, 32);
    } catch { return fail(); }
  }
}

export type OciKmsAuthMode = 'instance_principal' | 'resource_principal' | 'workload_federation' | 'workload_session' | 'cloud_shell';
export function requireOciWorkloadIdentity(signingKeyId: string, expectedPrincipalId: string, now = Date.now()): void {
  // Admission only. OCI verifies the signature, proof-of-possession and IAM on
  // the actual crypto request. Never emit the SDK's ST$ token/signing key ID.
  try {
    if (!/^ocid1\.(?!user\.|group\.|tenancy\.|domain\.)[a-z][a-z0-9]*\.[a-z0-9.-]+$/.test(expectedPrincipalId)
      || !signingKeyId.startsWith('ST$') || signingKeyId.length > 32768) return fail();
    const jwt = signingKeyId.slice(3).split('.');
    if (jwt.length !== 3) return fail();
    const claims = JSON.parse(Buffer.from(jwt[1]!, 'base64url').toString('utf8'));
    if (claims.sub !== expectedPrincipalId || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now) return fail();
  } catch { return fail(); }
}
export function validateOciKmsConfiguration(options: { keyId: string; endpoint: string; encryptVersionId?: string }): void {
  if (!ocid(options.keyId, 'key') || (options.encryptVersionId !== undefined && !ocid(options.encryptVersionId, 'keyversion'))) throw new Error('Invalid OCI KMS key identity.');
  const region = options.keyId.split('.')[3];
  if (options.encryptVersionId && options.encryptVersionId.split('.')[3] !== region) throw new Error('Invalid OCI KMS key version region.');
  if (!new RegExp(`^https://[a-z0-9]+-crypto\\.kms\\.${region}\\.oci\\.oraclecloud\\.com$`).test(options.endpoint)) throw new Error('Invalid OCI KMS cryptographic endpoint.');
}
/** Official SDK signing, no API private-key download or environment fallback.
 * Cloud Shell is an interactive verification identity, prohibited for production.
 * Production callers inject the returned provider through the existing runtime
 * configureCredentialVaultProvider() startup boundary, never browser credentials. */
export async function createOciKmsCryptoProvider(options: {
  endpoint: string; keyId: string; authMode: OciKmsAuthMode; encryptVersionId?: string;
  configFile?: string; profile?: string; expectedPrincipalId?: string;
  federation?: OciFederationConfiguration;
}): Promise<OciKmsCryptoProvider> {
  validateOciKmsConfiguration(options);
  if (!['instance_principal', 'resource_principal', 'workload_federation', 'workload_session', 'cloud_shell'].includes(options.authMode)) throw new Error('Explicit short-lived OCI authentication is required.');
  if ((options.authMode === 'workload_federation') !== Boolean(options.federation)
    || (options.federation && (!options.expectedPrincipalId || options.federation.expectedPrincipalId !== options.expectedPrincipalId || options.configFile || options.profile))) return fail();
  if (options.authMode === 'cloud_shell' && (!['test', 'development'].includes(process.env.NODE_ENV ?? '')
    || process.env.FLY_APP_NAME || process.env.VERCEL_ENV === 'production')) throw new Error('Cloud Shell authentication is verification-only.');
  const common = await import('oci-common'), kms = await import('oci-keymanagement');
  const cloudShellAuth = () => {
    const file = options.configFile ? common.ConfigFileReader.parseFileFromPath(options.configFile, options.profile ?? null)
      : common.ConfigFileReader.parseDefault(options.profile ?? null);
    // Oracle Cloud Shell uses an instance principal with the signed-in user's
    // short-lived delegation token. An ordinary permanent API-key profile must
    // never be mistaken for this verification identity.
    if (options.authMode === 'cloud_shell' && file.get('authentication_type') === 'instance_principal' && file.get('delegation_token_file')) {
      return new common.ConfigFileAuthenticationDetailsProvider(options.configFile, options.profile);
    }
    if (file.get('security_token_file') && !file.get('authentication_type')) {
      return new common.SessionAuthDetailProvider(options.configFile, options.profile);
    }
    throw new Error('Short-lived Cloud Shell delegation or session authentication is required.');
  };
  const federation = options.federation ? createOciWorkloadFederation(options.federation) : undefined;
  const authenticationDetailsProvider = federation ? undefined : ['cloud_shell', 'workload_session'].includes(options.authMode)
    ? cloudShellAuth()
    : options.authMode === 'instance_principal'
      ? await new common.InstancePrincipalsAuthenticationDetailsProviderBuilder().build()
      : common.ResourcePrincipalAuthenticationDetailsProvider.builder();
  const client = async () => {
    const authentication = federation ? await federation.session() : authenticationDetailsProvider;
    if (!authentication) return fail();
    if (options.expectedPrincipalId) requireOciWorkloadIdentity(await authentication.getKeyId(), options.expectedPrincipalId);
    const result = new kms.KmsCryptoClient({ authenticationDetailsProvider: authentication }, {
      retryConfiguration: common.NoRetryConfigurationDetails,
      httpOptions: { signal: AbortSignal.timeout(15000), redirect: 'error' },
    });
    result.endpoint = options.endpoint;
    return result;
  };
  return new OciKmsCryptoProvider(options.keyId, {
    async encrypt(input) { const result = await (await client()).encrypt({ encryptDataDetails: { ...input, encryptionAlgorithm: kms.models.EncryptDataDetails.EncryptionAlgorithm.Aes256Gcm } }); return { ...result.encryptedData, requestId: result.opcRequestId }; },
    async decrypt(input) { const result = await (await client()).decrypt({ decryptDataDetails: { ...input, encryptionAlgorithm: kms.models.DecryptDataDetails.EncryptionAlgorithm.Aes256Gcm } }); return { ...result.decryptedData, requestId: result.opcRequestId }; },
  }, options.encryptVersionId);
}
