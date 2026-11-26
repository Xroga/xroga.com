// Tidy tabs: tabs the agent opened and then left (a page it read, a result list) are closed once nobody has touched them for a while, so a long research task does not leave a
// trail of tabs behind; and a tab the agent opens in the background is muted, so a page's video or ad does not start playing out of sight. Only tabs Xroga itself created are
// ever closed: the person's own tabs are never tracked. A tab the person claims (pins it, takes it out of the agent's group, or looks at it) is forgotten and stays. The idea and
// the rules are from Browse's tab cleanup (anomalyco/browse, MIT, src/background/tab-cleanup.ts), written here for Xroga's tabs.
export const IDLE_MS = 45 * 60_000;
export const CHECK_MINUTES = 10;
export const ALARM = 'xroga-tab-tidy';
const KEY = 'xroga_agent_tabs';

export interface Tracked {
  touched: number;
  /** The tab was in a group of the agent's when it was opened or last seen. */
  grouped?: boolean;
}
export type Table = Record<string, Tracked>;

export interface TabFacts {
  id: number;
  pinned: boolean;
  active: boolean;
  groupId: number;
}

/** What to do with each tracked tab now: close it, forget it (the person claimed it, or it is gone), touch it (it is in use) or leave it. */
export function decide(table: Table, tabs: Map<number, TabFacts>, now: number, busy: (tabId: number) => boolean): { close: number[]; forget: number[]; touch: number[] } {
  const close: number[] = [];
  const forget: number[] = [];
  const touch: number[] = [];
  for (const [key, entry] of Object.entries(table)) {
    const id = Number(key);
    const tab = tabs.get(id);
    if (!tab) {
      forget.push(id);
      continue;
    }
    // The person pinned it, or took it out of the agent's group: it is theirs now.
    if (tab.pinned || (entry.grouped && tab.groupId < 0)) {
      forget.push(id);
      continue;
    }
    if (tab.active || busy(id)) {
      touch.push(id);
      continue;
    }
    if (now - entry.touched >= IDLE_MS) close.push(id);
  }
  return { close, forget, touch };
}

async function read(): Promise<Table> {
  try {
    const v = (await chrome.storage.session.get(KEY))[KEY];
    return v && typeof v === 'object' ? (v as Table) : {};
  } catch {
    return {};
  }
}
async function write(t: Table): Promise<void> {
  try {
    await chrome.storage.session.set({ [KEY]: t });
  } catch {
    /* tidying is a convenience: when it cannot remember, it forgets */
  }
}

/** A tab Xroga opened: remembered, and muted when it was opened in the background. */
export async function trackAgentTab(tabId: number, background: boolean): Promise<void> {
  const t = await read();
  t[String(tabId)] = { touched: Date.now() };
  await write(t);
  if (background) await chrome.tabs.update(tabId, { muted: true }).catch(() => undefined);
}

export async function touchTab(tabId: number): Promise<void> {
  const t = await read();
  if (!t[String(tabId)]) return;
  t[String(tabId)]!.touched = Date.now();
  await write(t);
}

/** One round: closes the tabs that have been idle long enough. Never throws. */
export async function tidyNow(busy: (tabId: number) => Promise<boolean>, now = Date.now()): Promise<number[]> {
  try {
    const table = await read();
    const ids = Object.keys(table).map(Number);
    if (!ids.length) return [];
    const facts = new Map<number, TabFacts>();
    for (const id of ids) {
      const tab = await chrome.tabs.get(id).catch(() => undefined);
      if (tab) facts.set(id, { id, pinned: !!tab.pinned, active: !!tab.active, groupId: tab.groupId ?? -1 });
    }
    // A tab's group is noted the first time it is seen in one, so leaving the group later counts as the person claiming it.
    for (const [key, entry] of Object.entries(table)) {
      const f = facts.get(Number(key));
      if (f && f.groupId >= 0) entry.grouped = true;
    }
    const busyIds = new Set<number>();
    for (const id of facts.keys()) if (await busy(id).catch(() => true)) busyIds.add(id);
    const verdict = decide(table, facts, now, id => busyIds.has(id));
    for (const id of verdict.touch) table[String(id)]!.touched = now;
    for (const id of [...verdict.forget, ...verdict.close]) delete table[String(id)];
    await write(table);
    if (verdict.close.length) await chrome.tabs.remove(verdict.close).catch(() => undefined);
    return verdict.close;
  } catch {
    return [];
  }
}

/** Starts the periodic round and the touches. Called once by the worker. */
export function installTabTidy(busy: (tabId: number) => Promise<boolean>): void {
  try {
    void chrome.alarms?.create(ALARM, { periodInMinutes: CHECK_MINUTES });
    chrome.alarms?.onAlarm.addListener(alarm => {
      if (alarm.name === ALARM) void tidyNow(busy);
    });
    chrome.tabs.onActivated.addListener(({ tabId }) => void touchTab(tabId));
    chrome.tabs.onUpdated.addListener((tabId, change) => {
      if (change.status === 'loading') void touchTab(tabId);
    });
  } catch {
    /* no alarms or tabs API here (a unit test): nothing to start */
  }
}
