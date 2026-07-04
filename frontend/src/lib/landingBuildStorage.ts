const DB_NAME = 'xroga_landing_builds_v1';
const STORE = 'builds';

export interface LandingBuildRecord {
  messageId: string;
  html: string;
  css: string;
  js: string;
  updatedAt: string;
}

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
        db.createObjectStore(STORE, { keyPath: 'messageId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

export async function saveLandingBuild(record: Omit<LandingBuildRecord, 'updatedAt'>): Promise<void> {
  if (typeof window === 'undefined') return;
  if (!record.messageId || !record.html?.trim()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      tx.objectStore(STORE).put({
        ...record,
        updatedAt: new Date().toISOString(),
      });
    });
    db.close();
  } catch (err) {
    console.warn('[landingBuildStorage] save failed:', (err as Error).message);
  }
}

export async function loadLandingBuild(messageId: string): Promise<LandingBuildRecord | null> {
  if (typeof window === 'undefined' || !messageId) return null;
  try {
    const db = await openDb();
    const record = await new Promise<LandingBuildRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed'));
      const req = tx.objectStore(STORE).get(messageId);
      req.onsuccess = () => resolve((req.result as LandingBuildRecord | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
    });
    db.close();
    return record;
  } catch {
    return null;
  }
}

export async function deleteLandingBuild(messageId: string): Promise<void> {
  if (typeof window === 'undefined' || !messageId) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
      tx.objectStore(STORE).delete(messageId);
    });
    db.close();
  } catch {
    /* ignore */
  }
}
