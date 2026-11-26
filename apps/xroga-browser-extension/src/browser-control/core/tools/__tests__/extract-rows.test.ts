import { describe, expect, it } from 'vitest';
import { describeTable, tableToObjects } from '../extract-rows';
import { runDataOpsTool } from '../../../../agent/data-ops';
import type { ExtractedTable } from '../../../probe/source';

const leads: ExtractedTable = {
  name: 'Leads',
  kind: 'table',
  columns: ['Company', 'Email', 'Company', 'Score'],
  rows: [
    ['Orbit Labs', 'a@orbit.test', 'x', '31'],
    ['Orbit Labs Ltd', 'A@Orbit.test', 'x', '20'],
    ['Kite', 'k@kite.test', 'y', '47'],
  ],
  links: [[0, 0, 'https://orbit.test/']],
  moreBelow: true,
  merged: 1,
};

describe('extract_rows', () => {
  it('turns a table into objects keyed by column, numbers a repeated name and keeps links', () => {
    const rows = tableToObjects(leads);
    expect(rows[0]).toEqual({ Company: 'Orbit Labs', 'Company (link)': 'https://orbit.test/', Email: 'a@orbit.test', 'Company 2': 'x', Score: '31' });
    expect(rows).toHaveLength(3);
  });

  it('says what it found, including merged cells and rows still below', () => {
    const text = describeTable(leads, 1).join('\n');
    expect(text).toContain('"Leads" (table, 4 columns, 3 rows');
    expect(text).toContain('MORE ROWS BELOW');
    expect(text).toContain('1 merged cell');
    expect(text).toContain('1. Orbit Labs | a@orbit.test | x | 31');
  });

  it('feeds data_ops without the model retyping a cell, and the result becomes the working set', () => {
    const tables = [tableToObjects(leads)];
    const first = runDataOpsTool({ steps: [{ op: 'dedupe', by: 'Email', loose: true }] }, { tables });
    expect(first.isError).toBe(false);
    expect(first.rows).toHaveLength(2);
    const second = runDataOpsTool({ steps: [{ op: 'sort', by: 'Score', order: 'desc' }] }, { tables, current: first.rows });
    expect(second.rows!.map(r => r.Company)).toEqual(['Kite', 'Orbit Labs']);
    expect(runDataOpsTool({ steps: [{ op: 'limit', n: 1 }] }).text).toMatch(/no rows yet/);
  });
});
