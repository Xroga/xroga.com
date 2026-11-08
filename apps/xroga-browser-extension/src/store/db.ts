// The IndexedDB schema, through `idb`. Versions migrate in place: each step of `upgrade` takes the database from one
// version to the next.
import { openDB } from 'idb';
import { XROGA_PRODUCT } from '../xroga/product';
import { DEVICE_PROFILE, PAIR_KEY } from '../xroga/device';
import type { DBSchema, IDBPDatabase } from 'idb';
import type { Conversation, Entry, RunRecord, StoredBlob, StoredShortcut } from './types';

export interface NanoDB extends DBSchema {
  conversations: { key: string; value: Conversation; indexes: { updatedAt: string } };
  entries: { key: string; value: Entry; indexes: { conversationId: string } };
  runs: { key: string; value: RunRecord; indexes: { status: string } };
  blobs: { key: string; value: StoredBlob; indexes: { conversationId: string } };
  shortcuts: { key: string; value: StoredShortcut };
}

export const DB_NAME = 'nanobrowser';
export const DB_VERSION = 1;

const openings = new Map<string, Promise<IDBPDatabase<NanoDB>>>();

async function databaseName(): Promise<string> {
  if (!XROGA_PRODUCT) return DB_NAME;
  const state = await chrome.storage.local.get([PAIR_KEY, DEVICE_PROFILE]);
  const owner = state[PAIR_KEY];
  if (typeof owner !== 'string' || !/^[0-9a-f-]{36}$/i.test(owner)) return DB_NAME + '-signed-out';
  // Preserve the history created by the first account in this Chrome profile.
  return !state[DEVICE_PROFILE] || state[DEVICE_PROFILE] === owner ? DB_NAME : DB_NAME + '-' + owner;
}

export async function db(): Promise<IDBPDatabase<NanoDB>> {
  const name = await databaseName();
  const existing = openings.get(name);
  if (existing) return existing;
  const opening = openDB<NanoDB>(name, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        database.createObjectStore('conversations', { keyPath: 'id' }).createIndex('updatedAt', 'updatedAt');
        database.createObjectStore('entries', { keyPath: 'id' }).createIndex('conversationId', 'conversationId');
        database.createObjectStore('runs', { keyPath: 'conversationId' }).createIndex('status', 'status');
        database.createObjectStore('blobs', { keyPath: 'id' }).createIndex('conversationId', 'conversationId');
        database.createObjectStore('shortcuts', { keyPath: 'id' });
      }
    },
    blocking() {
      // A newer version is waiting: let it open.
      void opening.then(d => d.close());
      openings.delete(name);
    },
  });
  openings.set(name, opening);
  void opening.catch(() => openings.delete(name));
  return opening;
}

/** For tests: forget the open connections. */
export async function closeDb(): Promise<void> {
  const current = [...openings.values()];
  openings.clear();
  for (const database of await Promise.all(current)) database.close();
}
