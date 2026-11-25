// `diagnostics`: the page's console errors and the requests it made. Read-only. Recording starts on the first call for a tab (Network, Runtime and Log
// domains on), so the first answer says what to do to make the page report: repeat the action, or reload, then ask again.
import type { DiagnosticsArgs } from '../../protocol/schemas';
import type { ToolContext, ToolOutcome } from '../controller';
import { DiagnosticsLog, formatCookies, formatDiagnostics, formatIssues, formatStorage, redactBody, shownHeaders, stripUrl } from '../diagnostics';
import type { CookieInfo, InspectorIssue, StorageSummary } from '../diagnostics';
import type { TabAttachment } from '../ports';

const LOGS = new WeakMap<TabAttachment, DiagnosticsLog>();
const ISSUES = new WeakMap<TabAttachment, InspectorIssue[]>();
/** The ids of the page's own API requests, newest last, with the full address kept in memory only: a body is read on request, never stored. */
interface Seen { session?: string; id: string; type?: string; method: string; url: string; status?: number; mime?: string; headers?: Record<string, string> }
const SEEN = new WeakMap<TabAttachment, Seen[]>();

async function start(attachment: TabAttachment): Promise<DiagnosticsLog> {
  const log = new DiagnosticsLog();
  const { cdp } = attachment;
  const seen: Seen[] = [];
  SEEN.set(attachment, seen);
  cdp.on('Network.requestWillBeSent', (p, s) => {
    const e = p as { requestId: string; type?: string; timestamp?: number; request: { method: string; url: string } };
    if (e.type === 'XHR' || e.type === 'Fetch' || e.type === 'Document') {
      seen.push({ session: s, id: e.requestId, type: e.type, method: e.request.method, url: e.request.url });
      if (seen.length > 200) seen.shift();
    }
    log.request(`${s ?? ''}|${e.requestId}`, e.request.method, e.request.url, e.type, e.timestamp);
  });
  cdp.on('Network.responseReceived', (p, s) => {
    const e = p as { requestId: string; response: { status: number; mimeType?: string; headers?: Record<string, string> } };
    log.response(`${s ?? ''}|${e.requestId}`, e.response.status);
    const hit = seen.find(x => x.id === e.requestId && x.session === s);
    if (hit) { hit.status = e.response.status; hit.mime = e.response.mimeType; hit.headers = e.response.headers; }
  });
  cdp.on('Network.loadingFailed', (p, s) => {
    const e = p as { requestId: string; errorText: string; canceled?: boolean };
    if (!e.canceled) log.failed(`${s ?? ''}|${e.requestId}`, e.errorText);
  });
  cdp.on('Network.loadingFinished', (p, s) => {
    const e = p as { requestId: string; timestamp?: number; encodedDataLength?: number };
    log.finished(`${s ?? ''}|${e.requestId}`, e.timestamp, e.encodedDataLength);
  });
  cdp.on('Runtime.consoleAPICalled', p => {
    const e = p as { type: string; args: Array<{ value?: unknown; description?: string; type?: string }> };
    const level = e.type === 'error' || e.type === 'assert' ? 'error' : e.type === 'warning' ? 'warning' : e.type === 'info' ? 'info' : 'log';
    log.log(level, e.args.map(a => (a.value !== undefined ? String(a.value) : (a.description ?? a.type ?? ''))).join(' '));
  });
  cdp.on('Runtime.exceptionThrown', p => {
    const d = (p as { exceptionDetails: { text?: string; url?: string; lineNumber?: number; exception?: { description?: string } } }).exceptionDetails;
    log.log('exception', `${d.exception?.description ?? d.text ?? 'exception'}${d.url ? ` (${d.url.split(/[?#]/)[0]}:${(d.lineNumber ?? 0) + 1})` : ''}`);
  });
  cdp.on('Log.entryAdded', p => {
    const e = (p as { entry: { level: string; text: string; url?: string } }).entry;
    if (e.level === 'error' || e.level === 'warning') log.log(e.level, `${e.text}${e.url ? ` (${e.url.split(/[?#]/)[0]})` : ''}`);
  });
  await Promise.all(['Network.enable', 'Runtime.enable', 'Log.enable'].map(m => cdp.send(undefined, m).catch(() => undefined)));
  return log;
}

export async function diagnostics(ctx: ToolContext, args: DiagnosticsArgs): Promise<ToolOutcome> {
  const attachment = await ctx.attach();
  // Cookies and storage are read when asked, from the browser itself, and show names, flags and sizes only: a value can be a login.
  if (args.kind === 'issues') {
    // Audits.enable replays the issues the page already has, then reports new ones: listen first, enable, give the replay a moment.
    let list = ISSUES.get(attachment);
    if (!list) {
      list = [];
      ISSUES.set(attachment, list);
      const seen = list;
      attachment.cdp.on('Audits.issueAdded', p => { const i = (p as { issue?: InspectorIssue }).issue; if (i && seen.length < 500) seen.push(i); });
    }
    let failed = '';
    await attachment.cdp.send(undefined, 'Audits.enable').catch((error: unknown) => {
      failed = error instanceof Error ? error.message : String(error);
    });
    await new Promise(r => setTimeout(r, 700));
    return { data: { issues: list.length }, pageText: [...(failed ? [`issues · the browser would not start reporting issues (${failed})`] : []), ...formatIssues(list)].join('\n') };
  }
  if (args.kind === 'cookies') {
    await attachment.cdp.send(undefined, 'Network.enable').catch(() => undefined);
    const got = (await attachment.cdp.send(undefined, 'Network.getCookies').catch(() => ({ cookies: [] }))) as { cookies?: CookieInfo[] };
    const here = (await attachment.cdp.send(undefined, 'Runtime.evaluate', { expression: 'location.href', returnByValue: true }).catch(() => undefined)) as { result?: { value?: string } } | undefined;
    const url = here?.result?.value ?? '';
    return { data: { cookies: (got.cookies ?? []).length }, pageText: formatCookies(got.cookies ?? [], url).join('\n') };
  }
  if (args.kind === 'storage') {
    const expr = `(() => { const sz = s => { try { return Object.keys(s).map(k => [k, (s.getItem(k) || '').length]); } catch { return []; } }; return JSON.stringify({ local: sz(localStorage), session: sz(sessionStorage) }); })()`;
    const got = (await attachment.cdp.send(undefined, 'Runtime.evaluate', { expression: expr, returnByValue: true }).catch(() => undefined)) as { result?: { value?: string } } | undefined;
    let summary: StorageSummary = { local: [], session: [] };
    try { summary = JSON.parse(got?.result?.value ?? '') as StorageSummary; } catch { /* the page held it back */ }
    return { data: { local: summary.local.length, session: summary.session.length }, pageText: formatStorage(summary).join('\n') };
  }
  let log = LOGS.get(attachment);
  if (!log) {
    log = await start(attachment);
    LOGS.set(attachment, log);
    return {
      data: { recording: true },
      lines: [
        'diagnostics · recording started for this tab: nothing earlier was kept. Repeat the action that failed (or reload the page), then call diagnostics again.',
      ],
    };
  }
  // A same-site GET made from inside the page, so it carries the person's own session: the way to read a JSON list behind a login in one call instead of paging through the screen.
  // Only the page's own site, only GET, the answer shown with secrets hidden. Idea: webgenie fetch_json (Apache-2.0), written fresh.
  if (args.kind === 'fetch') {
    const target = (args.urlPattern ?? '').trim();
    if (!target) return { data: { fetched: false }, pageText: 'fetch · give the address in urlPattern: a path such as /api/orders?page=2, or a full address on the own site of this page' };
    const expr = `(async () => { try { const u = new URL(${JSON.stringify(target)}, location.href); if (u.origin !== location.origin) return JSON.stringify({ refused: 'not the own site of the page: ' + u.origin }); const r = await fetch(u.href, { credentials: 'include', headers: { accept: 'application/json, text/plain, */*' } }); const text = await r.text(); return JSON.stringify({ status: r.status, type: r.headers.get('content-type') || '', length: text.length, body: text.slice(0, 200000) }); } catch (e) { return JSON.stringify({ error: String(e && e.message || e) }); } })()`;
    const got = (await attachment.cdp.send(undefined, 'Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }).catch(() => undefined)) as { result?: { value?: string } } | undefined;
    let r: { status?: number; type?: string; length?: number; body?: string; refused?: string; error?: string } = {};
    try { r = JSON.parse(got?.result?.value ?? '{}'); } catch { /* the page held it back */ }
    if (r.refused || r.error || r.status === undefined) return { data: { fetched: false }, pageText: `fetch · not done: ${r.refused ?? r.error ?? 'the page gave no answer'}` };
    return { data: { fetched: true, status: r.status }, pageText: [`fetch · GET ${stripUrl(new URL(target, 'http://x/').pathname)} → ${r.status} (${r.type || 'no type'}, ${r.length} characters)`, 'body (secrets hidden):', redactBody(r.body ?? '', r.type)].join(String.fromCharCode(10)) };
  }
  // One request in detail: its status, the response headers that describe the answer, and the body with secrets hidden. The newest request whose address contains urlPattern.
  if (args.kind === 'request') {
    const want = (args.urlPattern ?? '').toLowerCase();
    const list = SEEN.get(attachment) ?? [];
    const hit = [...list].reverse().find(x => (want ? x.url.toLowerCase().includes(want) : x.type !== 'Document'));
    if (!hit) return { data: { found: false }, pageText: `request · no request seen whose address contains "${args.urlPattern ?? ''}". Repeat the action in the page, then try again; the list of what was seen is diagnostics with kind network.` };
    let body = '';
    try {
      const got = (await attachment.cdp.send(hit.session, 'Network.getResponseBody', { requestId: hit.id })) as { body: string; base64Encoded?: boolean };
      body = got.base64Encoded ? '[binary body not shown]' : redactBody(got.body, hit.mime);
    } catch (error) {
      body = `[the browser no longer holds the body: ${error instanceof Error ? error.message : String(error)}]`;
    }
    return {
      data: { found: true, status: hit.status ?? null },
      pageText: [`request · ${hit.method} ${stripUrl(hit.url)} → ${hit.status ?? 'no answer yet'}${hit.mime ? ` (${hit.mime})` : ''}`, ...shownHeaders(hit.headers), 'body (secrets hidden):', body].join(String.fromCharCode(10)),
    };
  }
  // Console messages and URLs come from the page: they print inside the untrusted boundary.
  return { data: { console: log.console.length, network: log.net.length }, pageText: formatDiagnostics(log, args).join('\n') };
}
