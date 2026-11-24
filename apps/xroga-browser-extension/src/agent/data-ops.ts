// `data_ops`: exact list work on rows the agent collected from pages (prospects, products, contacts, search results): remove duplicates, filter, sort, pick columns,
// fill a template per row, group and count. The model decides what to do; this does it without miscounting or silently dropping a row, and says what it dropped.
// Pure and deterministic; it never evaluates code.

export type Row = Record<string, string | number | boolean | null>;

export interface DataStep {
  op: 'dedupe' | 'filter' | 'sort' | 'pick' | 'template' | 'group' | 'limit' | 'validate';
  /** dedupe / sort / group: the field or fields to look at. */
  by?: string | string[];
  /** dedupe: also ignore case, punctuation, a leading www. or protocol, a trailing slash and +tags in an email. */
  loose?: boolean;
  /** filter: the field, test and value. */
  field?: string;
  test?: 'eq' | 'ne' | 'contains' | 'notcontains' | 'gt' | 'gte' | 'lt' | 'lte' | 'empty' | 'notempty' | 'matches';
  value?: string | number;
  /** sort */
  order?: 'asc' | 'desc';
  /** pick: the columns to keep, in this order. */
  fields?: string[];
  /** template: a new column named `as` made from `text` with {field} filled per row, e.g. "Hello {first},". */
  as?: string;
  text?: string;
  /** limit */
  n?: number;
  /** validate: what the field must look like, and whether the rows that fail are removed (default: only reported). */
  kind?: 'email' | 'url' | 'phone' | 'number' | 'notempty';
  drop?: boolean;
}

export const MAX_ROWS = 100_000;
const MAX_STEPS = 200;
const OPS = new Set(['dedupe', 'filter', 'sort', 'pick', 'template', 'group', 'limit', 'validate']);

const SHAPES: Record<NonNullable<DataStep['kind']>, (v: string) => boolean> = {
  email: v => /^[^\s@<>()]+@[^\s@<>()]+\.[A-Za-z]{2,}$/.test(v),
  url: v => {
    try {
      const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
      return /^https?:$/.test(u.protocol) && /\.[A-Za-z]{2,}$/.test(u.hostname);
    } catch {
      return false;
    }
  },
  phone: v => { const d = v.replace(/[^\d]/g, ''); return /^[+()\d][\d\s().+-]*$/.test(v) && d.length >= 7 && d.length <= 15; },
  number: v => v !== '' && Number.isFinite(Number(v.replace(/[,\s]/g, '').replace(/^[$£€]/, ''))),
  notempty: v => v !== '',
};

const keysOf = (by: unknown): string[] => (Array.isArray(by) ? by : typeof by === 'string' ? [by] : []).map(String).filter(Boolean);
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));

/** The comparison form of a value: trimmed, lower case, spaces collapsed; loose also drops protocol, www., punctuation, a trailing slash and an email's +tag. */
export function normalise(v: unknown, loose: boolean): string {
  let s = text(v).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!loose) return s;
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '').replace(/\+[^@\s]*(?=@)/, '');
  return s.replace(/[^\p{L}\p{N}@. ]/gu, '').replace(/\s+/g, ' ').trim();
}

const num = (v: unknown): number => Number(text(v).replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/[^\d.eE+-]/g, ''));

function passes(row: Row, s: DataStep): boolean {
  const have = row[s.field!];
  const a = text(have);
  const b = text(s.value);
  switch (s.test) {
    case 'eq': return a.trim().toLowerCase() === b.trim().toLowerCase();
    case 'ne': return a.trim().toLowerCase() !== b.trim().toLowerCase();
    case 'contains': return a.toLowerCase().includes(b.toLowerCase());
    case 'notcontains': return !a.toLowerCase().includes(b.toLowerCase());
    case 'gt': return num(have) > num(s.value);
    case 'gte': return num(have) >= num(s.value);
    case 'lt': return num(have) < num(s.value);
    case 'lte': return num(have) <= num(s.value);
    case 'empty': return a.trim() === '';
    case 'notempty': return a.trim() !== '';
    case 'matches': {
      try { return new RegExp(b, 'i').test(a); } catch { throw new Error(`filter on "${s.field}": "${b}" is not a valid pattern`); }
    }
    default: throw new Error(`filter needs test: one of eq, ne, contains, notcontains, gt, gte, lt, lte, empty, notempty, matches`);
  }
}

