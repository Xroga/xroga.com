import { describe, expect, it } from 'vitest';
import { runDataOps, runDataOpsTool, normalise, toCsv } from '../data-ops';

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

describe('data_ops validate', () => {
  const messy = [
    { email: 'ana@mail.test', site: 'ana.test', phone: '+44 113 555 0142', score: '1,200' },
    { email: 'not-an-email', site: 'localhost', phone: '12', score: 'n/a' },
    { email: '', site: 'https://b.test/x', phone: '0113 555 0177', score: '$30' },
  ];
  it('reports rows that fail, keeps them by default, and names the offending values', () => {
    const r = runDataOps(messy, [{ op: 'validate', field: 'email', kind: 'email' }]);
    expect(r.rows).toHaveLength(3);
    expect(r.notes.at(-1)).toContain('2 of 3 rows have a email that is not a valid email');
    expect(r.notes.at(-1)).toContain('row 2 email="not-an-email"');
    expect(r.notes.at(-1)).toContain('add drop true');
  });
  it('drops failing rows when asked', () => {
    const r = runDataOps(messy, [{ op: 'validate', field: 'email', kind: 'email', drop: true }]);
    expect(r.rows).toEqual([messy[0]]);
  });
  it('checks url, phone and number shapes', () => {
    expect(runDataOps(messy, [{ op: 'validate', field: 'site', kind: 'url', drop: true }]).rows.map(r => r.site)).toEqual(['ana.test', 'https://b.test/x']);
    expect(runDataOps(messy, [{ op: 'validate', field: 'phone', kind: 'phone', drop: true }]).rows).toHaveLength(2);
    expect(runDataOps(messy, [{ op: 'validate', field: 'score', kind: 'number', drop: true }]).rows.map(r => r.score)).toEqual(['1,200', '$30']);
  });
  it('needs a field and a kind', () => {
    expect(() => runDataOps(messy, [{ op: 'validate', field: 'email' }])).toThrow(/kind/);
  });
});

describe('csv', () => {
  it('quotes commas, quotes and newlines, and keeps formulas from running in a spreadsheet', () => {
    const out = toCsv([{ name: 'A, B', note: 'say "hi"', f: '=SUM(A1)', n: '-5', p: '+44 113 000' }], ['name', 'note', 'f', 'n', 'p']);
    expect(out).toBe('name,note,f,n,p\r\n"A, B","say ""hi""",\'=SUM(A1),-5,\'+44 113 000');
  });
  it('takes every column in first-seen order when none are named', () => {
    expect(toCsv([{ a: 1 }, { a: 2, b: 3 }])).toBe('a,b\r\n1,\r\n2,3');
  });
  it('is a step that ends data_ops with the rows as CSV text', () => {
    const out = runDataOpsTool({ rows: [{ a: 'x', b: 1 }, { a: 'y', b: 2 }], steps: [{ op: 'sort', by: 'b', order: 'desc' }, { op: 'csv', fields: ['a', 'b'] }] });
    expect(out.text).toContain('a,b\r\ny,2\r\nx,1');
  });
});
