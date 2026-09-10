import type { StateStorage } from 'zustand/middleware';

const DB_NAME = 'xroga-project-contexts';
const STORE = 'state';
const CACHE_OWNER_KEY = 'xroga-cache-owner';
const PERSISTED_OWNER_FIELD = '__xrogaCacheOwner';
let writesSuspended = false;

/** Prevent an account-boundary reset from racing a final async IndexedDB write. */
export function suspendProjectWorkspacePersistence(): void {
  writesSuspended = true;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function idbRead(key: string): Promise<string | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDb();
  try {
    return await new Promise<string | null>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

async function idbWrite(key: string, value: string | null): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (value === null) tx.objectStore(STORE).delete(key); else tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

function currentCacheOwner(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(CACHE_OWNER_KEY);
}

function valueForCurrentOwner(value: string): string | null {
  const owner = currentCacheOwner();
  if (!owner) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed[PERSISTED_OWNER_FIELD] === owner ? value : null;
  } catch {
    return null;
  }
}

function stampCurrentOwner(value: string): string | null {
  const owner = currentCacheOwner();
  if (!owner) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return JSON.stringify({ ...parsed, [PERSISTED_OWNER_FIELD]: owner });
  } catch {
    return null;
  }
}

/** Async, quota-tolerant storage with one-time fallback to the legacy localStorage value. */
export const projectWorkspaceStorage: StateStorage = {
  getItem: async (key) => {
    try {
      const stored = await idbRead(key);
      if (stored) return valueForCurrentOwner(stored);
    } catch { /* fall through to legacy */ }
    if (typeof localStorage === 'undefined') return null;
    const legacy = localStorage.getItem(key);
    if (!legacy) return null;
    const ownedLegacy = valueForCurrentOwner(legacy);
    if (ownedLegacy) void idbWrite(key, ownedLegacy).catch(() => undefined);
    return ownedLegacy;
  },
  setItem: async (key, value) => {
    if (writesSuspended) return;
    const ownedValue = stampCurrentOwner(value);
    if (ownedValue) await idbWrite(key, ownedValue);
  },
  removeItem: async (key) => {
    await idbWrite(key, null);
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
  },
};
