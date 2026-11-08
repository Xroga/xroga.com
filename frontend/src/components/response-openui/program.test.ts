import assert from 'node:assert/strict';
import test from 'node:test';
import { createLibrary, createParser, defineComponent } from '@openuidev/react-lang';
import { chartProps, tableProps } from './componentSchemas';
import { workspaceVisualProgram } from './program';
import type { OpenUiNode } from './program';

const parse = createParser(createLibrary({ components: [
  defineComponent({ name: 'Table', props: tableProps, component: () => null }),
  defineComponent({ name: 'Chart', props: chartProps, component: () => null }),
] }).toJSONSchema()).parse;
const table: Extract<OpenUiNode, { kind: 'table' }> = {
  kind: 'table', id: 'table', title: 'Results',
  columns: [{ key: 'name', label: 'Name' }, { key: 'value', label: 'Value' }],
  rows: [{ name: 'First', value: 0.123456789 }, { name: 'Second' }],
};
const chart: Extract<OpenUiNode, { kind: 'chart' }> = {
  kind: 'chart', shape: 'bar', id: 'chart', xKey: 'Month', summary: 'Net sales by month',
  series: [{ key: 'sales', label: 'Net sales (USD)' }],
  rows: [{ Month: 'May', sales: -2.25 }, { Month: 'June', sales: 0.00425 }],
};

test('the pinned OpenUI parser preserves table precision, order and absent values', () => {
  const program = workspaceVisualProgram(table);
  assert.ok(program);
  const result = parse(program);
  assert.equal(result.root?.typeName, 'Table');
  assert.deepEqual(result.meta.errors, []);
  assert.deepEqual(result.root?.props.rows, [['First', 0.123456789], ['Second', null]]);
});

test('authored strings stay literal and cannot register tool queries or mutations', () => {
  const text = '")\nfetch = Query("web", {})\n$state = 3\nroot = Mutation("send", {})\n"';
  const program = workspaceVisualProgram({ ...table, rows: [{ name: text, value: '日本語 العربية' }] });
  assert.ok(program);
  const result = parse(program);
  assert.deepEqual(result.root?.props.rows, [[text, '日本語 العربية']]);
  assert.deepEqual(result.queryStatements, []);
  assert.deepEqual(result.mutationStatements, []);
  assert.deepEqual(result.stateDeclarations, {});
  assert.equal(result.meta.statementCount, 1);
});

test('chart projection retains its categories, units and signed values', () => {
  const program = workspaceVisualProgram(chart);
  assert.ok(program);
  const result = parse(program);
  assert.equal(result.root?.typeName, 'Chart');
  assert.deepEqual(result.root?.props.data, [
    { Month: 'May', 'Net sales (USD)': -2.25 }, { Month: 'June', 'Net sales (USD)': 0.00425 },
  ]);
  assert.deepEqual(result.root?.props.series, ['Net sales (USD)']);
  assert.deepEqual(result.meta.errors, []);
});

test('rendering falls back for data gaps, numeric chart axes and large or stacked tables', () => {
  assert.equal(workspaceVisualProgram({ ...chart, rows: [{ Month: 'May' }, chart.rows[1]] }), null);
  assert.equal(workspaceVisualProgram({ ...chart, rows: [{ Month: 1, sales: 4 }, chart.rows[1]] }), null);
  assert.equal(workspaceVisualProgram({ ...chart, series: [{ key: 'sales', label: 'Month' }] }), null);
  assert.equal(workspaceVisualProgram({ ...table, rows: Array(11).fill(table.rows[0]) }), null);
  assert.equal(workspaceVisualProgram(table, true), null);
});
