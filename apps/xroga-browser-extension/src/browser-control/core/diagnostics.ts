/**
 * What the page itself reports about a failed action: its console errors and the requests it made. A button that "does nothing", a success message with no
 * record behind it, a form that reloads empty: the cause is usually a request answered 4xx/5xx or a script error, and the page's text does not say so.
 *
 * The idea and the tool shape (read_console, read_network, recording that starts on first use) are from OpenSidekick (esterhuizen/opensidekick @ 6f11eeea,
 * MIT, src/background/tools.js). The recorder here is Xroga's own: it keeps method, status and the URL WITHOUT its query string or fragment (a query can carry
 * a token), never request or response bodies or headers, and a bounded ring.
 */
export interface NetEntry {
  method: string;
  /** Origin and path; the query and fragment are dropped. */
  url: string;
  type: string;
  status?: number;
  failed?: string;
  at: number;
  /** Bytes over the network and milliseconds from request to the end of the download, when the browser reported them. */
  bytes?: number;
  ms?: number;
  startTs?: number;
}
export interface ConsoleEntry {
  level: 'error' | 'warning' | 'info' | 'log' | 'exception';
  text: string;
  at: number;
}

const MAX_ENTRIES = 300;
const MAX_TEXT = 240;
const PAGE_TYPES = new Set(['Document', 'XHR', 'Fetch', 'WebSocket', 'EventSource']);