export interface DataResult { rows: Row[]; notes: string[]; groups?: Array<Record<string, string | number>> }

export function runDataOps(input: Row[], steps: DataStep[]): DataResult {
  if (!Array.isArray(input) || !input.length) throw new Error('rows is a non-empty list of objects');
  if (input.length > MAX_ROWS) throw new Error(`rows holds at most ${MAX_ROWS} items; split the list`);
  if (!Array.isArray(steps) || !steps.length) throw new Error('steps is a non-empty list such as [{"op":"dedupe","by":"email"}]');
  if (steps.length > MAX_STEPS) throw new Error(`at most ${MAX_STEPS} steps`);
  let rows = input.map(r => ({ ...r }));
  let groups: DataResult['groups'];
  const notes: string[] = [`start: ${rows.length} rows`];
  for (const [i, s] of steps.entries()) {
    const at = `step ${i + 1} (${s?.op})`;
    if (!s || !OPS.has(s.op)) throw new Error(`${at}: op is one of ${[...OPS].join(', ')}`);
    const before = rows.length;
    if (s.op === 'dedupe') {
      const by = keysOf(s.by);
      if (!by.length) throw new Error(`${at}: by names the field or fields that identify a duplicate`);
      const seen = new Map<string, number>();
      const dropped: string[] = [];
      rows = rows.filter((r, k) => {
        if (by.every(f => text(r[f]).trim() === '')) return true; // a row with no key cannot be called a duplicate
        const key = by.map(f => normalise(r[f], !!s.loose)).join('\u0001');
        if (seen.has(key)) { dropped.push(`row ${k + 1} (${by.map(f => text(r[f])).join(' / ').slice(0, 50)}) repeats row ${seen.get(key)! + 1}`); return false; }
        seen.set(key, k);
        return true;
      });
      notes.push(`${at}: kept ${rows.length}, dropped ${before - rows.length} duplicate(s) by ${by.join('+')}${s.loose ? ' (loose)' : ''}${dropped.length ? `: ${dropped.slice(0, 15).join('; ')}${dropped.length > 15 ? '; ...' : ''}` : ''}`);
    } else if (s.op === 'filter') {
      if (!s.field) throw new Error(`${at}: field is required`);
      rows = rows.filter(r => passes(r, s));
      notes.push(`${at}: ${s.field} ${s.test}${s.value !== undefined ? ` ${JSON.stringify(s.value)}` : ''} keeps ${rows.length} of ${before}`);
    } else if (s.op === 'sort') {
      const by = keysOf(s.by);
      if (!by.length) throw new Error(`${at}: by names the field or fields to sort on`);
      const dir = s.order === 'desc' ? -1 : 1;
      rows = rows.map((r, k) => ({ r, k })).sort((x, y) => {
        for (const f of by) {
          const a = x.r[f], b = y.r[f];
          const na = num(a), nb = num(b);
          const c = Number.isFinite(na) && Number.isFinite(nb) && text(a).trim() !== '' && text(b).trim() !== '' ? na - nb : text(a).localeCompare(text(b), undefined, { sensitivity: 'base', numeric: true });
          if (c) return c * dir;
        }
        return x.k - y.k;
      }).map(x => x.r);
      notes.push(`${at}: sorted ${rows.length} rows by ${by.join(', ')} ${dir === 1 ? 'ascending' : 'descending'}`);
    } else if (s.op === 'pick') {
      const f = (s.fields ?? []).map(String);
      if (!f.length) throw new Error(`${at}: fields lists the columns to keep`);
      rows = rows.map(r => Object.fromEntries(f.map(k => [k, r[k] ?? ''])) as Row);
      notes.push(`${at}: columns ${f.join(', ')}`);
    } else if (s.op === 'template') {
      if (!s.as || typeof s.text !== 'string') throw new Error(`${at}: as (the new column) and text (with {field} placeholders) are required`);
      const missing = new Set<string>();
      rows = rows.map(r => ({ ...r, [s.as!]: s.text!.replace(/\{([^{}]+)\}/g, (_m, k: string) => { if (!(k in r)) missing.add(k); return text(r[k]); }) }));
      if (missing.size) throw new Error(`${at}: the rows have no field ${[...missing].map(m => `"${m}"`).join(', ')}`);
      notes.push(`${at}: column ${s.as} filled for ${rows.length} rows`);
    } else if (s.op === 'group') {
      const by = keysOf(s.by);
      if (!by.length) throw new Error(`${at}: by names the field or fields to group on`);
      const counts = new Map<string, { key: Row; n: number }>();
      for (const r of rows) {
        const k = by.map(f => text(r[f])).join('\u0001');
        const hit = counts.get(k);
        if (hit) hit.n++; else counts.set(k, { key: Object.fromEntries(by.map(f => [f, r[f] ?? ''])) as Row, n: 1 });
      }
      groups = [...counts.values()].sort((a, b) => b.n - a.n).map(g => ({ ...(g.key as Record<string, string | number>), count: g.n }));
      notes.push(`${at}: ${groups.length} group(s) by ${by.join('+')}`);
    } else if (s.op === 'validate') {
      const fields = [...keysOf(s.fields), ...(s.field ? [s.field] : [])];
      if (!fields.length || !s.kind || !SHAPES[s.kind]) throw new Error(`${at}: field (or fields) and kind (email, url, phone, number or notempty) are required`);
      const bad: string[] = [];
      const ok = rows.filter((r, k) => {
        const failing = fields.filter(f => !SHAPES[s.kind!](text(r[f]).trim()));
        if (failing.length) bad.push(`row ${k + 1} ${failing.map(f => `${f}=${JSON.stringify(text(r[f]).slice(0, 40))}`).join(', ')}`);
        return !failing.length;
      });
      if (s.drop) rows = ok;
      notes.push(`${at}: ${before - ok.length} of ${before} rows have a ${fields.join('/')} that is not a valid ${s.kind}${s.drop ? ' and were dropped' : ' (kept; add drop true to remove them)'}${bad.length ? `: ${bad.slice(0, 15).join('; ')}${bad.length > 15 ? `; and ${bad.length - 15} more` : ''}` : ''}`);
    } else if (s.op === 'limit') {
      const n = Math.floor(Number(s.n));
      if (!(n >= 0)) throw new Error(`${at}: n is a number of rows to keep`);
      rows = rows.slice(0, n);
      notes.push(`${at}: first ${rows.length} of ${before}`);
    }
  }
  return { rows, notes, ...(groups ? { groups } : {}) };
}

