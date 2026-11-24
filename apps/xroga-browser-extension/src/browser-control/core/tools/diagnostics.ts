// `diagnostics`: the page's console errors and the requests it made. Read-only. Recording starts on the first call for a tab (Network, Runtime and Log
// domains on), so the first answer says what to do to make the page report: repeat the action, or reload, then ask again.
import type { DiagnosticsArgs } from '../../protocol/schemas';
import type { ToolContext, ToolOutcome } from '../controller';
import { DiagnosticsLog, formatCookies, formatDiagnostics, formatIssues, formatStorage } from '../diagnostics';
import type { CookieInfo, InspectorIssue, StorageSummary } from '../diagnostics';
import type { TabAttachment } from '../ports';

const LOGS = new WeakMap<TabAttachment, DiagnosticsLog>();
const ISSUES = new WeakMap<TabAttachment, InspectorIssue[]>();

async function start(attachment: TabAttachment): Promise<DiagnosticsLog> {
  const log = new DiagnosticsLog();
  const { cdp } = attachment;
  cdp.on('Network.requestWillBeSent', (p, s) => {
    const e = p as { requestId: string; type?: string; timestamp?: number; request: { method: string; url: string } };
    log.request(`${s ?? ''}|${e.requestId}`, e.request.method, e.request.url, e.type, e.timestamp);
  });
  cdp.on('Network.responseReceived', (p, s) => {
    const e = p as { requestId: string; response: { status: number } };
    log.response(`${s ?? ''}|${e.requestId}`, e.response.status);
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
    await attachment.cdp.send(undefined, 'Audits.enable').catch(() => undefined);
    await new Promise(r => setTimeout(r, 400));
    return { data: { issues: list.length }, pageText: formatIssues(list).join('\n') };
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
  // Console messages and URLs come from the page: they print inside the untrusted boundary.
  return { data: { console: log.console.length, network: log.net.length }, pageText: formatDiagnostics(log, args).join('\n') };
}
