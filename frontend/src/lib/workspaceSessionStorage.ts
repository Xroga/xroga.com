import type { WorkspaceSession } from '@/lib/workspacePersistence';

const DB_NAME = 'xroga_workspace_v1';
const STORE = 'sessions';
const SESSION_KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/** Durable workspace session — survives refresh and localStorage quota limits. */
export async function saveWorkspaceToIndexedDB(session: WorkspaceSession): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      tx.objectStore(STORE).put(session, SESSION_KEY);
    });
    db.close();
  } catch (err) {
    console.warn('[workspaceSessionStorage] save failed:', (err as Error).message);
  }
}

export async function loadWorkspaceFromIndexedDB(): Promise<WorkspaceSession | null> {
  if (typeof window === 'undefined') return null;
  try {
    const db = await openDb();
    const record = await new Promise<WorkspaceSession | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed'));
      const req = tx.objectStore(STORE).get(SESSION_KEY);
      req.onsuccess = () => resolve((req.result as WorkspaceSession | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
    });
    db.close();
    return record;
  } catch {
    return null;
  }
}

export async function clearWorkspaceFromIndexedDB(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
      tx.objectStore(STORE).delete(SESSION_KEY);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
