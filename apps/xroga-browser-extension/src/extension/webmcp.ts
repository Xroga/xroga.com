// Reads and calls the tools a page registered through WebMCP, in the page's own world (where the hook of browser-control/core/webmcp-hook.ts keeps them).
import type { PageTool, WebMcpListing } from '@src/agent/webmcp';

export async function listPageTools(tabId: number): Promise<WebMcpListing> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const w = window as unknown as { __xrogaWebMcp?: { tools: Map<string, { name: string; description?: string; inputSchema?: unknown; annotations?: { readOnlyHint?: boolean } }>; native: boolean; registered: number } };
      const h = w.__xrogaWebMcp;
      if (!h) return { hooked: false, native: false, seen: 0, tools: [] as PageTool[] };
      const tools = [...h.tools.values()].map(t => ({ name: String(t.name), description: String(t.description ?? ''), readOnly: t.annotations?.readOnlyHint === true, schema: JSON.parse(JSON.stringify(t.inputSchema ?? null)) as unknown }));
      return { hooked: true, native: h.native, seen: h.registered, tools };
    },
  });
  return (result?.result ?? { hooked: false, native: false, seen: 0, tools: [] }) as WebMcpListing;
}

export async function callPageTool(tabId: number, name: string, input: Record<string, unknown>): Promise<{ ok: true; value: unknown; readOnly: boolean } | { ok: false; error: string }> {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    args: [name, input],
    func: async (toolName: string, args: Record<string, unknown>) => {
      const w = window as unknown as { __xrogaWebMcp?: { tools: Map<string, { execute: (input: unknown, client?: unknown) => Promise<unknown>; annotations?: { readOnlyHint?: boolean } }> } };
      const t = w.__xrogaWebMcp?.tools.get(toolName);
      if (!t) return { ok: false as const, error: `the page has no tool named ${toolName} (list them first)` };
      try {
        // the second argument is the agent handle of the proposal: a page that wants the person's confirmation asks through it, and here that is not available
        const value = await Promise.race([
          t.execute(args, { requestUserInteraction: async (cb: () => unknown) => cb() }),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('the tool did not answer in 60 seconds')), 60_000)),
        ]);
        return { ok: true as const, value: JSON.parse(JSON.stringify(value ?? null)) as unknown, readOnly: t.annotations?.readOnlyHint === true };
      } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
      }
    },
  });
  return (result?.result ?? { ok: false, error: 'the page did not answer' }) as { ok: true; value: unknown; readOnly: boolean } | { ok: false; error: string };
}

/** Loads the page again and waits (up to 20 s) until it has finished, so the hook sees what it registers while loading. */
export async function reloadTab(tabId: number): Promise<void> {
  await new Promise<void>(resolve => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    };
    const onUpdated = (id: number, info: { status?: string }) => {
      if (id === tabId && info.status === 'complete') setTimeout(done, 800);
    };
    const timer = setTimeout(done, 20_000);
    chrome.tabs.onUpdated.addListener(onUpdated);
    void chrome.tabs.reload(tabId).catch(done);
  });
}
