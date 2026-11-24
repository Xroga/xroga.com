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
