// `diagnostics` kinds cookies and storage (names, flags and sizes, never values) and the page-to-PDF print used by save_page_pdf.
import { printTab } from '../../extension/page-pdf';
import { FIXTURE_ORIGIN } from '../fixtures-config';
import { defineScenario, outcome } from './registry';

defineScenario({
  id: 'S3-cookies-storage',
  set: 'C',
  title: 'diagnostics lists cookies with their flags and storage keys with their sizes, and never shows a value',
  covers: 'kind cookies: names, Secure/HttpOnly/SameSite, session or expiry, a login-like cookie scripts can read is flagged; kind storage: key names and sizes; secret values absent',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-cookies-storage.html`);
    await new Promise(r => setTimeout(r, 400));
    const cookies = await ctx.call('diagnostics', { kind: 'cookies' });
    const storage = await ctx.call('diagnostics', { kind: 'storage' });
    const c = cookies.text;
    const s = storage.text;
    return outcome(
      'two cookies by name with flags, session_id flagged as a login cookie scripts can read, no value shown; auth_token and draft as keys with sizes only',
      JSON.stringify({ cookies: c.slice(0, 900), storage: s.slice(0, 500) }),
      cookies.ok && storage.ok &&
        /cookies · 2 for this page/.test(c) && /session_id/.test(c) && /theme/.test(c) && /add HttpOnly/.test(c) &&
        !/abc123secretvalue/.test(c) && !/dark/.test(c.replace(/theme/g, '')) &&
        /localStorage · 1 key, 120 characters/.test(s) && /auth_token · 120 characters/.test(s) && /sessionStorage · 1 key/.test(s) && !/xxxxx/.test(s),
    );
  },
});

defineScenario({
  id: 'S3-page-pdf',
  set: 'C',
  title: 'the browser prints the open page to a real PDF',
  covers: 'Page.printToPDF over the extension debugger: bytes begin with %PDF and are of a plausible size',
  async run(ctx) {
    const tabId = await ctx.open(`${FIXTURE_ORIGIN}/c-audit-page.html`);
    const printed = await printTab(tabId);
    const head = printed.ok ? atob(printed.base64.slice(0, 8)) : '';
    return outcome(
      'a PDF that begins with %PDF and is more than 1 KB',
      printed.ok ? `${printed.bytes} bytes, starts ${JSON.stringify(head.slice(0, 5))}` : printed.reason,
      printed.ok && head.startsWith('%PDF') && printed.bytes > 1024,
    );
  },
});

defineScenario({
  id: 'S3-browser-issues',
  set: 'C',
  title: 'diagnostics issues lists what the browser itself reports about a page (quirks mode)',
  covers: 'kind issues: Audits issues replayed on enable, grouped with counts, sentences not codes',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-issues.html`);
    await new Promise(r => setTimeout(r, 400));
    const first = await ctx.call('diagnostics', { kind: 'issues' });
    // The browser reports a page's issues while it loads once reporting is on, so the page is loaded again.
    await ctx.call('navigate', { url: `${FIXTURE_ORIGIN}/c-issues.html` });
    await new Promise(r => setTimeout(r, 800));
    const second = await ctx.call('diagnostics', { kind: 'issues' });
    const t = second.text;
    return outcome(
      'the browser reports quirks mode for the page without a doctype, once the page is loaded again after reporting was switched on',
      JSON.stringify({ first: first.text.slice(0, 300), second: t.slice(0, 700) }),
      first.ok && second.ok && /issues · \d+ kinds/.test(t) && /quirks mode/.test(t),
    );
  },
});

defineScenario({
  id: 'S3-audit-lcp',
  set: 'C',
  title: 'audit_page names the largest element of the page and where its time went',
  covers: 'largest-contentful-paint entry: element, and resource phases when it is a file',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-audit-page.html`);
    await new Promise(r => setTimeout(r, 600));
    const r = await ctx.call('audit_page', {});
    return outcome(
      'a line starting "largest element: <" in the audit',
      (r.text.match(/largest element:[^\n]*/) ?? ['none'])[0],
      r.ok && /largest element: </.test(r.text),
    );
  },
});

defineScenario({
  id: 'S3-read-styles',
  set: 'C',
  title: 'read with styles shows an element\'s computed look and what covers it',
  covers: 'styles: display, colour, size, box in the viewport, and the element on top of its centre',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-styles.html`);
    await ctx.call('snapshot');
    const found = await ctx.call('find', { role: 'button', name: 'Buy plan' });
    const ref = /\[(\w+)\]/.exec(found.text)?.[1];
    const r = ref ? await ctx.call('read', { ref, styles: true }) : undefined;
    const t = r?.text ?? '';
    return outcome(
      'the button is reported as covered by the backdrop div at its centre, with its box and styles',
      t.slice(0, 600) || found.text.slice(0, 300),
      !!r?.ok && /display: inline-block/.test(t) && /box: \d+x\d+ at/.test(t) && /covered at its centre by <div#cover\.modal-backdrop>/.test(t),
    );
  },
});

