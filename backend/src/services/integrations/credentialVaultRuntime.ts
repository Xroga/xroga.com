import { createHash, randomBytes } from 'node:crypto';
import { CredentialVault } from './credentialVault.js';
import { DevelopmentCryptoProvider, requireCryptoProvider, type CryptoProvider } from './cryptoProvider.js';
import { GoogleCloudKmsCryptoProvider } from './googleCloudKmsCryptoProvider.js';
import { createTenantContext } from '../../security/tenantContext.js';
import type { VaultIdentity } from './credentialVault.js';

let configured: CryptoProvider | undefined;
let testProvider: DevelopmentCryptoProvider | undefined;
let managedProvider: GoogleCloudKmsCryptoProvider | undefined;

/** Startup injection point for tests or an alternative reviewed managed provider. */
export function configureCredentialVaultProvider(provider: CryptoProvider): void {
  requireCryptoProvider(provider);
  configured = provider;
}

export function runtimeCredentialVault(): CredentialVault {
  if (configured) return new CredentialVault(configured);
  if (process.env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME) {
    managedProvider ??= new GoogleCloudKmsCryptoProvider(process.env.XROGA_GOOGLE_CLOUD_KMS_KEY_NAME);
    return new CredentialVault(managedProvider);
  }
  if (process.env.NODE_ENV === 'test') {
    if (!testProvider) {
      const configuredKey = process.env.XROGA_TEST_CREDENTIAL_KEK;
      const key = configuredKey ? Buffer.from(configuredKey, 'base64url') : randomBytes(32);
      try {
        if (key.length !== 32 || (configuredKey && key.toString('base64url') !== configuredKey)) {
          throw new Error('Invalid ephemeral test credential key.');
        }
        testProvider = new DevelopmentCryptoProvider('ephemeral-test', new Map([['ephemeral-test', key]]));
      } finally { key.fill(0); }
    }
    return new CredentialVault(testProvider);
  }
  if (process.env.NODE_ENV === 'development' && process.env.XROGA_DEV_CREDENTIAL_KEK) {
    const key = createHash('sha256').update(process.env.XROGA_DEV_CREDENTIAL_KEK, 'utf8').digest();
    return new CredentialVault(new DevelopmentCryptoProvider('explicit-development', new Map([['explicit-development', key]])));
  }
  throw new Error('Production CredentialVault KMS is not configured.');
}

export function resetCredentialVaultRuntimeForTests(): void {
  configured = undefined;
  managedProvider = undefined;
  testProvider?.destroy();
  testProvider = undefined;
}

/** Legacy plaintext/v1 reads exist only for an observed, reversible migration.
 * Production must name that temporary window and remove it before cutover. */
export function requireLegacyCredentialMigrationWindow(): void {
  const productionHost = process.env.NODE_ENV === 'production'
    || process.env.VERCEL_ENV === 'production' || Boolean(process.env.FLY_APP_NAME);
  if (!productionHost) return;
  if (process.env.XROGA_LEGACY_CREDENTIAL_MIGRATION === 'enabled') return;
  throw new Error('Legacy credential reads are disabled outside an explicit migration window.');
}

export async function sealRuntimeCredential(userId: string, binding: Omit<VaultIdentity, 'tenant' | 'owner'>, plain: string): Promise<string> {
  return runtimeCredentialVault().seal(createTenantContext({ userId, via: 'persisted_owner' }), {
    tenant: userId, owner: userId, ...binding,
  }, plain);
}

export async function openRuntimeCredential(userId: string, binding: Omit<VaultIdentity, 'tenant' | 'owner'>, ciphertext: string): Promise<string> {
  return runtimeCredentialVault().open(createTenantContext({ userId, via: 'persisted_owner' }), {
    tenant: userId, owner: userId, ...binding,
  }, ciphertext);
}
