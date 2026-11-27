// `table`: named tables that live outside the conversation. A task that collects a lot (leads from thirty result pages, products from a catalogue, rows from every tab) cannot carry the rows in
// the model's context and cannot lose them when the context is compacted or the browser restarts. A table keeps its rows on this device, takes rows from an extraction or from the call, adds
// them (or updates by a key so a row seen twice is one row), lists and counts them in pages, changes and removes rows, runs the list work of data_ops on them, and is the source of a
// spreadsheet or a CSV, so the rows never pass through the model's words. The idea (a data_store of named tables with insert, upsert on a business key, a revision on every row and
// compare-then-write updates) is from reading qz-browser-agent (Apache-2.0); written fresh. Pure: the saving to disk is a function the caller gives.
import { runDataOps, toCsv, type DataStep, type Row } from './data-ops';
import type { AgentTool } from './tools';

export const TABLE_ACTIONS = ['create', 'add', 'upsert', 'list', 'get', 'update', 'delete', 'query', 'count', 'tables', 'drop', 'csv'] as const;

export const TABLE_TOOL: AgentTool = {
  name: 'table',
  source: 'agent',
  group: 'working',
  description:
    'Named tables that keep what you collect on this device, outside the conversation, so a long collection survives compaction and restarts and the rows never pass through your words. add: name and rows (objects), or from "last" (the rows of the last extract_rows; table: which of them) or from "working" (what data_ops last produced); key (a field or fields that identify a row, set once) makes a row seen again update the first instead of adding a second. upsert is add with a key. list: name, offset, limit (default 20), fields, where {field, test, value}. get: name and key value(s) or row number. update: name, row (number) or key, set {field: value}. delete: name and row numbers or key values or where. query: name and steps (the steps of data_ops: dedupe, filter, sort, pick, group, validate, …) to read a result; apply: true keeps the result as the table. count: name (rows, columns, a sample). tables: all tables. csv: name (and fields) gives CSV text. drop: removes a table. create: name, columns, key. Every row has a number (row) and a revision. make_document takes a sheet from a table with fromTable: "name". Use it for any collection of more than a few dozen rows or over several pages.',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: [...TABLE_ACTIONS] },
      name: { type: 'string', maxLength: 60 },
      rows: { type: 'array', items: { type: 'object' } },
      from: { type: 'string', enum: ['last', 'working'] },
      table: { type: 'number' },
      key: { anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
      columns: { type: 'array', items: { type: 'string' } },
      offset: { type: 'number' },
      limit: { type: 'number' },
      fields: { type: 'array', items: { type: 'string' } },
      where: { type: 'object' },
      row: { type: 'number' },
      rowsNumbers: { type: 'array', items: { type: 'number' } },
      set: { type: 'object' },
      steps: { type: 'array', items: { type: 'object' } },
      apply: { type: 'boolean' },
      keys: { type: 'array', items: { anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'array', items: { type: 'string' } }] } },
    },
    required: ['action'],
    additionalProperties: false,
  },
};

export interface StoredRow {
  n: number;
  rev: number;
  data: Row;
}
export interface Table {
  name: string;
  columns: string[];
  key?: string[];
  next: number;
  rows: StoredRow[];
  createdAt: number;
  updatedAt: number;
}
export type TableMap = Record<string, Table>;

export const MAX_TABLES = 50;
export const MAX_TABLE_ROWS = 500_000;
const NAME = /^[\p{L}\p{N} _.-]{1,60}$/u;

const cell = (v: unknown): string | number | boolean | null => (v === null || v === undefined ? null : typeof v === 'number' || typeof v === 'boolean' ? v : typeof v === 'string' ? v : JSON.stringify(v));

/** A row of any shape as a flat row: nested values become their JSON text, so nothing is lost and nothing needs a schema. */
export function flatRow(raw: unknown): Row {
  const out: Row = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const [k, v] of Object.entries(raw as Record<string, unknown>)) out[k] = cell(v);
  return out;
}

