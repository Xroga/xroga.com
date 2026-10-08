import assert from 'node:assert/strict';
import { test } from 'node:test';
import { csvCell, csvFilename, tableToCsv } from './xrogaCsv';

test('CSV export preserves types, quotes, commas, and line breaks', () => {
  const csv = tableToCsv([{ key: 'name', label: 'Name' }, { key: 'value', label: 'Value' }], [
    { name: 'A, "quoted"\nname', value: 42 },
  ]);
  assert.equal(csv, '"Name","Value"\r\n"A, ""quoted""\nname","42"');
});

test('CSV cells neutralize common spreadsheet formula prefixes', () => {
  for (const text of ['=1+1', '+SUM(A1)', '-2+3', '@cmd', '  =HYPERLINK("x")', '\t=1']) {
    assert.equal(csvCell(text), `"'${text.replace(/"/g, '""')}"`);
  }
  assert.equal(csvCell(-2), '"-2"');
});

test('CSV filenames cannot introduce paths or special file extensions', () => {
  assert.equal(csvFilename('../../report.exe'), 'report.exe.csv');
});
