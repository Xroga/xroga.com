export const nativeOfficeLimits = { columns: 50, rows: 250, formulas: 64, slides: 80 } as const;
const MAX_CONTENT_CHARS = 200_000;
const cellNumber = (text: string) => {
  const value = Number(text);
  if (!text || !Number.isFinite(value)) return;
  const decimal = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(text);
  if (!decimal && !(text.includes('e') && String(value) === text)) return;
  const significant = text.split('e', 1)[0].replace(/[.-]/g, '').replace(/^0+|0+$/g, '');
  // Excel stores at most 15 significant digits. Keep longer identifiers
  // literal, as well as any number spelled with leading zeros.
  return significant.length <= 15 ? value : undefined;
};

const splitRow = (line: string) => line.trim().replace(/^\||(?<!\\)\|$/g, '')
  .split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, '|').replace(/^`|`$/g, '').replace(/^\*\*|\*\*$/g, ''));
const cellAddress = /^([A-Z]{1,2})([1-9]\d{0,2})$/;
const formulaLine = /^[-*]\s+([A-Z]{1,2}[1-9]\d{0,2})\s*:\s*`?(=[^\x60]+?)`?$/i;
const operand = '([A-Z]{1,2}[1-9]\\d{0,2}|-?\\d+(?:\\.\\d+)?)';
const arithmetic = new RegExp('^' + operand + '([+*/-])' + operand + '$');
const aggregate = /^(SUM|AVERAGE|MIN|MAX)\(([A-Z]{1,2}[1-9]\d{0,2}):([A-Z]{1,2}[1-9]\d{0,2})\)$/;

function officeLines(text: string) {
  if (text.length > MAX_CONTENT_CHARS) return [];
  let fence: string | undefined;
  return text.split(/\r?\n/).map(line => {
    const mark = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (mark) {
      if (!fence) fence = mark[1];
      else if (mark[1]!.startsWith(fence) && !mark[2]!.trim()) fence = undefined;
      return '';
    }
    return fence ? '' : line;
  });
}

