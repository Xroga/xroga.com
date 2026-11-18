/**
 * Reading Office files without a library: an .xlsx or .docx is a ZIP of XML parts, so the attachment reader can turn it into the
 * text the agent reads (CSV per sheet, paragraphs with headings, lists and tables). No DOM is needed, so it runs in the service worker.
 * Only the parts needed are inflated, with hard size limits against zip bombs. Nothing here executes or evaluates anything in the file:
 * macros, formulas' results are read as stored values, external links and embedded objects are ignored.
 * PDF is not handled here: reading PDF text needs a PDF library (see docs/xroga/evidence/browser-operator-20261110/GAP-REGISTER-20261117.md).
 */

const MAX_ENTRY_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const MAX_SHEET_ROWS = 20_000;
const MAX_SHEET_COLUMNS = 512;

export const OFFICE_TEXT = /\.(xlsx|docx)$/i;
export const isOfficeText = (name: string): boolean => OFFICE_TEXT.test(name);

export class OfficeError extends Error {
  constructor(message: string) { super(message); this.name = 'OfficeError'; }
}

type Entry = { method: number; compressedSize: number; size: number; offset: number };

async function inflateRaw(data: Uint8Array, limit: number): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { await reader.cancel().catch(() => undefined); throw new OfficeError('A part of this file is too large once unpacked.'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

function entries(bytes: Uint8Array): Map<string, Entry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new OfficeError('This is not a valid Office file (no ZIP directory).');
  const count = view.getUint16(eocd + 10, true);
  let at = view.getUint32(eocd + 16, true);
  if (count === 0xffff || at === 0xffffffff) throw new OfficeError('ZIP64 files are not supported.');
  const decoder = new TextDecoder();
  const map = new Map<string, Entry>();
  for (let n = 0; n < count; n++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) throw new OfficeError('The ZIP directory is damaged.');
    const method = view.getUint16(at + 10, true);
    const compressedSize = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const offset = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    map.set(name, { method, compressedSize, size, offset });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return map;
}

async function part(bytes: Uint8Array, directory: Map<string, Entry>, name: string, spent: { total: number }): Promise<string | undefined> {
  const entry = directory.get(name);
  if (!entry) return undefined;
  if (entry.size > MAX_ENTRY_BYTES) throw new OfficeError('A part of this file is too large.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (entry.offset + 30 > bytes.length || view.getUint32(entry.offset, true) !== 0x04034b50) throw new OfficeError('The ZIP file is damaged.');
  const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
  const raw = bytes.subarray(start, start + entry.compressedSize);
  const data = entry.method === 0 ? raw : entry.method === 8 ? await inflateRaw(raw, MAX_ENTRY_BYTES) : undefined;
  if (!data) throw new OfficeError('This file uses a compression method that is not supported.');
  spent.total += data.length;
  if (spent.total > MAX_TOTAL_BYTES) throw new OfficeError('This file is too large once unpacked.');
  return new TextDecoder('utf-8').decode(data);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1].toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

const attr = (tag: string, name: string): string | undefined => new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
const textRuns = (xml: string): string => Array.from(xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g), m => decodeXml(m[1])).join('');

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

const csvCell = (value: string): string => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export interface SheetText { name: string; rows: number; columns: number; truncated: boolean; csv: string }

function sheetRows(xml: string, shared: string[]): { rows: string[][]; truncated: boolean } {
  const rows: string[][] = [];
  let truncated = false;
  for (const row of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const number = Number(attr(row[1], 'r'));
    const index = Number.isInteger(number) && number > 0 ? number - 1 : rows.length;
    if (index >= MAX_SHEET_ROWS) { truncated = true; break; }
    const cells: string[] = [];
    for (const cell of (row[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const col = columnIndex(attr(cell[1], 'r') ?? '');
      if (col >= MAX_SHEET_COLUMNS) { truncated = true; continue; }
      const type = attr(cell[1], 't');
      const inner = cell[2] ?? '';
      const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = textRuns(inner);
      else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE';
      else if (raw !== undefined) value = decodeXml(raw);
      while (cells.length < col) cells.push('');
      cells[col] = value;
    }
    while (rows.length < index) rows.push([]);
    rows[index] = cells;
  }
  return { rows, truncated };
}

export async function readXlsx(bytes: Uint8Array): Promise<SheetText[]> {
  const directory = entries(bytes);
  const spent = { total: 0 };
  const workbook = await part(bytes, directory, 'xl/workbook.xml', spent);
  if (!workbook) throw new OfficeError('This is not a spreadsheet (no workbook found).');
  const rels = (await part(bytes, directory, 'xl/_rels/workbook.xml.rels', spent)) ?? '';
  const targets = new Map<string, string>();
  for (const rel of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
    const id = attr(rel[1], 'Id');
    const target = attr(rel[1], 'Target');
    if (id && target) targets.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
  }
  const sharedXml = await part(bytes, directory, 'xl/sharedStrings.xml', spent);
  const shared = sharedXml ? Array.from(sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g), m => textRuns(m[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, ''))) : [];
  const sheets: SheetText[] = [];
  for (const sheet of workbook.matchAll(/<sheet\b([^>]*?)\/?>/g)) {
    const name = decodeXml(attr(sheet[1], 'name') ?? `Sheet${sheets.length + 1}`);
    const target = targets.get(attr(sheet[1], 'r:id') ?? '');
    const xml = target ? await part(bytes, directory, target, spent) : undefined;
    if (xml === undefined) continue;
    const { rows, truncated } = sheetRows(xml, shared);
    const columns = rows.reduce((most, row) => Math.max(most, row.length), 0);
    const csv = rows.map(row => Array.from({ length: columns }, (_, i) => csvCell(row[i] ?? '')).join(',')).join('\n');
    sheets.push({ name, rows: rows.length, columns, truncated, csv });
  }
  if (!sheets.length) throw new OfficeError('No sheets could be read from this spreadsheet.');
  return sheets;
}

export function xlsxText(name: string, sheets: SheetText[]): string {
  const head = `Spreadsheet «${name}»: ${sheets.length} sheet(s). Each sheet is shown as CSV (values as stored; dates appear as Excel serial numbers; formulas appear as their last saved value).`;
  return [head, ...sheets.map(s => `\n# sheet «${s.name}» · ${s.rows} rows × ${s.columns} columns${s.truncated ? ` · only the first ${MAX_SHEET_ROWS} rows and ${MAX_SHEET_COLUMNS} columns are read` : ''}\n${s.csv}`)].join('\n');
}

const paragraph = (xml: string): string => {
  const style = /<w:pStyle\b[^>]*w:val="([^"]*)"/.exec(xml)?.[1] ?? '';
  const level = /^heading\s*([1-6])$/i.exec(style)?.[1] ?? (/^title$/i.test(style) ? '1' : '');
  // Text runs, tabs and line breaks in document order.
  const text = Array.from(xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<(w:tab|w:br)\b[^>]*\/>/g),
    m => (m[2] === 'w:tab' ? '\t' : m[2] === 'w:br' ? '\n' : decodeXml(m[1] ?? ''))).join('').trim();
  if (!text) return '';
  if (level) return `${'#'.repeat(Number(level))} ${text}`;
  return /<w:numPr\b/.test(xml) ? `- ${text}` : text;
};

export async function readDocx(bytes: Uint8Array): Promise<string> {
  const directory = entries(bytes);
  const xml = await part(bytes, directory, 'word/document.xml', { total: 0 });
  if (!xml) throw new OfficeError('This is not a Word document (no document body found).');
  const lines: string[] = [];
  for (const block of xml.matchAll(/(<w:tbl\b[\s\S]*?<\/w:tbl>)|(<w:p[ >][\s\S]*?<\/w:p>)/g)) {
    if (block[1]) {
      for (const row of block[1].matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
        const cells = Array.from(row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g), cell =>
          Array.from(cell[0].matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g), p => paragraph(p[0])).filter(Boolean).join(' '));
        if (cells.length) lines.push(`| ${cells.join(' | ')} |`);
      }
      lines.push('');
    } else {
      lines.push(paragraph(block[2]));
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** The text of an attached file that is an .xlsx or .docx, with a line saying what it is. */
export async function officeText(name: string, data: Blob): Promise<string> {
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (/\.xlsx$/i.test(name)) return xlsxText(name, await readXlsx(bytes));
  return `Word document «${name}» (text, headings, lists and tables; images and comments are not read):\n\n${await readDocx(bytes)}`;
}
