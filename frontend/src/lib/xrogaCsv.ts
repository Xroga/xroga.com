type Scalar = string | number | boolean | null;

/** Escapes CSV syntax and prevents spreadsheet programs from evaluating untrusted cells. */
export function csvCell(value: Scalar): string {
  let text = value === null ? '' : String(value);
  if (typeof value === 'string' && /^[\s\uFEFF]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function tableToCsv(
  columns: ReadonlyArray<{ key: string; label: string }>,
  rows: ReadonlyArray<Record<string, Scalar>>,
): string {
  return [columns.map((column) => csvCell(column.label)), ...rows.map((row) => columns.map((column) => csvCell(row[column.key] ?? null)))].map((cells) => cells.join(',')).join('\r\n');
}

export function csvFilename(title: string): string {
  const basename = title.replace(/\\/g, '/').split('/').pop() ?? '';
  const stem = basename.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 80) || 'table';
  return `${stem}.csv`;
}
