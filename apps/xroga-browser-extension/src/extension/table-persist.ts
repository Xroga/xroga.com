// Where the named tables of a conversation are kept on this device: chrome.storage.local, one key per conversation (the extension has unlimitedStorage), removed with the conversation and
// with "Delete everything". The tables are the person's own collected data, never sent anywhere.
import type { TableMap } from '@src/agent/table-store';

const PREFIX = 'xroga.tables.';

export interface TablePersistence {
  load(): Promise<TableMap>;
  save(tables: TableMap): Promise<void>;
}

export function tablePersistence(conversationId: string): TablePersistence {
  const key = PREFIX + conversationId;
  return {
    async load() {
      const got = await chrome.storage.local.get(key);
      const value = got[key];
      return value && typeof value === 'object' ? (value as TableMap) : {};
    },
    async save(tables) {
      if (Object.keys(tables).length) await chrome.storage.local.set({ [key]: tables });
      else await chrome.storage.local.remove(key);
    },
  };
}

export async function removeTables(conversationId: string): Promise<void> {
  await chrome.storage.local.remove(PREFIX + conversationId).catch(() => undefined);
}

export async function removeAllTables(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter(k => k.startsWith(PREFIX));
  if (keys.length) await chrome.storage.local.remove(keys);
}
