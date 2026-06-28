const VAULT_HASH_KEY = 'xroga_vault_hash';
const VAULT_SECRETS_KEY = 'xroga_vault_secrets';

export type CredentialType = 'api_key' | 'webhook' | 'secret';

export interface StoredCredential {
  id: string;
  name: string;
  type: CredentialType;
  masked: string;
  encrypted: string;
  webhookUrl?: string;
  baseUrl?: string;
}

function hashPassword(pw: string) {
  return btoa(unescape(encodeURIComponent(pw)));
}

export function hasVault() {
  return typeof window !== 'undefined' && !!localStorage.getItem(VAULT_HASH_KEY);
}

export function setVaultPassword(pw: string) {
  localStorage.setItem(VAULT_HASH_KEY, hashPassword(pw));
}

export function verifyVaultPassword(pw: string) {
  return localStorage.getItem(VAULT_HASH_KEY) === hashPassword(pw);
}

function enc(value: string, pw: string) {
  const payload = value.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ pw.charCodeAt(i % pw.length))).join('');
  return btoa(unescape(encodeURIComponent(payload)));
}

function dec(encrypted: string, pw: string) {
  try {
    const payload = decodeURIComponent(escape(atob(encrypted)));
    return payload.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ pw.charCodeAt(i % pw.length))).join('');
  } catch {
    return null;
  }
}

export function loadCredentials(): StoredCredential[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(VAULT_SECRETS_KEY);
    return raw ? (JSON.parse(raw) as StoredCredential[]) : [];
  } catch {
    return [];
  }
}

export function saveCredentials(list: StoredCredential[]) {
  localStorage.setItem(VAULT_SECRETS_KEY, JSON.stringify(list));
}

export function maskSecret(value: string) {
  if (value.length <= 8) return '••••••••';
  return `${value.slice(0, 3)}${'•'.repeat(Math.min(12, value.length - 6))}${value.slice(-3)}`;
}

export function addCredential(
  pw: string,
  data: { name: string; type: CredentialType; value: string; webhookUrl?: string; baseUrl?: string }
) {
  if (!hasVault()) setVaultPassword(pw);
  if (!verifyVaultPassword(pw)) throw new Error('Invalid vault password');

  const cred: StoredCredential = {
    id: crypto.randomUUID(),
    name: data.name,
    type: data.type,
    masked: maskSecret(data.value),
    encrypted: enc(data.value, pw),
    webhookUrl: data.webhookUrl,
    baseUrl: data.baseUrl,
  };
  const next = [...loadCredentials(), cred];
  saveCredentials(next);
  return cred;
}

export function revealCredential(id: string, pw: string) {
  if (!verifyVaultPassword(pw)) return null;
  const cred = loadCredentials().find((c) => c.id === id);
  if (!cred) return null;
  return dec(cred.encrypted, pw);
}

export function deleteCredential(id: string, pw: string) {
  if (!verifyVaultPassword(pw)) return false;
  saveCredentials(loadCredentials().filter((c) => c.id !== id));
  return true;
}
