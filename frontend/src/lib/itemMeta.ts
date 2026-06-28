const META_KEY = 'xroga_item_meta';

export interface ItemMeta {
  seenAt?: string;
  deletedAt?: string;
  runCount?: number;
  tabsUsed?: number;
}

type MetaStore = Record<string, ItemMeta>;

function load(): MetaStore {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? '{}') as MetaStore;
  } catch {
    return {};
  }
}

function save(store: MetaStore) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(META_KEY, JSON.stringify(store));
}

export function getItemMeta(id: string): ItemMeta {
  return load()[id] ?? {};
}

export function markItemSeen(id: string) {
  const store = load();
  store[id] = { ...store[id], seenAt: new Date().toISOString() };
  save(store);
}

export function markItemDeleted(id: string) {
  const store = load();
  store[id] = { ...store[id], deletedAt: new Date().toISOString() };
  save(store);
}

export function incrementRunCount(id: string, tabs = 1) {
  const store = load();
  const prev = store[id] ?? {};
  store[id] = {
    ...prev,
    runCount: (prev.runCount ?? 0) + 1,
    tabsUsed: Math.max(prev.tabsUsed ?? 0, tabs),
    seenAt: new Date().toISOString(),
  };
  save(store);
}

export function splitDateParts(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    year: String(d.getFullYear()),
    full: d.toLocaleString(),
  };
}

export function isActiveStatus(status: string) {
  const s = status.toLowerCase();
  return !['failed', 'error', 'deleted', 'archived', 'cancelled'].includes(s);
}

export function recentlyLabel(iso?: string) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/** Deterministic tab estimate from run id for display */
export function estimateTabs(id: string, iterationCount: number) {
  const hash = id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return Math.max(1, (hash % 4) + 1 + Math.min(iterationCount, 2));
}