defineScenario({
  id: 'S3-lighthouse',
  set: 'C',
  title: 'Lighthouse runs on a page in its own window and comes back as a summary',
  covers: 'the helper page loads the bundle, attaches to the audited tab, runs a navigation audit and the windows are closed afterwards',
  async run() {
    const { runLighthouse } = await import('../../extension/lighthouse');
    const windowsBefore = (await chrome.windows.getAll()).length;
    const r = await runLighthouse({ url: `${FIXTURE_ORIGIN}/c-audit-page.html`, device: 'desktop', categories: ['accessibility', 'seo'] });
    await new Promise(res => setTimeout(res, 500));
    const windowsAfter = (await chrome.windows.getAll()).length;
    return outcome(
      'a summary with Accessibility and SEO scores and failing audits, and no window left open',
      `${r.text.slice(0, 900)} | windows ${windowsBefore} -> ${windowsAfter}`,
      !r.isError && /scores \(0 to 100\):.*Accessibility \d+/.test(r.text) && /SEO \d+/.test(r.text) && windowsAfter <= windowsBefore,
    );
  },
});

defineScenario({
  id: 'S3-wait-network-idle',
  set: 'C',
  title: 'wait networkIdle holds until the page has stopped loading and receiving',
  covers: 'a page that fetches five times 300 ms apart: not idle in the middle, idle after the last',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-idle.html`);
    const early = await ctx.call('wait', { networkIdle: true, timeoutMs: 150 });
    const started = Date.now();
    const late = await ctx.call('wait', { networkIdle: true, timeoutMs: 8000 });
    const waited = Date.now() - started;
    const done = await ctx.call('read', {});
    return outcome(
      'too early it says the page is still receiving; given time it returns once five fetches have landed',
      JSON.stringify({ early: early.ok, earlyText: early.text.slice(0, 160), late: late.ok, waited, count: /\b5\b/.test(done.text) }),
      !early.ok && /still loading or still receiving/.test(early.text + JSON.stringify(early.error ?? '')) && late.ok && /\b5\b/.test(done.text),
    );
  },
});

defineScenario({
  id: 'S3-tab-tidy',
  set: 'C',
  title: 'a tab the agent opened is closed after a long idle time; the active tab and the person\'s own tabs stay',
  covers: 'the layer reports a tab it opens; tidyNow closes the idle agent tab, keeps the active one and a tab the person opened, mutes a background tab',
  async run(ctx) {
    const { tidyNow, IDLE_MS } = await import('../../extension/tab-tidy');
    const base = await ctx.open(`${FIXTURE_ORIGIN}/c-text.html`);
    const before = new Set((await chrome.tabs.query({})).map(t => t.id));
    await ctx.call('tabs', { action: 'open', url: `${FIXTURE_ORIGIN}/c-audit-page.html` });
    await new Promise(r => setTimeout(r, 600));
    const agentTab = (await chrome.tabs.query({})).find(t => t.id !== undefined && !before.has(t.id));
    // The person's own tab, opened by hand (not through the layer), and the first tab brought to the front again.
    const mine = await chrome.tabs.create({ url: `${FIXTURE_ORIGIN}/c-text.html`, active: false });
    await chrome.tabs.update(base, { active: true });
    const tracked = ((await chrome.storage.session.get('xroga_agent_tabs')).xroga_agent_tabs ?? {}) as Record<string, unknown>;
    const closed = await tidyNow(async () => false, Date.now() + IDLE_MS + 120_000);
    await new Promise(r => setTimeout(r, 400));
    const alive = async (id?: number) => (id === undefined ? false : !!(await chrome.tabs.get(id).catch(() => undefined)));
    const result = { tracked: agentTab?.id !== undefined && String(agentTab.id) in tracked, agentClosed: closed.includes(agentTab?.id ?? -1) && !(await alive(agentTab?.id)), baseAlive: await alive(base), mineAlive: await alive(mine.id) };
    if (mine.id !== undefined) await chrome.tabs.remove(mine.id).catch(() => undefined);
    return outcome(
      'the layer-opened tab was tracked and closed; the tab in front and the person\'s tab stayed',
      JSON.stringify(result),
      result.tracked && result.agentClosed && result.baseAlive && result.mineAlive,
    );
  },
});

defineScenario({
  id: 'S3-ghost-text',
  set: 'C',
  title: 'fully transparent text is not proof that something is on the page',
  covers: 'wait text finds the visible sentence and does not accept a pre-rendered success banner at opacity 0 (browser-use ax.py VISIBLE_JS)',
  async run(ctx) {
    await ctx.open(`${FIXTURE_ORIGIN}/c-ghost-text.html`);
    const shown = await ctx.call('wait', { text: 'is being reviewed', timeoutMs: 800 });
    const ghost = await ctx.call('wait', { text: 'Payment successful', timeoutMs: 600 });
    const nested = await ctx.call('wait', { text: 'Order confirmed', timeoutMs: 600 });
    const gone = await ctx.call('wait', { textGone: 'Payment successful', timeoutMs: 600 });
    return outcome(
      'the visible text is found; the two transparent texts are not found, and the transparent one counts as gone',
      JSON.stringify({ shown: shown.ok, ghost: ghost.ok, nested: nested.ok, gone: gone.ok }),
      shown.ok && !ghost.ok && !nested.ok && gone.ok,
    );
  },
});
