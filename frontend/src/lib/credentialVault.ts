const LEGACY_VAULT_HASH_KEY = 'xroga_vault_hash';
const LEGACY_VAULT_SECRETS_KEY = 'xroga_vault_secrets';

export type CredentialType = 'api_key' | 'webhook' | 'secret';

/** Browser-only records created by the retired XOR vault. New credentials must
 * go to the authenticated backend CredentialVault. These fields remain solely
 * so a user can explicitly reconnect or import their own legacy record. */
export interface StoredCredential {
  id: string;
  name: string;
  type: CredentialType;
  masked: string;
  encrypted: string;
  webhookUrl?: string;
  baseUrl?: string;
}

function legacyPasswordHash(password: string) {
  return btoa(unescape(encodeURIComponent(password)));
}

export function hasLegacyBrowserVault() {
  return typeof window !== 'undefined' && !!localStorage.getItem(LEGACY_VAULT_HASH_KEY);
}

export function loadLegacyCredentials(): StoredCredential[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LEGACY_VAULT_SECRETS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(record =>
      record && typeof record.id === 'string' && typeof record.name === 'string'
      && typeof record.encrypted === 'string' && typeof record.masked === 'string') : [];
  } catch {
    return [];
  }
}

/** Explicit migration read only. Never call during page load or discovery. */
export function readLegacyCredentialForImport(id: string, password: string) {
  if (!password || localStorage.getItem(LEGACY_VAULT_HASH_KEY) !== legacyPasswordHash(password)) return null;
  const credential = loadLegacyCredentials().find(record => record.id === id);
  if (!credential) return null;
  try {
    const payload = decodeURIComponent(escape(atob(credential.encrypted)));
    return payload.split('').map((character, index) =>
      String.fromCharCode(character.charCodeAt(0) ^ password.charCodeAt(index % password.length))).join('');
  } catch {
    return null;
  }
}

export function removeLegacyCredentialAfterImport(id: string, password: string) {
  if (!readLegacyCredentialForImport(id, password)) return false;
  const remaining = loadLegacyCredentials().filter(record => record.id !== id);
  localStorage.setItem(LEGACY_VAULT_SECRETS_KEY, JSON.stringify(remaining));
  if (!remaining.length) {
    localStorage.removeItem(LEGACY_VAULT_SECRETS_KEY);
    localStorage.removeItem(LEGACY_VAULT_HASH_KEY);
  }
  return true;
}

// Compatibility names are metadata-only. There is deliberately no browser
// writer, secret reveal, or clipboard API anymore.
export const hasVault = hasLegacyBrowserVault;
export const loadCredentials = loadLegacyCredentials;
