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
  readonly console: ConsoleEntry[] = [];
  readonly #open = new Map<string, NetEntry>();
  readonly startedAt = Date.now();

  #push<T>(list: T[], entry: T): void {
    list.push(entry);
    if (list.length > MAX_ENTRIES) list.shift();
  }

  request(id: string, method: string, url: string, type: string | undefined): void {
    const t = type ?? 'Other';
    if (!PAGE_TYPES.has(t)) return;
    const entry: NetEntry = { method, url: stripUrl(url), type: t, at: Date.now() };
    this.#open.set(id, entry);
    this.#push(this.net, entry);
  }

  response(id: string, status: number): void {
    const e = this.#open.get(id);
    if (e) e.status = status;
  }

  failed(id: string, errorText: string): void {
    const e = this.#open.get(id);
    if (e) e.failed = errorText.replace(/^net::/, '');
    this.#open.delete(id);
  }

  finished(id: string): void {
    this.#open.delete(id);
  }

  log(level: ConsoleEntry['level'], text: string): void {
    this.#push(this.console, { level, text: scrubText(text), at: Date.now() });
  }
}

export interface DiagnosticsQuery {
  kind?: 'both' | 'console' | 'network' | 'endpoints' | 'cookies' | 'storage';
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
