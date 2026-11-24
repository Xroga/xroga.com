// `browser_data`: the person's own browser as data the agent can use: history and bookmarks (search; add a bookmark) and the open tabs of every window (list, find
// duplicates, group by site, group and ungroup). Ideas from webgenie (opt-in browser data tools, task tab groups, Apache-2.0) and openbrowse (tab organisation, MIT); written here.
//
// History and bookmarks are optional permissions the person allows with a click (Settings, Browser features). Without one the tool says so and what to do; it never asks Chrome
// itself, since Chrome takes a permission request only from a click. Nothing is deleted or closed by this tool, a history address is shown without its query string or fragment
// (they can carry tokens), and writes are limited to a new bookmark and tab grouping, both easy to undo.
export const BROWSER_DATA_TOOL = {
  name: 'browser_data',
  source: 'agent' as const,
  group: 'working' as const,
  description:
    "The person's own browser: history_search, bookmarks_search, bookmark_add, tabs_all, tabs_duplicates, tabs_group, tabs_group_by_site, tabs_ungroup. History and bookmarks need the person's permission in Settings. Nothing is closed or deleted.",
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['history_search', 'bookmarks_search', 'bookmark_add', 'tabs_all', 'tabs_duplicates', 'tabs_group', 'tabs_group_by_site', 'tabs_ungroup'] },
      text: { type: 'string', maxLength: 200 },
      days: { type: 'number', minimum: 1, maximum: 3650 },
      max: { type: 'number', minimum: 1, maximum: 500 },
      title: { type: 'string', maxLength: 200 },
      url: { type: 'string', maxLength: 2000 },
      color: { type: 'string', enum: ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'] },
      tabIds: { type: 'array', maxItems: 500, items: { type: 'number' } },
    },
    required: ['action'],
    additionalProperties: false,
  },
};

export const READ_ACTIONS = new Set(['history_search', 'bookmarks_search', 'tabs_all', 'tabs_duplicates']);

export interface TabInfo {
  id?: number;
  windowId?: number;
  groupId?: number;
  title?: string;
  url?: string;
  pendingUrl?: string;
}

