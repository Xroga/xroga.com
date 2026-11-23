import { describe, expect, it } from 'vitest';
import { runDataOps, runDataOpsTool, normalise } from '../data-ops';

const rows = [
  { name: 'Ana', email: 'Ana@Mail.test', site: 'https://www.ana.test/', score: '12', country: 'UK' },
  { name: 'Ana B', email: 'ana+lead@mail.test', site: 'ana.test', score: '30', country: 'UK' },
  { name: 'Bilal', email: 'bilal@mail.test', site: 'http://bilal.test', score: '1,200', country: 'PK' },
  { name: 'Carla', email: '', site: '', score: '5', country: 'PK' },
  { name: 'Dev', email: '', site: '', score: '7', country: 'UK' },
];

describe('data_ops', () => {
  it('removes duplicates by a loose key and says which row repeats which', () => {
    const out = runDataOps(rows, [{ op: 'dedupe', by: 'email', loose: true }]);
    expect(out.rows.map(r => r.name)).toEqual(['Ana', 'Bilal', 'Carla', 'Dev']);
    expect(out.notes[1]).toMatch(/dropped 1 duplicate.*row 2.*repeats row 1/);
  });
  it('never calls rows without a key duplicates of each other', () => {
    expect(runDataOps(rows, [{ op: 'dedupe', by: 'site' }]).rows.map(r => r.name)).toEqual(['Ana', 'Ana B', 'Bilal', 'Carla', 'Dev']);
    expect(runDataOps(rows, [{ op: 'dedupe', by: 'site', loose: true }]).rows.map(r => r.name)).toEqual(['Ana', 'Bilal', 'Carla', 'Dev']);
  });
  it('filters, sorts numerically with thousands separators, picks and limits', () => {
    const out = runDataOps(rows, [{ op: 'filter', field: 'country', test: 'eq', value: 'uk' }, { op: 'sort', by: 'score', order: 'desc' }, { op: 'pick', fields: ['name', 'score'] }, { op: 'limit', n: 2 }]);
    expect(out.rows).toEqual([{ name: 'Ana B', score: '30' }, { name: 'Ana', score: '12' }]);
    expect(runDataOps(rows, [{ op: 'sort', by: 'score', order: 'desc' }]).rows[0]!.name).toBe('Bilal');
  });
  it('fills a template per row and refuses an unknown field', () => {
    expect(runDataOps(rows.slice(0, 1), [{ op: 'template', as: 'greeting', text: 'Hello {name},' }]).rows[0]!.greeting).toBe('Hello Ana,');
    expect(() => runDataOps(rows, [{ op: 'template', as: 'g', text: '{nope}' }])).toThrow(/no field "nope"/);
  });
  it('groups and counts', () => {
    expect(runDataOps(rows, [{ op: 'group', by: 'country' }]).groups).toEqual([{ country: 'UK', count: 3 }, { country: 'PK', count: 2 }]);
  });
  it('refuses empty input, unknown ops and an invalid pattern, through the tool as an error text', () => {
    expect(runDataOpsTool({ rows: [], steps: [{ op: 'limit', n: 1 }] }).isError).toBe(true);
    expect(runDataOpsTool({ rows, steps: [{ op: 'explode' } as never] }).text).toMatch(/op is one of/);
    expect(runDataOpsTool({ rows, steps: [{ op: 'filter', field: 'name', test: 'matches', value: '(' }] }).text).toMatch(/not a valid pattern/);
    expect(runDataOpsTool({ rows, steps: [{ op: 'limit', n: 2 }] }).text).toMatch(/result: 2 rows/);
  });
  it('normalises loosely', () => {
    expect(normalise('HTTPS://www.Ana.test/', true)).toBe('ana.test');
    expect(normalise('Ana+x@Mail.test', true)).toBe('ana@mail.test');
  });
});