/** A URL without what a query or fragment may carry. */
export function stripUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.protocol === 'data:' || u.protocol === 'blob:') return `${u.protocol}…`;
    return `${u.origin}${u.pathname}${u.search ? '?…' : ''}`;
  } catch {
    return raw.split(/[?#]/)[0]!.slice(0, 200);
  }
}

/** Long opaque strings in a message (tokens, keys) are not shown. */
export function scrubText(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim().replace(/\b[A-Za-z0-9_\-+/=.]{32,}\b/g, '…');
  return flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT)}…` : flat;
}

export class DiagnosticsLog {
  readonly net: NetEntry[] = [];
  /** Every kind of request (scripts, images, styles, fonts too) with its size and time: the page's weight. */
  readonly assets: NetEntry[] = [];
  readonly #all = new Map<string, NetEntry>();
  readonly console: ConsoleEntry[] = [];
  readonly #open = new Map<string, NetEntry>();
  readonly startedAt = Date.now();

  #push<T>(list: T[], entry: T): void {
    list.push(entry);
    if (list.length > MAX_ENTRIES) list.shift();
  }

  request(id: string, method: string, url: string, type: string | undefined, startTs?: number): void {
    const t = type ?? 'Other';
    const weight: NetEntry = { method, url: stripUrl(url), type: t, at: Date.now(), startTs };
    this.#all.set(id, weight);
    this.#push(this.assets, weight);
    if (this.#all.size > 2000) this.#all.delete(this.#all.keys().next().value as string);
    if (!PAGE_TYPES.has(t)) return;
    const entry: NetEntry = { method, url: stripUrl(url), type: t, at: Date.now() };
    this.#open.set(id, entry);
    this.#push(this.net, entry);
  }

  response(id: string, status: number): void {
    const e = this.#open.get(id);
    if (e) e.status = status;
    const a = this.#all.get(id);
    if (a) a.status = status;
  }

  failed(id: string, errorText: string): void {
    const e = this.#open.get(id);
    if (e) e.failed = errorText.replace(/^net::/, '');
    this.#open.delete(id);
  }

  finished(id: string, endTs?: number, bytes?: number): void {
    this.#open.delete(id);
    const a = this.#all.get(id);
    if (a) {
      if (typeof bytes === 'number') a.bytes = bytes;
      if (typeof endTs === 'number' && typeof a.startTs === 'number') a.ms = Math.max(0, Math.round((endTs - a.startTs) * 1000));
      this.#all.delete(id);
    }
  }

  log(level: ConsoleEntry['level'], text: string): void {
    this.#push(this.console, { level, text: scrubText(text), at: Date.now() });
  }
}

export interface DiagnosticsQuery {
  kind?: 'both' | 'console' | 'network' | 'endpoints' | 'cookies' | 'storage' | 'issues' | 'weight' | 'request' | 'fetch';
  onlyProblems?: boolean;
  urlPattern?: string;
  limit?: number;
}

const problem = (e: NetEntry) => !!e.failed || (e.status !== undefined && e.status >= 400);

/** Path segments that are ids (numbers, uuids, long hex) shown as :id, so /users/17 and /users/18 are one endpoint. */
function shape(url: string): string {
  return url.replace(/\/(?:\d{2,}|[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{16,})(?=\/|$|\?)/gi, '/:id');
}

/** The page's own API calls (XHR, fetch, sockets) grouped by method and endpoint with counts and statuses: the map of what an automation could call directly. No bodies, headers or query values are kept. */
export function endpointMap(log: DiagnosticsLog): string[] {
  const api = log.net.filter(e => e.type === 'XHR' || e.type === 'Fetch' || e.type === 'WebSocket' || e.type === 'EventSource');
  if (!api.length) return ['endpoints · no API calls seen yet: do the action in the page, then call diagnostics with kind endpoints again'];
  const groups = new Map<string, { n: number; statuses: Set<string> }>();
  for (const e of api) {
    const key = `${e.method} ${shape(e.url.replace(/\?….*$/, ''))}`;
    const g = groups.get(key) ?? { n: 0, statuses: new Set<string>() };
    g.n++;
    g.statuses.add(e.failed ? 'failed' : e.status !== undefined ? String(e.status) : 'pending');
    groups.set(key, g);
  }
  return [`endpoints · ${groups.size} from ${api.length} API calls`, ...[...groups].sort((a, b) => b[1].n - a[1].n).slice(0, 60).map(([k, g]) => `  ${k} × ${g.n} → ${[...g.statuses].join(', ')}`)];
}

/** The lines to show: newest last, bounded. */
export function formatDiagnostics(log: DiagnosticsLog, q: DiagnosticsQuery, now = Date.now()): string[] {
  const limit = Math.max(1, Math.min(q.limit ?? 30, 100));
  const lines: string[] = [];
  if (q.kind === 'endpoints') return endpointMap(log);
  if (q.kind === 'weight') return weightReport(log);
  const ago = (t: number) => `${Math.max(0, Math.round((now - t) / 1000))}s ago`;
  if (q.kind !== 'network') {
    const all = log.console.filter(c => !q.onlyProblems || c.level === 'error' || c.level === 'warning' || c.level === 'exception');
    const shown = all.slice(-limit);
    lines.push(`console · ${shown.length} of ${all.length} message${all.length === 1 ? '' : 's'}`);
    for (const c of shown) lines.push(`  ${c.level} ${ago(c.at)}: ${c.text}`);
  }
  if (q.kind !== 'console') {
    let re: RegExp | undefined;
    if (q.urlPattern) {
      try {
        re = new RegExp(q.urlPattern, 'i');
      } catch {
        lines.push(`network · "${q.urlPattern}" is not a valid pattern; showing every request`);
      }
    }
    const all = log.net.filter(e => (!re || re.test(e.url)) && (!q.onlyProblems || problem(e)));
    const shown = all.slice(-limit);
    lines.push(`network · ${shown.length} of ${all.length} request${all.length === 1 ? '' : 's'}`);
    for (const e of shown) {
      const result = e.failed ? `FAILED ${e.failed}` : e.status !== undefined ? String(e.status) : 'no response yet';
      lines.push(`  ${problem(e) ? '!' : ' '} ${e.method} ${e.url} → ${result} (${e.type}, ${ago(e.at)})`);
    }
  }
  return lines;
}

export interface CookieInfo { name: string; domain: string; path: string; secure: boolean; httpOnly: boolean; sameSite?: string; expires?: number; size?: number; session?: boolean }

/** The page's cookies as names and flags, never values (a value can be a login), with what looks wrong about each: no Secure on a secure page, SameSite=None without Secure, a session-like name readable by scripts. */
export function formatCookies(cookies: CookieInfo[], pageUrl: string, now = Date.now()): string[] {
  if (!cookies.length) return ['cookies · none are set for this page (or the browser holds them back)'];
  const https = /^https:/i.test(pageUrl);
  const lines = [`cookies · ${cookies.length} for this page (values are never shown)`];
  for (const c of cookies.slice(0, 80)) {
    const flags = [c.secure ? 'Secure' : 'not Secure', c.httpOnly ? 'HttpOnly' : 'readable by scripts', `SameSite=${c.sameSite ?? 'unset'}`];
    const expiry = c.session || !c.expires || c.expires < 0 ? 'session' : `expires in ${Math.round((c.expires * 1000 - now) / 86_400_000)} days`;
    const warn: string[] = [];
    if (https && !c.secure) warn.push('sent over http too: add Secure');
    if (c.sameSite === 'None' && !c.secure) warn.push('SameSite=None needs Secure; browsers drop it');
    if (!c.httpOnly && /sess|auth|token|jwt|sid|login/i.test(c.name)) warn.push('looks like a login cookie but scripts can read it: add HttpOnly');
    lines.push(`  ${c.name} · ${c.domain}${c.path} · ${flags.join(', ')} · ${expiry}${c.size ? ` · ${c.size} bytes` : ''}${warn.length ? ` · ! ${warn.join('; ')}` : ''}`);
  }
  if (cookies.length > 80) lines.push(`  ... ${cookies.length - 80} more`);
  return lines;
}

export interface StorageSummary { local: Array<[string, number]>; session: Array<[string, number]> }

/** localStorage and sessionStorage as key names and value sizes, never values. */
export function formatStorage(s: StorageSummary): string[] {
  const part = (label: string, items: Array<[string, number]>) => [
    `${label} · ${items.length} key${items.length === 1 ? '' : 's'}, ${items.reduce((n, [, size]) => n + size, 0)} characters`,
    ...items.slice(0, 60).map(([k, size]) => `  ${k.slice(0, 80)} · ${size} characters`),
    ...(items.length > 60 ? [`  ... ${items.length - 60} more`] : []),
  ];
  return [...part('localStorage', s.local), ...part('sessionStorage', s.session)];
}

export interface InspectorIssue { code: string; details?: Record<string, unknown> }

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const hostOf = (u: unknown) => { try { return new URL(str(u)).host; } catch { return str(u).slice(0, 80); } };

/** One line for an issue the browser itself reported (Chrome's Issues panel): what it is and what to do, never a URL's query. */
export function describeIssue(issue: InspectorIssue): { key: string; line: string } {
  const d = (issue.details ?? {}) as Record<string, any>;
  const code = issue.code;
  if (code === 'CookieIssue') {
    const c = d.cookieIssueDetails ?? {};
    const reasons = [...(c.cookieWarningReasons ?? []), ...(c.cookieExclusionReasons ?? [])].map(String);
    const name = str(c.cookie?.name);
    const fix = reasons.some(r => /SameSiteNoneInsecure/.test(r)) ? 'SameSite=None needs Secure'
      : reasons.some(r => /SameSiteUnspecified|SameSiteLax/.test(r)) ? 'set SameSite explicitly (Lax, Strict or None with Secure)'
      : reasons.some(r => /ThirdParty|Phaseout/.test(r)) ? 'a third-party cookie that browsers are phasing out'
      : 'see the reason';
    return { key: `cookie ${reasons.join(',')}`, line: `cookie${name ? ` "${name}"` : ''}: ${reasons.join(', ') || 'problem'} (${fix})` };
  }
  if (code === 'MixedContentIssue') {
    const m = d.mixedContentIssueDetails ?? {};
    return { key: `mixed ${m.resolutionStatus}`, line: `mixed content: a ${str(m.resourceType) || 'resource'} from ${hostOf(m.insecureURL)} on a secure page was ${str(m.resolutionStatus).replace('MixedContent', '').toLowerCase() || 'flagged'} (load it over https)` };
  }
  if (code === 'LowTextContrastIssue') {
    const c = d.lowTextContrastIssueDetails ?? {};
    return { key: 'contrast', line: `low text contrast ${Number(c.contrastRatio).toFixed(2)}:1 on ${str(c.violatingNodeSelector) || 'an element'} (needs ${c.thresholdAA ?? 4.5}:1 for AA)` };
  }
  if (code === 'ContentSecurityPolicyIssue') {
    const c = d.contentSecurityPolicyIssueDetails ?? {};
    return { key: `csp ${c.violatedDirective}`, line: `Content-Security-Policy blocked ${hostOf(c.blockedURL) || 'something'} (${str(c.violatedDirective) || str(c.contentSecurityPolicyViolationType)}): allow it in the policy or remove it` };
  }
  if (code === 'CorsIssue') {
    const c = d.corsIssueDetails ?? {};
    return { key: `cors ${c.corsErrorStatus?.corsError}`, line: `CORS: ${str(c.corsErrorStatus?.corsError)} for ${hostOf(c.request?.url)} (the server must send the right Access-Control headers)` };
  }
  if (code === 'BlockedByResponseIssue') {
    const c = d.blockedByResponseIssueDetails ?? {};
    return { key: `blocked ${c.reason}`, line: `blocked by a response header (${str(c.reason)}) for ${hostOf(c.request?.url)}` };
  }
  if (code === 'GenericIssue') {
    const c = d.genericIssueDetails ?? {};
    return { key: `generic ${c.errorType}`, line: `${str(c.errorType).replace(/([A-Z])/g, ' $1').trim().toLowerCase()}${c.violatingNodeId ? '' : ''}` };
  }
  if (code === 'QuirksModeIssue') {
    const c = d.quirksModeIssueDetails ?? {};
    return { key: 'quirks', line: `the page renders in ${c.isLimitedQuirksMode ? 'limited quirks' : 'quirks'} mode: add <!doctype html>` };
  }
  if (code === 'DeprecationIssue') {
    return { key: `dep ${d.deprecationIssueDetails?.type}`, line: `deprecated feature in use: ${str(d.deprecationIssueDetails?.type)}` };
  }
  if (code === 'HeavyAdIssue') return { key: 'heavyad', line: 'an ad was removed for using too much CPU or network' };
  if (code === 'SharedArrayBufferIssue') return { key: 'sab', line: 'SharedArrayBuffer is used without cross-origin isolation' };
  return { key: code, line: code.replace(/Issue$/, '').replace(/([A-Z])/g, ' $1').trim().toLowerCase() };
}

/** The browser's own issues for the page, the same ones as its Issues panel, grouped with counts. */
export function formatIssues(issues: InspectorIssue[]): string[] {
  if (!issues.length) return ['issues · the browser reports no issues for this page (reload the page if it was open before recording started)'];
  const groups = new Map<string, { line: string; n: number }>();
  for (const i of issues) {
    const { key, line } = describeIssue(i);
    const g = groups.get(key) ?? { line, n: 0 };
    g.n++;
    groups.set(key, g);
  }
  return [`issues · ${groups.size} kinds, ${issues.length} in all, as the browser's Issues panel reports them`, ...[...groups.values()].sort((a, b) => b.n - a.n).slice(0, 40).map(g => `  ${g.n > 1 ? `${g.n}× ` : ''}${g.line}`)];
}

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** What the page loaded, by type, and the biggest and the slowest requests: the first suspects for a slow page. Sizes are what went over the network. */
export function weightReport(log: DiagnosticsLog): string[] {
  const done = log.assets.filter(e => typeof e.bytes === 'number');
  if (!done.length) return ['weight · no finished requests were recorded yet: reload the page after the first diagnostics call, then ask again'];
  const byType = new Map<string, { n: number; bytes: number }>();
  for (const e of done) {
    const g = byType.get(e.type) ?? { n: 0, bytes: 0 };
    g.n++;
    g.bytes += e.bytes ?? 0;
    byType.set(e.type, g);
  }
  const total = done.reduce((n, e) => n + (e.bytes ?? 0), 0);
  const row = (e: NetEntry) => `  ${e.type} ${e.url.length > 90 ? e.url.slice(0, 90) + '…' : e.url} · ${kb(e.bytes ?? 0)}${typeof e.ms === 'number' ? ` · ${e.ms} ms` : ''}${e.status && e.status >= 400 ? ` · ${e.status}` : ''}`;
  return [
    `weight · ${done.length} requests, ${kb(total)} over the network`,
    `by type: ${[...byType].sort((a, b) => b[1].bytes - a[1].bytes).map(([t, g]) => `${t} ${g.n} (${kb(g.bytes)})`).join(' · ')}`,
    'biggest:',
    ...[...done].sort((a, b) => (b.bytes ?? 0) - (a.bytes ?? 0)).slice(0, 8).map(row),
    'slowest:',
    ...[...done].filter(e => typeof e.ms === 'number').sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0)).slice(0, 8).map(row),
  ];
}