/** An address as the model sees it: no query string or fragment. */
export function plainUrl(raw: string | undefined): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    if (u.protocol === 'data:' || u.protocol === 'blob:') return `${u.protocol}…`;
    return `${u.origin}${u.pathname === '/' ? '' : u.pathname}${u.search || u.hash ? '?…' : ''}`;
  } catch {
    return raw.split(/[?#]/)[0]!.slice(0, 200);
  }
}

const hostOf = (raw: string | undefined) => {
  try {
    const u = new URL(raw ?? '');
    return /^https?:$/.test(u.protocol) ? u.hostname.replace(/^www\./, '') : '';
  } catch {
    return '';
  }
};

/** Tabs that show the same page (the address without its fragment), two or more together. */
export function duplicateTabs(tabs: TabInfo[]): TabInfo[][] {
  const by = new Map<string, TabInfo[]>();
  for (const t of tabs) {
    const key = (t.url ?? '').split('#')[0]!;
    if (!key || !/^https?:/.test(key)) continue;
    by.set(key, [...(by.get(key) ?? []), t]);
  }
  return [...by.values()].filter(g => g.length > 1);
}

/** Groups of tabs that share a site, in one window each, two or more tabs and not already in a group of their own. */
export function siteGroups(tabs: TabInfo[]): Array<{ host: string; windowId: number | undefined; tabIds: number[] }> {
  const by = new Map<string, { host: string; windowId: number | undefined; tabIds: number[] }>();
  for (const t of tabs) {
    const host = hostOf(t.url);
    if (!host || t.id === undefined || (t.groupId !== undefined && t.groupId >= 0)) continue;
    const key = `${t.windowId}|${host}`;
    const entry = by.get(key) ?? { host, windowId: t.windowId, tabIds: [] };
    entry.tabIds.push(t.id);
    by.set(key, entry);
  }
  return [...by.values()].filter(g => g.tabIds.length > 1);
}

const COLORS = ['blue', 'cyan', 'green', 'yellow', 'orange', 'pink', 'purple', 'grey'];

const MISSING = (permission: string) =>
  `error: the person has not allowed ${permission} yet, so it cannot be read. Ask them (ask_user) to open Xroga Settings, Browser features, and turn on "${permission === 'history' ? 'History' : 'Bookmarks'}"; then try again. Nothing was read.`;

type ChromeApi = typeof chrome;

export async function runBrowserData(args: Record<string, unknown>, api?: ChromeApi): Promise<{ text: string; isError: boolean }> {
  const c = api ?? (globalThis as { chrome?: ChromeApi }).chrome;
  if (!c) return { text: 'error: the browser APIs are not available here.', isError: true };
  const action = String(args.action ?? '');
  const max = Math.min(500, Math.max(1, Math.floor(Number(args.max) || 50)));
  try {
    if (action === 'history_search') {
      if (!c.history) return { text: MISSING('history'), isError: true };
      const days = Math.min(3650, Math.max(1, Number(args.days) || 30));
      const items = await c.history.search({ text: String(args.text ?? ''), startTime: Date.now() - days * 86_400_000, maxResults: max });
      if (!items.length) return { text: `history · nothing matches${args.text ? ` "${String(args.text)}"` : ''} in the last ${days} days`, isError: false };
      return {
        text: [`history · ${items.length} pages in the last ${days} days, newest first`, ...items.map((i, n) => `${n + 1}. ${i.title || '(no title)'} · ${plainUrl(i.url)} · ${i.lastVisitTime ? new Date(i.lastVisitTime).toISOString().slice(0, 16).replace('T', ' ') : '?'} · ${i.visitCount ?? 0} visits`)].join('\n'),
        isError: false,
      };
    }
    if (action === 'bookmarks_search') {
      if (!c.bookmarks) return { text: MISSING('bookmarks'), isError: true };
      const found = (await c.bookmarks.search(String(args.text ?? ''))).filter(b => b.url).slice(0, max);
      if (!found.length) return { text: `bookmarks · nothing matches "${String(args.text ?? '')}"`, isError: false };
      return { text: [`bookmarks · ${found.length} found`, ...found.map((b, n) => `${n + 1}. ${b.title || '(no title)'} · ${plainUrl(b.url)}`)].join('\n'), isError: false };
    }
    if (action === 'bookmark_add') {
      if (!c.bookmarks) return { text: MISSING('bookmarks'), isError: true };
      const url = String(args.url ?? '');
      if (!/^https?:\/\//i.test(url)) return { text: 'error: bookmark_add needs an http or https address in url.', isError: true };
      const made = await c.bookmarks.create({ title: String(args.title ?? '') || url, url });
      return { text: `bookmark added: ${made.title} · ${plainUrl(made.url)}`, isError: false };
    }
    const tabs: TabInfo[] = await c.tabs.query({});
    if (action === 'tabs_all') {
      const lines = tabs.slice(0, max).map(t => `${t.id} · window ${t.windowId}${t.groupId !== undefined && t.groupId >= 0 ? ` · group ${t.groupId}` : ''} · ${t.title || '(no title)'} · ${plainUrl(t.url || t.pendingUrl)}`);
      return { text: [`tabs · ${tabs.length} open across ${new Set(tabs.map(t => t.windowId)).size} windows${tabs.length > max ? ` (first ${max})` : ''}`, ...lines].join('\n'), isError: false };
    }
    if (action === 'tabs_duplicates') {
      const dups = duplicateTabs(tabs);
      if (!dups.length) return { text: 'tabs · no two tabs show the same page', isError: false };
      return { text: [`tabs · ${dups.length} pages open more than once (none closed)`, ...dups.map(g => `- ${plainUrl(g[0]!.url)} in tabs ${g.map(t => t.id).join(', ')}`)].join('\n'), isError: false };
    }
    if (action === 'tabs_group') {
      const ids = (Array.isArray(args.tabIds) ? args.tabIds : []).map(Number).filter(n => Number.isInteger(n));
      if (!ids.length) return { text: 'error: tabs_group needs tabIds (see tabs_all).', isError: true };
      const known = new Set(tabs.map(t => t.id));
      const missing = ids.filter(i => !known.has(i));
      if (missing.length) return { text: `error: no tab with id ${missing.join(', ')}.`, isError: true };
      const groupId = await c.tabs.group({ tabIds: ids as [number, ...number[]] });
      await c.tabGroups?.update(groupId, { title: String(args.title ?? '').slice(0, 40) || undefined, ...(args.color ? { color: args.color as chrome.tabGroups.Color } : {}) }).catch(() => undefined);
      return { text: `grouped ${ids.length} tabs as group ${groupId}${args.title ? ` "${String(args.title)}"` : ''}${c.tabGroups ? '' : ' (the title and colour need the tab groups permission)'}`, isError: false };
    }
    if (action === 'tabs_group_by_site') {
      const plans = siteGroups(tabs);
      if (!plans.length) return { text: 'tabs · no site has two or more ungrouped tabs', isError: false };
      const lines: string[] = [];
      for (const [i, p] of plans.entries()) {
        const groupId = await c.tabs.group({ tabIds: p.tabIds as [number, ...number[]] });
        await c.tabGroups?.update(groupId, { title: p.host.slice(0, 40), color: COLORS[i % COLORS.length] as chrome.tabGroups.Color }).catch(() => undefined);
        lines.push(`- ${p.host}: ${p.tabIds.length} tabs → group ${groupId}`);
      }
      return { text: [`tabs · ${plans.length} groups made by site (nothing closed; tabs_ungroup undoes it)`, ...lines].join('\n'), isError: false };
    }
    if (action === 'tabs_ungroup') {
      const ids = (Array.isArray(args.tabIds) ? args.tabIds : []).map(Number).filter(n => Number.isInteger(n));
      if (!ids.length) return { text: 'error: tabs_ungroup needs tabIds.', isError: true };
      await c.tabs.ungroup(ids as [number, ...number[]]);
      return { text: `ungrouped ${ids.length} tabs`, isError: false };
    }
    return { text: `error: unknown action "${action}".`, isError: true };
  } catch (error) {
    return { text: `error: ${error instanceof Error ? error.message : String(error)}`, isError: true };
  }
}
