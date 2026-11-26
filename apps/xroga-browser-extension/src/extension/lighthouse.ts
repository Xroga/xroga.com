// Runs Lighthouse (entrypoints/lighthouse) on one address: a small unfocused window holds the page being audited, a minimised window holds the page that drives Lighthouse, and the
// summary comes back as a message. Both windows are closed at the end, whatever happened. One audit at a time: Lighthouse measures the machine too, and two would disturb each other.
const TIMEOUT_MS = 5 * 60_000;
let running: Promise<unknown> = Promise.resolve();

export interface LighthouseArgs {
  url?: string;
  device?: string;
  categories?: string[];
}

function once(args: LighthouseArgs, windowsOf: { test?: number; helper?: number }): Promise<{ text: string; isError: boolean }> {
  return new Promise(resolve => {
    const id = crypto.randomUUID();
    let done = false;
    const finish = async (value: { text: string; isError: boolean }) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      chrome.runtime.onMessage.removeListener(listener);
      for (const w of [windowsOf.helper, windowsOf.test]) if (w !== undefined) await chrome.windows.remove(w).catch(() => undefined);
      resolve(value);
    };
    const listener = (message: unknown) => {
      const m = message as { type?: string; id?: string; ok?: boolean; summary?: string; error?: string } | undefined;
      if (m?.type !== 'xroga.lighthouse.result' || m.id !== id) return;
      void finish(m.ok ? { text: m.summary ?? 'lighthouse · no summary', isError: false } : { text: `error: Lighthouse could not audit this page (${m.error ?? 'unknown reason'}). audit_page and diagnostics still work on it.`, isError: true });
    };
    const timer = setTimeout(() => void finish({ text: 'error: Lighthouse did not finish within five minutes; the page may be too slow or blocked. audit_page and diagnostics still work on it.', isError: true }), TIMEOUT_MS);
    chrome.runtime.onMessage.addListener(listener);
    void (async () => {
      try {
        const test = await chrome.windows.create({ url: 'about:blank', focused: false, state: 'normal', width: 1280, height: 900 });
        windowsOf.test = test?.id;
        const tabId = test?.tabs?.[0]?.id;
        if (tabId === undefined) throw new Error('no tab to audit');
        const query = new URLSearchParams({ id, tab: String(tabId), url: String(args.url), device: args.device === 'desktop' ? 'desktop' : 'mobile', categories: (args.categories ?? []).join(',') });
        const helper = await chrome.windows.create({ url: chrome.runtime.getURL(`/lighthouse.html?${query}`), focused: false, state: 'minimized' });
        windowsOf.helper = helper?.id;
      } catch (error) {
        await finish({ text: `error: could not open the audit windows (${error instanceof Error ? error.message : String(error)}).`, isError: true });
      }
    })();
  });
}

/** One audit at a time. The address is checked by the caller (policy, blocked sites). */
export function runLighthouse(args: LighthouseArgs): Promise<{ text: string; isError: boolean }> {
  const next = running.catch(() => undefined).then(() => once(args, {}));
  running = next;
  return next;
}