/** Editable, portable slides written as a title and one heading per slide. */
export function parseNativeSlideDeck(text: string) {
  if (/^\s*(?:`{3,}|~{3,})/m.test(text)) return;
  const lines = officeLines(text);
  const title = lines.map(line => /^#\s+(.+)$/.exec(line)?.[1]?.trim()).find(Boolean);
  const slides: Array<{ id: string; title: string; body: string }> = [];
  let content: string[] = [];
  for (const line of lines) {
    const heading = /^##\s+(.+)$/.exec(line)?.[1]?.trim();
    if (heading) {
      if (slides.length) slides.at(-1)!.body = content.join('\n').trim();
      slides.push({ id: 'slide-' + (slides.length + 1), title: heading, body: '' });
      content = [];
    } else if (slides.length) content.push(line);
  }
  if (!slides.length || slides.length > nativeOfficeLimits.slides) return;
  slides.at(-1)!.body = content.join('\n').trim();
  if (slides.some(slide => !slide.body || slide.title.length > 200 || slide.body.length > 4_000)) return;
  return { title, slides };
}

export type NativeWorkbookFormula = { address: string; formula: string; result: number };

/** Compile only a single local sheet. Cell strings stay literal. Only the
 * explicitly declared Formula section can create formulas, with local
 * numeric inputs, bounded coordinates and no external references or calls. */
export function parseNativeWorkbook(text: string, requiresFormulas = false) {
  const lines = officeLines(text);
  const findDivider = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
  const dividers = lines.flatMap((line, index) => findDivider(line) ? [index] : []);
  if (dividers.length !== 1) return;
  const dividerIndex = dividers[0]!;
  const title = lines.slice(0, dividerIndex).map(line => /^#\s+(.+)$/.exec(line)?.[1]?.trim()).find(Boolean);
  const headers = splitRow(lines[dividerIndex - 1] ?? '');
  if (headers.length < 2 || headers.length > nativeOfficeLimits.columns ||
      headers.some(label => !label) || headers.length !== splitRow(lines[dividerIndex]!).length) return;
  const rows: Array<Array<string | number>> = [];
  for (const line of lines.slice(dividerIndex + 1)) {
    if (!line.includes('|')) break;
    const cells = splitRow(line);
    if (cells.length !== headers.length) return;
    rows.push(cells.map(cell => cellNumber(cell) ?? cell));
    if (rows.length > nativeOfficeLimits.rows) return;
  }
  if (!rows.length) return;

  const coordinates = (address: string) => {
    const match = cellAddress.exec(address);
    if (!match) return;
    let column = 0;
    for (const letter of match[1]!) column = column * 26 + letter.charCodeAt(0) - 64;
    const row = Number(match[2]);
    if (column > headers.length || row < 2 || row > rows.length + 1) return;
    return { column: column - 1, row: row - 2 };
  };
  const addressAt = (column: number, row: number) => (column >= 26 ? 'A' : '')
    + String.fromCharCode(65 + column % 26) + (row + 2);
  const expressions = new Map<string, string>();
  const formulaStart = lines.findIndex((line, index) => index > dividerIndex && /^##\s+Formulas\s*$/i.test(line));
  if (formulaStart >= 0) {
    for (const line of lines.slice(formulaStart + 1)) {
      if (/^#{1,2}\s/.test(line)) break;
      if (!line.trim()) continue;
      const match = formulaLine.exec(line.trim());
      const address = match?.[1]?.toUpperCase();
      const raw = match?.[2]?.slice(1);
      if (!raw || /[A-Z0-9][ \t]+[A-Z0-9]/i.test(raw)) return;
      const expression = raw.replace(/[ \t]/g, '').toUpperCase();
      if (!address || !expression || expression.length > 120 || !coordinates(address) || expressions.has(address)) return;
      expressions.set(address, expression);
      if (expressions.size > nativeOfficeLimits.formulas) return;
    }
  }
  if ((requiresFormulas || formulaStart >= 0) && !expressions.size) return;

  const computed = new Map<string, number>();
  const visiting = new Set<string>();
  function valueOf(address: string): number | undefined {
    if (computed.has(address)) return computed.get(address);
    const location = coordinates(address);
    if (!location || visiting.has(address)) return;
    const formula = expressions.get(address);
    if (!formula) {
      const value = rows[location.row]?.[location.column];
      return typeof value === 'number' ? value : undefined;
    }
    visiting.add(address);
    const result = calculate(formula);
    visiting.delete(address);
    if (result !== undefined && Number.isFinite(result)) {
      computed.set(address, result);
      return result;
    }
  }
  function calculate(formula: string): number | undefined {
    const simple = arithmetic.exec(formula);
    if (simple) {
      const a = cellNumber(simple[1]!) ?? valueOf(simple[1]!);
      const b = cellNumber(simple[3]!) ?? valueOf(simple[3]!);
      if (a === undefined || b === undefined) return;
      switch (simple[2]) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
      }
    }
    const range = aggregate.exec(formula);
    if (!range) return;
    const start = coordinates(range[2]!);
    const end = coordinates(range[3]!);
    if (!start || !end || start.column > end.column || start.row > end.row) return;
    const values: number[] = [];
    for (let row = start.row; row <= end.row; row++) for (let column = start.column; column <= end.column; column++) {
      const value = valueOf(addressAt(column, row));
      if (value === undefined) return;
      values.push(value);
    }
    if (range[1] === 'MIN') return Math.min(...values);
    if (range[1] === 'MAX') return Math.max(...values);
    const sum = values.reduce((total, value) => total + value, 0);
    return range[1] === 'AVERAGE' ? sum / values.length : sum;
  }
  const formulas: NativeWorkbookFormula[] = [];
  for (const [address, formula] of expressions) {
    const result = valueOf(address);
    if (result === undefined) return;
    const cell = coordinates(address)!;
    const supplied = rows[cell.row]![cell.column];
    if (supplied !== '' && supplied !== result) return;
    formulas.push({ address, formula, result });
  }
  return { title, headers, rows, formulas };
}
