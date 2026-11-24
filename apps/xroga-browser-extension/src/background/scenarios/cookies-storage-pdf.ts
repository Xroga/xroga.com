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
