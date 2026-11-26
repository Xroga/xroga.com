// A run cut off by a lost connection (the laptop slept or closed, the network dropped) is not a failed run and not a finished one: it waits where it stopped, and when the
// Workspace connects again it goes on from its saved checkpoint, without anyone pressing Resume and without redoing finished work or paying for it twice. A run the person
// paused or stopped is never resumed this way, and one run is resumed at most MAX_AUTO times so a connection that keeps dropping cannot spend credits in a loop.
export const MAX_AUTO = 5;
const KEY = 'xroga_auto_resume';

interface Store {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}
type Entry = { pending: boolean; count: number };
type Table = Record<string, Entry>;

const defaultStore = (): Store => chrome.storage.local as unknown as Store;

async function read(store: Store): Promise<Table> {
  const raw = (await store.get(KEY))[KEY];
  return raw && typeof raw === 'object' ? (raw as Table) : {};
}

/** The run was cut off by a lost connection: it should resume by itself when the Workspace is back. */
export async function markCutOff(conversationId: string, store: Store = defaultStore()): Promise<void> {
  const t = await read(store);
  t[conversationId] = { pending: true, count: t[conversationId]?.count ?? 0 };
  await store.set({ [KEY]: t });
}

/** The person paused or stopped it, or it ended: nothing resumes by itself. */
export async function clearCutOff(conversationId: string, store: Store = defaultStore()): Promise<void> {
  const t = await read(store);
  if (!t[conversationId]) return;
  delete t[conversationId];
  await store.set({ [KEY]: t });
}

/** The conversations to resume now (each counted), oldest bookkeeping first; those past the limit are dropped. */
export async function takeToResume(store: Store = defaultStore()): Promise<string[]> {
  const t = await read(store);
  const out: string[] = [];
  for (const [id, e] of Object.entries(t)) {
    if (!e.pending) continue;
    if (e.count >= MAX_AUTO) { delete t[id]; continue; }
    t[id] = { pending: false, count: e.count + 1 };
    out.push(id);
  }
  await store.set({ [KEY]: t });
  return out;
}