export const DATA_OPS_TOOL = {
  name: 'data_ops',
  source: 'agent' as const,
  group: 'working' as const,
  description:
    'Exact list work on rows you collected: dedupe, filter, sort, pick, template, group, limit, validate (field, kind email|url|phone|number|notempty, optional drop); it reports every row it drops. steps run in order, e.g. [{"op":"dedupe","by":"email","loose":true},{"op":"filter","field":"country","test":"eq","value":"UK"},{"op":"sort","by":"score","order":"desc"}]; template needs as and text with {field}.',
  parameters: {
    type: 'object',
    properties: {
      rows: { type: 'array', maxItems: MAX_ROWS, items: { type: 'object' }, description: 'Leave out to work on the rows of the last extract_rows (or the result of your last data_ops)' },
      table: { type: 'integer', minimum: 1, description: 'With rows left out: which table of the last extract_rows (default 1)' },
      steps: { type: 'array', maxItems: MAX_STEPS, items: { type: 'object', properties: { op: { type: 'string', enum: [...OPS] } }, required: ['op'] } },
    },
    required: ['steps'],
    additionalProperties: false,
  },
};

export function runDataOpsTool(args: { rows?: Row[]; table?: number; steps?: DataStep[] }, working?: { tables: Row[][]; current?: Row[] }): { text: string; isError: boolean; rows?: Row[] } {
  try {
    const base = Array.isArray(args.rows) ? args.rows : args.table ? working?.tables[args.table - 1] : (working?.current ?? working?.tables[0]);
    if (!base) throw new Error('there are no rows yet: pass rows, or call extract_rows on the page first');
    const out = runDataOps(base, args.steps as DataStep[]);
    const shown = out.groups ?? out.rows;
    const body = shown.slice(0, 150).map(r => JSON.stringify(r)).join('\n');
    return {
      text: `${out.notes.join('\n')}\nresult: ${out.groups ? `${out.groups.length} groups` : `${out.rows.length} rows`}\n${body}${shown.length > 150 ? `\n... ${shown.length - 150} more not shown` : ''}`,
      isError: false,
      rows: out.rows,
    };
  } catch (error) {
    return { text: `error: ${error instanceof Error ? error.message : String(error)}`, isError: true };
  }
}
