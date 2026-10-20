import { createHash, randomBytes } from 'node:crypto';
import { CredentialVault } from './credentialVault.js';
import { DevelopmentCryptoProvider, requireCryptoProvider, type CryptoProvider } from './cryptoProvider.js';
import { createTenantContext } from '../../security/tenantContext.js';
import type { VaultIdentity } from './credentialVault.js';

let configured: CryptoProvider | undefined;
let testProvider: DevelopmentCryptoProvider | undefined;

/** Startup injection point for the selected managed provider. Phase 3 deliberately does
 * not select a production KMS on the founder's behalf. */
export function configureCredentialVaultProvider(provider: CryptoProvider): void {
  requireCryptoProvider(provider);
  configured = provider;
}

export function runtimeCredentialVault(): CredentialVault {
  if (configured) return new CredentialVault(configured);
  if (process.env.NODE_ENV === 'test') {
    testProvider ??= new DevelopmentCryptoProvider('ephemeral-test', new Map([['ephemeral-test', randomBytes(32)]]));
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
