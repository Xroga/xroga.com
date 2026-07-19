/**
 * Persist preview HTML/CSS/JS outside localStorage (size) via IndexedDB.
 */

const DB_NAME = 'xroga-workspace-preview';
const STORE = 'preview';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('idb open failed'));
  });
}

export interface PreviewBlob {
  html: string;
  css: string;
  js: string;
  repo?: string | null;
  projectName?: string | null;
  updatedAt: number;
}

export async function savePreviewBlob(blob: PreviewBlob): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* ignore quota / private mode */
  }
}

export async function loadPreviewBlob(): Promise<PreviewBlob | null> {
  try {
    const db = await openDb();
    const value = await new Promise<PreviewBlob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as PreviewBlob) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch {
    return null;
  }
}
