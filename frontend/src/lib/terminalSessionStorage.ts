import type { TerminalHistoryEntry } from '@/lib/terminalHistory';
import { messagesForStorage } from '@/lib/storageSafe';

const DB_NAME = 'xroga_terminal_sessions_v1';
const STORE = 'sessions';

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
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

/** Full terminal session — survives localStorage quota and message stripping. */
export async function saveTerminalSessionToIndexedDB(entry: TerminalHistoryEntry): Promise<void> {
  if (typeof window === 'undefined' || !entry.id) return;
  try {
    const db = await openDb();
    const payload: TerminalHistoryEntry = {
      ...entry,
      messages: messagesForStorage(entry.messages),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
      tx.objectStore(STORE).put(payload);
    });
    db.close();
  } catch (err) {
    console.warn('[terminalSessionStorage] save failed:', (err as Error).message);
  }
}

export async function loadTerminalSessionFromIndexedDB(
  sessionId: string
): Promise<TerminalHistoryEntry | null> {
  if (typeof window === 'undefined' || !sessionId) return null;
  try {
    const db = await openDb();
    const record = await new Promise<TerminalHistoryEntry | null>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed'));
      const req = tx.objectStore(STORE).get(sessionId);
      req.onsuccess = () => resolve((req.result as TerminalHistoryEntry | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'));
    });
    db.close();
    return record;
  } catch {
    return null;
  }
}

export async function deleteTerminalSessionFromIndexedDB(sessionId: string): Promise<void> {
  if (typeof window === 'undefined' || !sessionId) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
      tx.objectStore(STORE).delete(sessionId);
    });
    db.close();
  } catch {
    /* ignore */
  }
}

/** Prefer IndexedDB (full session) over localStorage list row. */
export async function loadTerminalHistoryEntry(sessionId: string): Promise<TerminalHistoryEntry | null> {
  const fromIndexed = await loadTerminalSessionFromIndexedDB(sessionId);
  if (fromIndexed?.messages?.length) return fromIndexed;

  const { loadTerminalHistory } = await import('@/lib/terminalHistory');
  const fromList = loadTerminalHistory().find((e) => e.id === sessionId);
  return fromList ?? null;
}
