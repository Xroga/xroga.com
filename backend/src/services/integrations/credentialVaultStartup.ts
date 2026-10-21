import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { CryptoProvider } from './cryptoProvider.js';
import { requireCryptoProvider } from './cryptoProvider.js';
import { GoogleCloudKmsCryptoProvider } from './googleCloudKmsCryptoProvider.js';
import { createOciKmsCryptoProvider, validateOciKmsConfiguration } from './ociKmsCryptoProvider.js';
import { configureCredentialVaultProvider } from './credentialVaultRuntime.js';
import type { RequestHandler } from 'express';

type Environment = Readonly<Record<string, string | undefined>>;
type ManagedConfiguration = { provider: 'google_cloud'; keyName: string }
  | { provider: 'oci'; keyId: string; endpoint: string; encryptVersionId: string; expectedPrincipalId: string;
      authMode: 'instance_principal' | 'resource_principal' };
const invalid = (): never => { throw new Error('CredentialVault startup configuration is invalid.'); };

export function managedCredentialConfiguration(env: Environment): ManagedConfiguration | undefined {
  const provider = env.XROGA_CREDENTIAL_KMS_PROVIDER;
  const production = env.NODE_ENV === 'production' || Boolean(env.FLY_APP_NAME) || env.VERCEL_ENV === 'production';
  const oci = [env.XROGA_OCI_KMS_KEY_ID, env.XROGA_OCI_KMS_ENDPOINT, env.XROGA_OCI_KMS_KEY_VERSION, env.XROGA_OCI_KMS_AUTH_MODE, env.XROGA_OCI_KMS_PRINCIPAL_ID];
  if (!provider) {
    if (production || env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME || oci.some(Boolean)) return invalid();
    return undefined; // Existing explicit local development/test mode only.
  }
  if (provider === 'google_cloud') {
    if (!env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME || oci.some(Boolean)) return invalid();
    // Constructor validates the exact resource without making an API request.
    new GoogleCloudKmsCryptoProvider(env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME);
    return { provider, keyName: env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME };
  }
  if (provider !== 'oci' || env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME || oci.some(value => !value)
    || !['instance_principal', 'resource_principal'].includes(env.XROGA_OCI_KMS_AUTH_MODE!)
    || !/^ocid1\.(?!user\.|group\.|tenancy\.|domain\.)[a-z][a-z0-9]*\.[a-z0-9.-]+$/.test(env.XROGA_OCI_KMS_PRINCIPAL_ID!)) return invalid();
  // An application startup never reads an interactive/default OCI CLI profile.
  // Direct verification harnesses retain their separately scoped session factory.
  const configuration = { provider: 'oci' as const, keyId: oci[0]!, endpoint: oci[1]!,
    encryptVersionId: oci[2]!, expectedPrincipalId: oci[4]!, authMode: env.XROGA_OCI_KMS_AUTH_MODE as 'instance_principal' | 'resource_principal' };
  validateOciKmsConfiguration(configuration);
  return configuration;
}

async function createManaged(configuration: ManagedConfiguration): Promise<CryptoProvider> {
  return configuration.provider === 'oci'
    ? createOciKmsCryptoProvider(configuration)
    : new GoogleCloudKmsCryptoProvider(configuration.keyName);
}

export function credentialVaultReadinessMiddleware(state: { checkReadiness(): Promise<boolean> }): RequestHandler {
  return (_request, response, next) => {
    void state.checkReadiness().then(ready => {
      if (ready) next();
      else response.status(503).json({ status: 'not_ready', reason: 'credential_provider_unavailable' });
    }).catch(() => response.status(503).json({ status: 'not_ready', reason: 'credential_provider_unavailable' }));
  };
}

/** One startup boundary, not another vault. Readiness is a bounded, single-flight
 * synthetic key roundtrip. Plaintext is random probe material, never a stored
 * credential. Cache is health information only: every vault use still calls KMS. */
export async function initializeCredentialVaultForServer(
  env: Environment = process.env,
  dependencies: { create?: typeof createManaged; install?: typeof configureCredentialVaultProvider;
    now?: () => number; timeoutMs?: number; cacheMs?: number } = {},
): Promise<{ checkReadiness(): Promise<boolean> }> {
  let configuration: ManagedConfiguration | undefined;
  try { configuration = managedCredentialConfiguration(env); } catch { return invalid(); }
  if (!configuration) return { checkReadiness: async () => true };
  const now = dependencies.now ?? Date.now;
  const timeoutMs = dependencies.timeoutMs ?? 15000;
  const cacheMs = dependencies.cacheMs ?? 60000;
  let provider: CryptoProvider;
  let pending: Promise<boolean> | undefined;
  let checkedAt = -Infinity, healthy = false;
  const bounded = async <T>(work: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([work, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('CredentialVault provider unavailable.')), timeoutMs);
    })]); } finally { if (timer) clearTimeout(timer); }
  };
  try {
    provider = await bounded((dependencies.create ?? createManaged)(configuration));
    requireCryptoProvider(provider);
    if (provider.kind !== 'managed') return invalid();
  } catch { throw new Error('CredentialVault managed provider initialization failed.'); }
  const probe = async (): Promise<boolean> => {
    const plain = randomBytes(32), aad = randomBytes(32);
    let recovered: Uint8Array | undefined;
    try {
      const wrapped = await bounded(provider.wrapDataKey(plain, aad));
      recovered = await bounded(provider.unwrapDataKey(wrapped, aad));
      return recovered.byteLength === plain.byteLength && timingSafeEqual(plain, recovered);
    } catch { return false; }
    finally { plain.fill(0); aad.fill(0); recovered?.fill(0); }
  };
  const checkReadiness = (): Promise<boolean> => {
    if (pending) return pending;
    if (now() - checkedAt < cacheMs) return Promise.resolve(healthy);
    pending = probe().then(result => { healthy = result; checkedAt = now(); return result; })
      .finally(() => { pending = undefined; });
    return pending;
  };
  if (!await checkReadiness()) throw new Error('CredentialVault managed provider readiness failed.');
  (dependencies.install ?? configureCredentialVaultProvider)(provider);
  return { checkReadiness };
}
