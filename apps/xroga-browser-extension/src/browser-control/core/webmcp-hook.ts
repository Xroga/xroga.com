// WebMCP: a page may offer tools to an AI agent through `navigator.modelContext.registerTool({ name, description, inputSchema, execute })`
// (a proposed web standard; Chrome has it behind a flag). A page only registers when that object exists, and it registers while it loads, so a tab the agent
// works in gets this small hook at the start of every document: it keeps a list of what the page registers, and where the browser has no `modelContext`
// it supplies a bare one so a page that looks for it offers its tools. `src/extension/webmcp.ts` lists and calls them. The idea comes from reading
// Panoptik (AGPL: concepts only, no code taken); written fresh.

export const WEBMCP_HOOK_SOURCE = `(() => {
  if (window.__xrogaWebMcp) return;
  const tools = new Map();
  const state = { tools, native: false, registered: 0, shimmed: [] };
  const keep = t => { if (t && typeof t.name === 'string' && t.name && typeof t.execute === 'function') { tools.set(t.name, t); state.registered++; } };
  const drop = n => { tools.delete(String(n)); };
  Object.defineProperty(window, '__xrogaWebMcp', { value: state, configurable: true });
  const wrap = mc => {
    const reg = mc.registerTool;
    const unreg = mc.unregisterTool;
    const provide = mc.provideContext;
    const clear = mc.clearContext;
    mc.registerTool = function (t) { keep(t); return reg.apply(this, arguments); };
    if (typeof unreg === 'function') mc.unregisterTool = function (n) { drop(n); return unreg.apply(this, arguments); };
    if (typeof provide === 'function') mc.provideContext = function (c) { tools.clear(); (c && c.tools || []).forEach(keep); return provide.apply(this, arguments); };
    if (typeof clear === 'function') mc.clearContext = function () { tools.clear(); return clear.apply(this, arguments); };
  };
  try {
    // the proposal names the object navigator.modelContext; earlier drafts and some pages use document.modelContext or window.modelContext
    const holders = [['navigator', navigator], ['window', window], ['document', document]];
    const found = holders.map(h => h[1].modelContext).find(mc => mc && typeof mc.registerTool === 'function');
    if (found) {
      state.native = true;
      holders.forEach(h => { const mc = h[1].modelContext; if (mc && typeof mc.registerTool === 'function') { try { wrap(mc); } catch (e) {} } });
    }
    const shim = found ? null : {
      registerTool(t) { keep(t); return { unregister() { drop(t && t.name); } }; },
      unregisterTool(n) { drop(n); },
      provideContext(c) { tools.clear(); (c && c.tools || []).forEach(keep); },
      clearContext() { tools.clear(); },
    };
    holders.forEach(h => {
      if (h[1].modelContext) return;
      const mc = shim || found;
      try { Object.defineProperty(h[1], 'modelContext', { value: mc, configurable: true }); state.shimmed.push(h[0]); } catch (e) {}
    });
  } catch (e) { /* the page keeps working without it */ }
})()`;

export const WEBMCP_UNHOOK_SOURCE = `(() => { try { const s = window.__xrogaWebMcp; if (s) { const holders = { navigator, window, document }; (s.shimmed || []).forEach(n => { try { delete holders[n].modelContext; } catch (e) {} }); } delete window.__xrogaWebMcp; } catch (e) {} })()`;

interface CdpLike {
  send<T = unknown>(sessionId: string | undefined, method: string, params?: object, timeoutMs?: number): Promise<T>;
}
const hookIds = new WeakMap<object, string>();

/** Puts the hook into the page now and into every document it loads next. Never throws. */
export async function installWebMcpHook(cdp: CdpLike): Promise<void> {
  try {
    const added = await cdp.send<{ identifier?: string }>(undefined, 'Page.addScriptToEvaluateOnNewDocument', { source: WEBMCP_HOOK_SOURCE });
    if (added?.identifier) hookIds.set(cdp, added.identifier);
    await cdp.send(undefined, 'Runtime.evaluate', { expression: WEBMCP_HOOK_SOURCE, returnByValue: true });
  } catch {
    /* the page keeps working; its tools are then not listed */
  }
}

/** Takes the hook out when the extension lets go of the tab. Never throws. */
export async function removeWebMcpHook(cdp: CdpLike): Promise<void> {
  try {
    const id = hookIds.get(cdp);
    if (id) await cdp.send(undefined, 'Page.removeScriptToEvaluateOnNewDocument', { identifier: id }, 2_000);
    hookIds.delete(cdp);
    await cdp.send(undefined, 'Runtime.evaluate', { expression: WEBMCP_UNHOOK_SOURCE, returnByValue: true }, 2_000);
  } catch {
    /* the tab is gone or detached */
  }
}
