import { describe, expect, it } from 'vitest';
import { TABLE_TOOL, TableStore, flatRow, runTableTool, tableAsSheet } from '../table-store';
import type { Row } from '../data-ops';

const none = { extracted: [] as Row[][] };
const run = (s: TableStore, args: Record<string, unknown>, src: { extracted: Row[][]; working?: Row[] } = none) => runTableTool(s, args, src);

describe('adding rows', () => {
  it('creates a table on the first add and counts what happened', () => {
    const s = new TableStore();
    const r = run(s, { action: 'add', name: 'Leads', rows: [{ name: 'A', site: 'a.com' }, { name: 'B', site: 'b.com' }] });
    expect(r.isError).toBe(false);
    expect(r.changed).toBe(true);
    expect(r.text).toContain('2 added');
    expect(s.tables.leads!.columns).toEqual(['name', 'site']);
    expect(s.tables.leads!.rows.map(x => x.n)).toEqual([1, 2]);
  });
  it('with a key, a row seen again updates the first and an empty cell does not blank a filled one', () => {
    const s = new TableStore();
    run(s, { action: 'add', name: 'L', key: 'site', rows: [{ name: 'A', site: 'https://www.a.com/', phone: '123' }] });
    const r = run(s, { action: 'add', name: 'L', rows: [{ name: 'A Ltd', site: 'a.com', phone: '', email: 'x@a.com' }, { name: 'B', site: 'b.com' }, { name: 'nokey' }] });
    expect(r.text).toContain('1 added, 1 updated, 1 skipped; now 2 rows');
    const a = s.tables.l!.rows[0]!;
    expect(a.data).toMatchObject({ name: 'A Ltd', phone: '123', email: 'x@a.com' });
    expect(a.rev).toBe(2);
    expect(s.tables.l!.columns).toContain('email');
  });
  it('takes rows from the last extraction or the working set, and says when there is none', () => {
    const s = new TableStore();
    expect(run(s, { action: 'add', name: 'X', from: 'last' }).isError).toBe(true);
    const src = { extracted: [[{ a: '1' }], [{ a: '2' }, { a: '3' }]] as Row[][], working: [{ a: '9' }] as Row[] };
    run(s, { action: 'add', name: 'X', from: 'last', table: 2 }, src);
    run(s, { action: 'add', name: 'X', from: 'working' }, src);
    expect(s.tables.x!.rows.map(r => r.data.a)).toEqual(['2', '3', '9']);
  });
  it('keeps nested values as text and refuses a bad name or a table over the limit', () => {
    expect(flatRow({ a: { b: 1 }, c: [1, 2], d: null, e: true })).toEqual({ a: '{"b":1}', c: '[1,2]', d: null, e: true });
    const s = new TableStore();
    expect(run(s, { action: 'create', name: '' }).isError).toBe(true);
    expect(run(s, { action: 'create', name: 'a/b' }).isError).toBe(true);
    expect(run(s, { action: 'upsert', name: 'U', rows: [{ a: 1 }] }).isError).toBe(true);
  });
});

describe('reading and changing', () => {
  const fill = () => {
    const s = new TableStore();
    run(s, { action: 'add', name: 'P', key: 'id', rows: Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, price: i * 10, name: `item ${i}` })) });
    return s;
  };
  it('lists in pages and says where the next page starts, with a filter and chosen fields', () => {
    const s = fill();
    const r = run(s, { action: 'list', name: 'P', limit: 5, offset: 10, fields: ['id'] });
    expect(r.text).toContain('showing 11-15');
    expect(r.text).toContain('offset 15');
    expect(r.text).toContain('"id":"p10"');
    expect(r.text).not.toContain('price');
    const w = run(s, { action: 'list', name: 'P', where: { field: 'price', test: 'gte', value: 400 } });
    expect(w.text).toContain('10 of 50 rows');
  });
  it('gets, updates with a new revision, and deletes by row, key or filter', () => {
    const s = fill();
    expect(run(s, { action: 'get', name: 'P', key: 'p3' }).text).toContain('"price":30');
    const u = run(s, { action: 'update', name: 'P', row: 4, set: { price: 999, note: 'sale' } });
    expect(u.text).toContain('revision 2');
    expect(s.tables.p!.columns).toContain('note');
    expect(run(s, { action: 'delete', name: 'P', rowsNumbers: [1, 2] }).text).toContain('2 rows deleted');
    expect(run(s, { action: 'delete', name: 'P', keys: ['p10'] }).text).toContain('1 row deleted');
    expect(run(s, { action: 'delete', name: 'P', where: { field: 'price', test: 'gt', value: 400 } }).text).toContain('deleted');
    expect(run(s, { action: 'count', name: 'P' }).text).toContain('rows');
    expect(run(s, { action: 'get', name: 'P', row: 1 }).isError).toBe(true);
  });
  it('runs the steps of data_ops on a table, and keeps the result only when asked', () => {
    const s = fill();
    const q = run(s, { action: 'query', name: 'P', steps: [{ op: 'filter', field: 'price', test: 'lt', value: 100 }, { op: 'sort', by: 'price', order: 'desc' }, { op: 'limit', n: 3 }] });
    expect(q.text).toContain('result: 3 rows');
    expect(q.changed).toBe(false);
    expect(s.tables.p!.rows).toHaveLength(50);
    const kept = run(s, { action: 'query', name: 'P', apply: true, steps: [{ op: 'filter', field: 'price', test: 'lt', value: 100 }] });
    expect(kept.changed).toBe(true);
    expect(s.tables.p!.rows).toHaveLength(10);
    expect(s.tables.p!.rows[0]!.n).toBe(1);
    expect(run(s, { action: 'query', name: 'P', apply: true, steps: [{ op: 'group', by: 'name' }] }).isError).toBe(true);
  });
  it('writes CSV, lists the tables, drops one, and gives a table as a sheet', () => {
    const s = fill();
    expect(run(s, { action: 'csv', name: 'P', fields: ['id', 'price'] }).text).toContain('id,price');
    expect(run(s, { action: 'tables' }).text).toContain('P: 50 rows');
    const sheet = tableAsSheet(s, 'P', { fields: ['id', 'price'] });
    expect(sheet.columns).toEqual(['id', 'price']);
    expect(sheet.rows[1]).toEqual(['p1', 10]);
    expect(run(s, { action: 'drop', name: 'P' }).text).toContain('dropped');
    expect(run(s, { action: 'list', name: 'P' }).isError).toBe(true);
    expect(run(s, { action: 'sparkle' }).isError).toBe(true);
  });
});

describe('what is saved', () => {
  it('round-trips through JSON and reports a change only when there is one', () => {
    const s = new TableStore();
    expect(run(s, { action: 'list', name: 'none' }).changed).toBe(false);
    run(s, { action: 'add', name: 'T', key: 'k', rows: [{ k: 'a', v: 1 }] });
    const copy = new TableStore(JSON.parse(JSON.stringify(s.tables)));
    expect(copy.rowsOf('T')).toEqual(s.rowsOf('T'));
    copy.dirty = false;
    expect(run(copy, { action: 'list', name: 'T' }).changed).toBe(false);
    expect(run(copy, { action: 'add', name: 'T', rows: [{ k: 'a', v: 1 }] }).changed).toBe(true);
    expect(TABLE_TOOL.name).toBe('table');
  });
});
