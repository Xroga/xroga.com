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
  kind?: 'both' | 'console' | 'network';
  onlyProblems?: boolean;
  urlPattern?: string;
  limit?: number;
}

const problem = (e: NetEntry) => !!e.failed || (e.status !== undefined && e.status >= 400);

/** The lines to show: newest last, bounded. */
export function formatDiagnostics(log: DiagnosticsLog, q: DiagnosticsQuery, now = Date.now()): string[] {
  const limit = Math.max(1, Math.min(q.limit ?? 30, 100));
  const lines: string[] = [];
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