const keyOf = (data: Row, key: string[]): string => key.map(k => String(data[k] ?? '').trim().toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')).join('\u0001');

export class TableStore {
  tables: TableMap;
  /** Set when something changed since the last save. */
  dirty = false;
  constructor(tables: TableMap = {}) {
    this.tables = tables;
  }

  need(name: unknown): Table {
    const n = typeof name === 'string' ? name.trim() : '';
    const t = this.tables[n.toLowerCase()];
    if (!t) throw new Error(`there is no table "${n}"${Object.keys(this.tables).length ? ` (tables: ${Object.values(this.tables).map(x => x.name).join(', ')})` : ': create one with add or create'}`);
    return t;
  }

  create(name: unknown, columns?: string[], key?: string[]): Table {
    const n = typeof name === 'string' ? name.trim() : '';
    if (!NAME.test(n)) throw new Error('name must be 1 to 60 letters, digits, spaces, dots, dashes or underscores');
    const existing = this.tables[n.toLowerCase()];
    if (existing) {
      if (key?.length && !existing.key) existing.key = key;
      return existing;
    }
    if (Object.keys(this.tables).length >= MAX_TABLES) throw new Error(`there are already ${MAX_TABLES} tables: drop one first`);
    const now = Date.now();
    const t: Table = { name: n, columns: columns ? [...columns] : [], ...(key?.length ? { key } : {}), next: 1, rows: [], createdAt: now, updatedAt: now };
    this.tables[n.toLowerCase()] = t;
    this.dirty = true;
    return t;
  }

  private noteColumns(t: Table, data: Row): void {
    for (const k of Object.keys(data)) if (!t.columns.includes(k)) t.columns.push(k);
  }

  /** Adds rows; with a key, a row whose key is already in the table updates that row (empty cells do not blank a filled one). Returns what happened. */
  add(name: unknown, rows: unknown[], options: { key?: string[]; columns?: string[] } = {}): { added: number; updated: number; skipped: number; total: number } {
    const t = this.create(name, options.columns, options.key);
    if (options.key?.length && !t.key) t.key = options.key;
    const key = t.key;
    const index = new Map<string, StoredRow>();
    if (key) for (const r of t.rows) index.set(keyOf(r.data, key), r);
    let added = 0;
    let updated = 0;
    let skipped = 0;
    for (const raw of rows) {
      const data = flatRow(raw);
      if (!Object.keys(data).length) {
        skipped++;
        continue;
      }
      if (key) {
        if (key.every(k => data[k] === null || data[k] === undefined || data[k] === '')) {
          skipped++;
          continue;
        }
        const hit = index.get(keyOf(data, key));
        if (hit) {
          let changed = false;
          for (const [k, v] of Object.entries(data)) {
            if (v === null || v === '') continue;
            if (hit.data[k] !== v) {
              hit.data[k] = v;
              changed = true;
            }
          }
          if (changed) {
            hit.rev++;
            updated++;
          }
          this.noteColumns(t, data);
          continue;
        }
      }
      if (t.rows.length >= MAX_TABLE_ROWS) throw new Error(`the table is full (${MAX_TABLE_ROWS} rows)`);
      const stored: StoredRow = { n: t.next++, rev: 1, data };
      t.rows.push(stored);
      if (key) index.set(keyOf(data, key), stored);
      this.noteColumns(t, data);
      added++;
    }
    t.updatedAt = Date.now();
    this.dirty = true;
    return { added, updated, skipped, total: t.rows.length };
  }

  rowsOf(name: unknown): Row[] {
    return this.need(name).rows.map(r => ({ '#': r.n, ...r.data }) as Row);
  }

  find(t: Table, args: { row?: unknown; key?: unknown }): StoredRow | undefined {
    if (typeof args.row === 'number') return t.rows.find(r => r.n === args.row);
    if (args.key !== undefined && t.key) {
      const values = Array.isArray(args.key) ? args.key : [args.key];
      const wanted = keyOf(Object.fromEntries(t.key.map((k, i) => [k, values[i] as string])) as Row, t.key);
      return t.rows.find(r => keyOf(r.data, t.key!) === wanted);
    }
    return undefined;
  }

  update(name: unknown, args: { row?: unknown; key?: unknown }, set: Record<string, unknown>): StoredRow {
    const t = this.need(name);
    const hit = this.find(t, args);
    if (!hit) throw new Error('no such row: give row (its number) or key (the key value)');
    const data = flatRow(set);
    for (const [k, v] of Object.entries(data)) hit.data[k] = v;
    this.noteColumns(t, data);
    hit.rev++;
    t.updatedAt = Date.now();
    this.dirty = true;
    return hit;
  }

  remove(name: unknown, pick: { rows?: number[]; keys?: unknown[]; where?: WhereClause }): number {
    const t = this.need(name);
    const before = t.rows.length;
    const numbers = new Set(pick.rows ?? []);
    const keys = new Set((pick.keys ?? []).map(k => (t.key ? keyOf(Object.fromEntries(t.key.map((kk, i) => [kk, (Array.isArray(k) ? k : [k])[i] as string])) as Row, t.key) : '')));
    t.rows = t.rows.filter(r => !(numbers.has(r.n) || (t.key && keys.has(keyOf(r.data, t.key))) || (pick.where && matches(r.data, pick.where))));
    const removed = before - t.rows.length;
    if (removed) {
      t.updatedAt = Date.now();
      this.dirty = true;
    }
    return removed;
  }

  drop(name: unknown): boolean {
    const n = typeof name === 'string' ? name.trim().toLowerCase() : '';
    if (!this.tables[n]) return false;
    delete this.tables[n];
    this.dirty = true;
    return true;
  }

  replaceRows(name: unknown, rows: Row[]): void {
    const t = this.need(name);
    const kept = new Map(t.rows.map(r => [JSON.stringify(r.data), r]));
    t.rows = rows.map(r => {
      const { '#': _n, ...data } = r as Row & { '#'?: unknown };
      const hit = kept.get(JSON.stringify(data));
      return hit ?? { n: t.next++, rev: 1, data };
    });
    for (const r of t.rows) this.noteColumns(t, r.data);
    t.updatedAt = Date.now();
    this.dirty = true;
  }
}

export interface WhereClause {
  field: string;
  test?: DataStep['test'];
  value?: string | number;
}
/** One filter condition, with the tests of data_ops (it runs the same code so the two never disagree). */
export function matches(data: Row, where: WhereClause): boolean {
  return runDataOps([data], [{ op: 'filter', field: where.field, test: where.test ?? 'eq', value: where.value }]).rows.length === 1;
}

export interface Sources {
  /** The tables of the last extract_rows, as rows. */
  extracted: Row[][];
  /** What data_ops last produced. */
  working?: Row[];
}
export interface TableOutcome {
  text: string;
  isError: boolean;
  /** Set when the store changed: the caller saves it. */
  changed: boolean;
  /** Rows to hold as the working set for data_ops. */
  rows?: Row[];
}

const shown = (r: Row, fields?: string[]) => JSON.stringify(fields ? Object.fromEntries(fields.map(f => [f, r[f] ?? null])) : r);
const asKey = (k: unknown): string[] | undefined => (typeof k === 'string' && k.trim() ? [k.trim()] : Array.isArray(k) ? k.filter((x): x is string => typeof x === 'string' && !!x.trim()) : undefined);

/** Runs one call of the table tool on the store. */
export function runTableTool(store: TableStore, args: Record<string, unknown>, sources: Sources): TableOutcome {
  const before = store.dirty;
  store.dirty = false;
  try {
    const action = String(args.action ?? '');
    if (!(TABLE_ACTIONS as readonly string[]).includes(action)) throw new Error(`action must be one of ${TABLE_ACTIONS.join(', ')}`);
    if (action === 'tables') {
      const list = Object.values(store.tables);
      return { text: list.length ? list.map(t => `${t.name}: ${t.rows.length} rows, columns ${t.columns.join(', ') || '(none yet)'}${t.key ? `, key ${t.key.join('+')}` : ''}`).join('\n') : 'table · there are no tables yet', isError: false, changed: false };
    }
    if (action === 'create') {
      const t = store.create(args.name, Array.isArray(args.columns) ? (args.columns as unknown[]).map(String) : undefined, asKey(args.key));
      return { text: `table · "${t.name}" is ready: ${t.rows.length} rows${t.key ? `, key ${t.key.join('+')}` : ''}`, isError: false, changed: store.dirty };
    }
    if (action === 'add' || action === 'upsert') {
      let rows: unknown[] = Array.isArray(args.rows) ? (args.rows as unknown[]) : [];
      let from = 'the call';
      if (!rows.length && args.from === 'last') {
        const tbl = sources.extracted[typeof args.table === 'number' ? args.table - 1 : 0];
        if (!tbl) throw new Error('there is no extraction yet: call extract_rows on the page first');
        rows = tbl;
        from = `extraction ${typeof args.table === 'number' ? args.table : 1}`;
      } else if (!rows.length && args.from === 'working') {
        if (!sources.working) throw new Error('there is no working set: run data_ops first');
        rows = sources.working;
        from = 'the working set';
      }
      if (!rows.length) throw new Error('give rows, or from "last" or "working"');
      const key = asKey(args.key);
      if (action === 'upsert' && !key && !store.tables[String(args.name ?? '').trim().toLowerCase()]?.key) throw new Error('upsert needs a key: the field or fields that identify a row');
      const r = store.add(args.name, rows, { key, columns: Array.isArray(args.columns) ? (args.columns as unknown[]).map(String) : undefined });
      const t = store.tables[String(args.name).trim().toLowerCase()]!;
      return { text: `table · "${t.name}" from ${from}: ${r.added} added, ${r.updated} updated, ${r.skipped} skipped; now ${r.total} rows${t.key ? ` (key ${t.key.join('+')})` : ''}`, isError: false, changed: true };
    }
    if (action === 'count') {
      const t = store.need(args.name);
      const sample = t.rows.slice(0, 3).map(r => shown({ '#': r.n, ...r.data })).join('\n');
      const filled = t.columns.map(c => `${c} ${t.rows.filter(r => r.data[c] !== null && r.data[c] !== undefined && r.data[c] !== '').length}`).join(', ');
      return { text: `table · "${t.name}": ${t.rows.length} rows${t.key ? `, key ${t.key.join('+')}` : ''}\ncolumns (rows filled): ${filled || 'none'}\n${sample}`, isError: false, changed: false };
    }
    const rows = store.rowsOf(args.name);
    const t = store.tables[String(args.name).trim().toLowerCase()]!;
    if (action === 'list') {
      const where = args.where as WhereClause | undefined;
      const picked = where ? rows.filter(r => matches(r, where)) : rows;
      const offset = Math.max(0, Math.floor(Number(args.offset) || 0));
      const limit = Math.max(1, Math.min(200, Math.floor(Number(args.limit) || 20)));
      const fields = Array.isArray(args.fields) ? (args.fields as unknown[]).map(String) : undefined;
      const page = picked.slice(offset, offset + limit);
      return { text: `table · "${t.name}" ${where ? `where ${where.field} ${where.test ?? 'eq'} ${where.value ?? ''}: ${picked.length} of ${rows.length} rows` : `${rows.length} rows`}, showing ${offset + 1}-${offset + page.length}\n${page.map(r => shown(r, fields ? ['#', ...fields] : undefined)).join('\n')}${offset + page.length < picked.length ? `\n... ${picked.length - offset - page.length} more: list again with offset ${offset + page.length}` : ''}`, isError: false, changed: false };
    }
    if (action === 'get') {
      const hit = store.find(t, args);
      if (!hit) throw new Error('no such row: give row (its number) or key (the key value)');
      return { text: `table · "${t.name}" row ${hit.n} (revision ${hit.rev}): ${JSON.stringify(hit.data)}`, isError: false, changed: false };
    }
    if (action === 'update') {
      if (!args.set || typeof args.set !== 'object') throw new Error('give set: { field: value }');
      const hit = store.update(args.name, args, args.set as Record<string, unknown>);
      return { text: `table · "${t.name}" row ${hit.n} updated (revision ${hit.rev}): ${JSON.stringify(hit.data)}`, isError: false, changed: true };
    }
    if (action === 'delete') {
      const removed = store.remove(args.name, { rows: Array.isArray(args.rowsNumbers) ? (args.rowsNumbers as number[]) : typeof args.row === 'number' ? [args.row] : undefined, keys: Array.isArray(args.keys) ? args.keys : undefined, where: args.where as WhereClause | undefined });
      return { text: `table · "${t.name}": ${removed} row${removed === 1 ? '' : 's'} deleted; ${t.rows.length} left`, isError: false, changed: removed > 0 };
    }
    if (action === 'query') {
      const out = runDataOps(rows, (args.steps as DataStep[]) ?? []);
      let note = '';
      if (args.apply === true) {
        if (out.groups) throw new Error('a grouped result cannot replace the table: use query without apply, or add it as a new table');
        store.replaceRows(args.name, out.rows);
        note = `; kept as the table (${t.rows.length} rows)`;
      }
      const list = out.groups ?? out.rows;
      return { text: `${out.notes.join('\n')}\nresult: ${out.groups ? `${out.groups.length} groups` : `${out.rows.length} rows`}${note}\n${list.slice(0, 100).map(r => JSON.stringify(r)).join('\n')}${list.length > 100 ? `\n... ${list.length - 100} more not shown` : ''}`, isError: false, changed: args.apply === true, rows: out.rows };
    }
    if (action === 'csv') {
      const fields = Array.isArray(args.fields) ? (args.fields as unknown[]).map(String) : t.columns;
      const csv = toCsv(rows, fields);
      return { text: `table · "${t.name}" as CSV (${rows.length} rows)\n${csv.slice(0, 200_000)}${csv.length > 200_000 ? '\n... cut: save the file with make_document (fromTable) instead' : ''}`, isError: false, changed: false, rows };
    }
    if (action === 'drop') {
      store.drop(args.name);
      return { text: `table · "${t.name}" dropped (${rows.length} rows)`, isError: false, changed: true };
    }
    throw new Error('unknown action');
  } catch (error) {
    const dirty = store.dirty;
    store.dirty = before || dirty;
    return { text: `error: ${error instanceof Error ? error.message : String(error)}`, isError: true, changed: dirty };
  } finally {
    store.dirty = store.dirty || before;
  }
}

/** The rows of a table as a sheet for make_document: header from the columns (the row number column "#" is left out). */
export function tableAsSheet(store: TableStore, name: string, options: { fields?: string[]; sheetName?: string } = {}): { name: string; columns: string[]; rows: Array<Array<string | number | boolean | null>> } {
  const t = store.need(name);
  const columns = options.fields?.length ? options.fields : t.columns;
  return { name: options.sheetName ?? t.name, columns, rows: t.rows.map(r => columns.map(c => r.data[c] ?? null)) };
}
