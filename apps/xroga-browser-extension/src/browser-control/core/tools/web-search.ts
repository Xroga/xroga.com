// `web_search`: a search in one call. A search engine's results page is opened in a background tab (the navigation policy applies as for any tab), the results are read by
// the page itself as title, address and snippet, and the tab is closed again; the session's own tab is never left. Searching through result pages by clicking costs many turns
// and meets anti-bot checks; here a check the engine raises is reported, never bypassed, and another engine can be asked. Nothing leaves the browser except the page request
// the person's own browser would make (browser-use's `search()` helper made the same point for a no-browser search API; Xroga's search stays in the person's browser).
import type { SearchHit } from '../../probe/source';
import type { WebSearchArgs } from '../../protocol/schemas';
import type { ToolContext, ToolOutcome } from '../controller';
import { closeTab, openTab } from './navigate';
import { SearchGate } from './search-gate';

const gate = new SearchGate<SearchHit>();
/** For tests. */
export const searchGate = gate;

export const ENGINES = {
  duckduckgo: (q: string) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`,
  bing: (q: string) => `https://www.bing.com/search?q=${encodeURIComponent(q)}&setlang=en`,
  google: (q: string) => `https://www.google.com/search?q=${encodeURIComponent(q)}&hl=en`,
} as const;
export type Engine = keyof typeof ENGINES;
/** A check may point an engine at a local page instead (the scenarios do); empty in the product. */
export const engineOverride: Partial<Record<Engine, (q: string) => string>> = {};

export function describeHits(engine: string, query: string, hits: SearchHit[], blocked?: string): string[] {
  if (blocked) return [`web_search · ${engine} · "${query}" · the engine asked for a human check (${blocked}). It is not bypassed: try another engine, or ask the person to pass the check in a tab.`];
  if (!hits.length) return [`web_search · ${engine} · "${query}" · no results read. Try other words or another engine.`];
  return [
    `web_search · ${engine} · "${query}" · ${hits.length} result${hits.length === 1 ? '' : 's'}`,
    ...hits.flatMap((h, i) => [`${i + 1}. ${h.title}`, `   ${h.url}`, ...(h.snippet ? [`   ${h.snippet}`] : [])]),
  ];
}

export async function webSearch(ctx: ToolContext, args: WebSearchArgs): Promise<ToolOutcome> {
  const asked: Engine = args.engine ?? 'duckduckgo';
  const query = args.query.trim();
  // The same question read lately is answered from that read; an engine that just asked for a human check is left alone and another is used.
  const cachedHit = gate.cached(asked, query);
  if (cachedHit) return { data: { engine: asked, query, hits: cachedHit.hits }, lines: [`(read earlier in this run; reused)`, ...describeHits(asked, query, cachedHit.hits)] };
  const chosen = gate.pick(asked, Object.keys(ENGINES));
  if (!chosen) {
    const note = `web_search · every engine asked for a human check a short while ago and is being left alone. Do not search again now: read the pages already found, open a firm's own site, or ask the person to pass a check in a tab.`;
    return { data: { engine: asked, query, hits: [], blocked: 'all engines resting' }, lines: [note] };
  }
  const engine = chosen as Engine;
  const pause = gate.wait(engine);
  if (pause > 0) await new Promise(r => setTimeout(r, pause));
  const previous = ctx.session.activeTabId;
  const opened = await openTab(ctx, { action: 'open', url: (engineOverride[engine] ?? ENGINES[engine])(query) });
  const tabId = opened.data!.opened;
  let hits: SearchHit[] = [];
  let blocked: string | undefined;
  try {
    const child: ToolContext = { ...ctx, tabId, tab: () => ctx.controller.tabState(tabId), attach: () => ctx.controller.attach(tabId) };
    const attachment = await child.attach();
    const frame = (await attachment.topology.frames())[0];
    const found = await child.tab().probe!.callGlobal<{ hits: SearchHit[]; blocked?: string }>(frame, 'searchResults', engine, args.limit ?? 10);
    hits = found.hits;
    blocked = found.blocked;
  } finally {
    await closeTab(ctx, { action: 'close', tabId }).catch(() => undefined);
    if (previous !== null && previous !== undefined && ctx.session.hasTab(previous)) ctx.session.setActive(previous);
  }
  gate.record(engine, query, { hits, ...(blocked ? { blocked } : {}) });
  const moved = engine !== asked ? [`(${asked} is resting after a check, so ${engine} was used)`] : [];
  return { data: { engine, query, hits, ...(blocked ? { blocked } : {}) }, lines: [...moved, ...describeHits(engine, query, hits, blocked)] };
}
