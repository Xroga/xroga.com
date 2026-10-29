/**
 * A minimal in-memory evaluator for the PostgREST filters Xroga's maintenance code uses (eq, in, is, lt, gte, or with and(...) groups), so a
 * test can prove which rows a filter chain would select instead of only recording the call. It is a test aid, not a database: it supports
 * exactly these operators and throws on anything else, so an unsupported filter fails loudly rather than silently matching.
 */
export type Row = Record<string, unknown>;

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'string') return a - Number(b);
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}

function splitTop(input: string): string[] {
  const out: string[] = []; let depth = 0; let current = '';
  for (const ch of input) {
    if (ch === '(') depth++; if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(current); current = ''; } else current += ch;
  }
  if (current) out.push(current);
  return out;
}

export function matchesTerm(row: Row, term: string): boolean {
  if (term.startsWith('and(') && term.endsWith(')')) return splitTop(term.slice(4, -1)).every((t) => matchesTerm(row, t));
  const [column, ...rest] = term.split('.');
  const value = row[column!];
  const op = rest[0];
  const operand = rest.slice(1).join('.');
  if (op === 'not') {
    if (rest[1] !== 'is') throw new Error(`unsupported negated filter ${term}`);
    return !matchesTerm(row, `${column}.is.${rest.slice(2).join('.')}`);
  }
  if (op === 'is') { if (operand !== 'null') throw new Error(`unsupported is ${term}`); return value === null || value === undefined; }
  if (value === null || value === undefined) return false;
  if (op === 'eq') return String(value) === operand;
  if (op === 'lt') return compare(value, operand) < 0;
  if (op === 'gte') return compare(value, operand) >= 0;
  throw new Error(`unsupported filter ${term}`);
}

/** A thenable query over `rows` that records filters and applies them on await; `update` mutates the matched rows. */
export function fakeTable(rows: Row[]) {
  let patch: Row | null = null; let selected = false; let limit = Infinity;
  const filters: Array<(row: Row) => boolean> = [];
  let ordered: string | null = null;
  const run = () => {
    let found = rows.filter((row) => filters.every((f) => f(row)));
    if (ordered) found = found.sort((a, b) => compare(a[ordered!], b[ordered!]));
    found = found.slice(0, limit);
    if (patch) for (const row of found) Object.assign(row, patch);
    return { data: selected || !patch ? found.map((r) => ({ ...r })) : null, error: null };
  };
  const query: Record<string, unknown> = {
    select: () => { selected = true; return query; },
    update: (values: Row) => { patch = values; return query; },
    eq: (c: string, v: unknown) => { filters.push((r) => String(r[c]) === String(v)); return query; },
    in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return query; },
    is: (c: string, v: null) => { if (v !== null) throw new Error('unsupported is'); filters.push((r) => r[c] === null || r[c] === undefined); return query; },
    lt: (c: string, v: unknown) => { filters.push((r) => r[c] !== null && r[c] !== undefined && compare(r[c], v) < 0); return query; },
    gte: (c: string, v: unknown) => { filters.push((r) => r[c] !== null && r[c] !== undefined && compare(r[c], v) >= 0); return query; },
    or: (expr: string) => { const terms = splitTop(expr); filters.push((r) => terms.some((t) => matchesTerm(r, t))); return query; },
    order: (c: string) => { ordered = c; return query; },
    limit: (n: number) => { limit = n; return query; },
    then: (resolve: (value: unknown) => unknown) => resolve(run()),
  };
  return query;
}