const SECRET_KEY = /token|secret|passw|authoriz|cookie|session|api[-_]?key|apikey|auth|jwt|csrf|xsrf|otp|signature|bearer|credential|ssn|card|cvv|iban/i;

/** One response body for the model: JSON with secret-looking keys and opaque long strings hidden, anything else as flat text; cut at `limit`. Never the raw body (it can hold a login). */
export function redactBody(body: string, mime = '', limit = 6000): string {
  let out: string;
  const looksJson = /json/i.test(mime) || /^\s*[[{]/.test(body);
  if (looksJson) {
    try {
      const walk = (v: unknown, key = ''): unknown => {
        if (v && typeof v === 'object') {
          if (Array.isArray(v)) return v.slice(0, 50).map(x => walk(x, key));
          return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 80).map(([k, x]) => [k, walk(x, k)]));
        }
        if (typeof v === 'string') {
          if (SECRET_KEY.test(key)) return '[hidden]';
          return v.replace(/\b[A-Za-z0-9_\-+/=.]{32,}\b/g, '…');
        }
        return SECRET_KEY.test(key) && v !== null && v !== undefined ? '[hidden]' : v;
      };
      out = JSON.stringify(walk(JSON.parse(body)), null, 1);
    } catch {
      out = body.replace(/\b[A-Za-z0-9_\-+/=.]{32,}\b/g, '…');
    }
  } else out = body.replace(/\s+/g, ' ').replace(/\b[A-Za-z0-9_\-+/=.]{32,}\b/g, '…');
  return out.length > limit ? `${out.slice(0, limit)}\n… [${out.length} characters]` : out;
}

const SHOWN_HEADERS = /^(?:content-type|content-length|content-encoding|cache-control|etag|last-modified|server|location|retry-after|x-ratelimit-[a-z-]+|access-control-allow-origin|www-authenticate)$/i;

/** The response headers worth showing: what describes the answer, never cookies or credentials. */
export function shownHeaders(headers: Record<string, string> | undefined): string[] {
  return Object.entries(headers ?? {})
    .filter(([k]) => SHOWN_HEADERS.test(k))
    .slice(0, 16)
    .map(([k, v]) => `  ${k.toLowerCase()}: ${v.replace(/\b[A-Za-z0-9_\-+/=.]{32,}\b/g, '…').slice(0, 160)}`);
}
