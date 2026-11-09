import type { ResponseNodeV2 } from '../response-experience-v2/document';

export type OpenUiNode = Extract<ResponseNodeV2, { kind: 'table' | 'chart' | 'calculator' }>;

// Only application-owned component names and JSON literals enter OpenUI Lang.
// Model output never becomes an expression, action, tool name, or state binding.
export function workspaceVisualProgram(node: OpenUiNode, stacked = false): string | null {
  if (node.kind === 'calculator') return 'root = Scenario()';
  if (node.kind === 'table') {
    if (stacked || !node.rows.length || node.rows.length > 10 || node.columns.length > 8) return null;
    const columns = node.columns.map(column => column.label);
    const rows = node.rows.map(row => node.columns.map(column => row[column.key] ?? null));
    return renderCall('Table', [columns, rows, node.title ?? '']);
  }

  // The upstream plot coerces missing data to zero and treats line/area x values
  // as categories. Keep the existing renderer for incompatible inputs.
  if (node.rows.length < 2 || node.rows.length > 60) return null;
  const labels = node.series.map(series => series.label);
  const axisLabel = node.xKey;
  const keys = [axisLabel, ...labels];
  if (labels.length > 6 || new Set(keys).size !== keys.length ||
      keys.some(key => !key || ['__proto__', 'constructor', 'prototype'].includes(key))) return null;
  if (node.rows.some(row => (node.shape === 'scatter'
    ? !validCoordinate(row[node.xKey])
    : typeof row[node.xKey] !== 'string') ||
      node.series.some(series => {
        const value = row[series.key];
        return !validCoordinate(value);
      }))) return null;
  if (node.shape === 'pie' && (node.series.length !== 1 || node.rows.length > 6 ||
    node.rows.some(row => Number(row[node.series[0].key]) < 0) ||
    node.rows.every(row => row[node.series[0].key] === 0))) return null;

  const rows = node.rows.map(row => Object.fromEntries(keys.map((key, index) =>
    [key, row[index === 0 ? node.xKey : node.series[index - 1].key]])));
  return renderCall('Chart', [node.shape, rows, axisLabel, labels]);
}

function validCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1e15 &&
    (value === 0 || Math.abs(value) >= 1e-12);
}

function renderCall(name: 'Chart' | 'Table', args: unknown[]): string | null {
  const program = `root = ${name}(${args.map(value => JSON.stringify(value)).join(', ')})`;
  // Leave unusually large data sets with the existing paged renderer.
  return program.length <= 32_000 ? program : null;
}
