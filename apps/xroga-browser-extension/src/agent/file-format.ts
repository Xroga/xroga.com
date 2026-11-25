// `read_file`: the contents of a document file at an address, read on the device: Word, Excel, PowerPoint, OpenDocument,
// EPUB, CSV/TSV, JSON, plain text, HTML, RSS and zip archives. The result is text a model can use (headings, lists, tables,
// slides, sheets with their real row numbers, column profiles for tables). Idea: the converter set of MarkItDown and the
// backends of Docling (MIT; Python libraries Xroga does not run) and the profile of a table; written fresh.
import type { AgentTool } from './tools';
import { decodeText, ZipFile, ZipError, DEFAULT_ZIP_LIMITS } from './zip-read';
import { htmlToText, markdownTable, parseXml, kids, kid, textOf, readDocx, readXlsx, readPptx, readOdf, readEpub, colName, type XNode } from './office-read';

export const READ_FILE_TOOL: AgentTool = {
  name: 'read_file',
  source: 'agent',
  group: 'reading',
  description:
    'Read a document file at an address (or the open tab if it shows one): Word docx, Excel xlsx, PowerPoint pptx, OpenDocument, EPUB, CSV/TSV, JSON, text, HTML, RSS, zip. Spreadsheets list sheets with real row numbers; sheet/rows pick a sheet and a row range (default 1-50), chapter picks an EPUB chapter, member opens a file inside a zip, find returns only matching lines, offset continues a long result. PDFs: use read_pdf. Read-only; nothing leaves the browser.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', maxLength: 2000 },
      sheet: { type: 'string', maxLength: 80 },
      rows: { type: 'string', maxLength: 40 },
      chapter: { type: 'number' },
      member: { type: 'string', maxLength: 300 },
      find: { type: 'string', maxLength: 120 },
      offset: { type: 'number' },
      tabId: { type: 'number' },
    },
    additionalProperties: false,
  },
};

export interface FileReadOptions {
  name?: string;
  contentType?: string;
  sheet?: string;
  rows?: string;
  chapter?: number;
  member?: string;
  find?: string;
  offset?: number;
}

export interface FileReadResult {
  kind: string;
  text: string;
}

const MAX_CHARS = 24_000;
const NL = String.fromCharCode(10);

/** The address of a document file a tab shows (docx, xlsx, pptx, epub, csv, ...), found in an outline's first line. */
export function fileAddressIn(outline: string): string | undefined {
  return /(https?:\/\/\S+?\.(?:docx|xlsx|pptx|epub|csv|tsv|odt|ods|odp|json|ndjson))(?:[?#]\S*)?\s+·\s+viewport/i.exec(outline)?.[1];
}

/** "51-100" or "7" as an inclusive range; empty gives 1..fallback. */
export function parseRange(spec: string | undefined, fallback = 50): [number, number] {
  const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(spec ?? '');
  if (!m) return [1, fallback];
  const a = Number(m[1]);
  const b = m[2] ? Number(m[2]) : a;
  return [Math.max(1, Math.min(a, b)), Math.min(Math.max(a, b), Math.min(a, b) + 2000)];
}

// ---------------------------------------------------------------- tables: csv, json, sheets

export function parseDelimited(text: string): { rows: string[][]; delimiter: string } {
  let src = text.replace(/^\uFEFF/, '');
  let delimiter = '';
  const sep = /^sep=(.)\r?\n/i.exec(src);
  if (sep) {
    delimiter = sep[1];
    src = src.slice(sep[0].length);
  }
  if (!delimiter) {
    // The delimiter that gives the same, largest number of fields on the first lines (quotes respected).
    const lines = src.split(/\r?\n/).filter(l => l.trim()).slice(0, 8);
    let best = ',';
    let bestScore = -1;
    for (const d of [',', ';', '\t', '|']) {
      const counts = lines.map(l => splitLine(l, d).length);
      const first = counts[0] ?? 1;
      const consistent = counts.filter(c => c === first).length;
      const score = first > 1 ? consistent * 100 + first : 0;
      if (score > bestScore) {
        bestScore = score;
        best = d;
      }
    }
    delimiter = best;
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(f => f !== '') || row.length > 1) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return { rows, delimiter };
}
function splitLine(line: string, d: string): string[] {
  const out: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += ch;
    } else if (ch === '"' && f === '') q = true;
    else if (ch === d) {
      out.push(f);
      f = '';
    } else f += ch;
  }
  out.push(f);
  return out;
}

const numeric = (v: string) => /^[-+]?\s*[$€£]?\s*\d[\d,]*(\.\d+)?\s*%?$/.test(v.trim()) || /^[-+]?\d*\.\d+(e[-+]?\d+)?$/i.test(v.trim());
const toNumber = (v: string) => Number(v.replace(/[^\d.eE+-]/g, ''));

/** One line per column: its type, the empty count, the range of numbers or the few distinct values. */
export function profileColumns(header: string[], body: string[][]): string[] {
  const lines: string[] = [];
  for (let c = 0; c < header.length; c++) {
    const values = body.map(r => (r[c] ?? '').trim());
    const filled = values.filter(v => v !== '');
    const empty = values.length - filled.length;
    let desc: string;
    if (filled.length && filled.every(numeric)) {
      const nums = filled.map(toNumber).filter(Number.isFinite);
      const sum = nums.reduce((a, b) => a + b, 0);
      desc = `number, ${Math.min(...nums)} to ${Math.max(...nums)}, sum ${Math.round(sum * 100) / 100}`;
    } else if (filled.length && filled.every(v => /^\d{4}-\d{2}-\d{2}/.test(v))) desc = `date, ${[...filled].sort()[0]} to ${[...filled].sort()[filled.length - 1]}`;
    else {
      const distinct = [...new Set(filled)];
      desc = distinct.length <= 8 ? `text, ${distinct.length} values: ${distinct.map(v => v.slice(0, 24)).join(', ')}` : `text, ${distinct.length} distinct`;
    }
    lines.push(`  ${header[c] || colName(c)}: ${desc}${empty ? `, ${empty} empty` : ''}`);
  }
  return lines;
}

function tableText(title: string, rows: string[][], range: [number, number], rowNumbers?: number[]): string {
  if (!rows.length) return `${title}: no rows.`;
  const header = rows[0];
  const body = rows.slice(1);
  const [from, to] = range;
  // Row numbers: for a sheet the real ones, otherwise the position in the file (the header is row 1).
  const numberOf = (i: number) => (rowNumbers ? rowNumbers[i] : i + 1);
  const picked = rows.map((r, i) => ({ r, n: numberOf(i) })).filter((x, i) => i > 0 && x.n >= from && x.n <= to);
  const shown = [['row', ...header], ...picked.map(x => [String(x.n), ...x.r])];
  const head = `${title}: ${body.length} data row${body.length === 1 ? '' : 's'} × ${header.length} column${header.length === 1 ? '' : 's'}${rowNumbers ? `, header in row ${rowNumbers[0]}` : ''}.`;
  const profile = body.length > 5 ? `Columns:${NL}${profileColumns(header, body).join(NL)}` : '';
  const more = picked.length < body.length ? `Rows ${picked[0]?.n ?? from}-${picked[picked.length - 1]?.n ?? to} shown; ask for others with rows "51-100".` : 'All rows shown.';
  return [head, profile, markdownTable(shown), more].filter(Boolean).join(NL + NL);
}

function jsonShape(value: unknown, depth = 0): string {
  if (Array.isArray(value)) return `array of ${value.length}${value.length ? ` (${jsonShape(value[0], depth + 1)})` : ''}`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value as object);
    return depth > 2 ? `object (${keys.length} keys)` : `object {${keys.slice(0, 12).map(k => `${k}: ${jsonShape((value as Record<string, unknown>)[k], depth + 1)}`).join(', ')}${keys.length > 12 ? ', …' : ''}}`;
  }
  return value === null ? 'null' : typeof value;
}

function readJson(text: string, options: FileReadOptions): string {
  let value: unknown;
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  try {
    value = JSON.parse(text);
  } catch (error) {
    // Newline-delimited JSON: one value per line.
    try {
      value = lines.map(l => JSON.parse(l) as unknown);
    } catch {
      throw new Error(`the file is not valid JSON (${error instanceof Error ? error.message.slice(0, 120) : 'parse error'})`);
    }
  }
  const out = [`JSON: ${jsonShape(value)}`];
  if (Array.isArray(value) && value.length > 1 && value.every(v => v && typeof v === 'object' && !Array.isArray(v))) {
    const keys = [...new Set(value.flatMap(v => Object.keys(v as object)))].slice(0, 40);
    const rows = [keys, ...value.map(v => keys.map(k => { const x = (v as Record<string, unknown>)[k]; return x === undefined ? '' : typeof x === 'object' && x !== null ? JSON.stringify(x).slice(0, 120) : String(x); }))];
    out.push(tableText('Records', rows, parseRange(options.rows)));
  } else out.push(JSON.stringify(value, null, 2));
  return out.join(NL + NL);
}

function readFeed(xml: string): string | undefined {
  const doc = parseXml(xml);
  const root = doc.children.find((c): c is XNode => typeof c !== 'string');
  if (!root || !/^(rss|feed|rdf)$/i.test(root.name)) return undefined;
  const channel = kid(root, 'channel') ?? root;
  const items = kids(channel, 'item').length ? kids(channel, 'item') : kids(root, 'entry').length ? kids(root, 'entry') : kids(root, 'item');
  const lines = [`Feed: ${textOf(kid(channel, 'title')).trim()} (${items.length} items)`];
  for (const it of items.slice(0, 50)) {
    const link = kid(it, 'link');
    const href = link?.attrs.href ?? textOf(link).trim();
    lines.push(`- ${textOf(kid(it, 'title')).trim()}${href ? ` — ${href}` : ''}${textOf(kid(it, 'pubDate') ?? kid(it, 'updated') ?? kid(it, 'published')).trim() ? ` (${textOf(kid(it, 'pubDate') ?? kid(it, 'updated') ?? kid(it, 'published')).trim()})` : ''}`);
  }
  return lines.join(NL);
}

// ---------------------------------------------------------------- dispatch

type Kind = 'docx' | 'xlsx' | 'pptx' | 'epub' | 'odf' | 'zip' | 'pdf' | 'legacy-office' | 'image' | 'json' | 'csv' | 'html' | 'xml' | 'text';

export function detectKind(bytes: Uint8Array, name = '', contentType = ''): Kind {
  const ext = /\.([a-z0-9]+)(?:$|[?#])/i.exec(name)?.[1]?.toLowerCase() ?? '';
  const head = (n: number) => String.fromCharCode(...bytes.subarray(0, n));
  if (head(5) === '%PDF-') return 'pdf';
  if (head(4) === 'PK\u0003\u0004') return 'zip';
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0) return 'legacy-office';
  if (head(8) === '\u0089PNG\r\n\u001a\n' || (bytes[0] === 0xff && bytes[1] === 0xd8) || head(4) === 'GIF8' || head(4) === 'RIFF') return 'image';
  const sample = decodeText(bytes.subarray(0, 4096)).trimStart();
  if (ext === 'json' || ext === 'ndjson' || ext === 'jsonl' || /json/.test(contentType) || /^[[{]/.test(sample)) return 'json';
  if (ext === 'csv' || ext === 'tsv' || /csv|tab-separated/.test(contentType)) return 'csv';
  if (ext === 'html' || ext === 'htm' || /html/.test(contentType) || /^<!doctype html|^<html/i.test(sample)) return 'html';
  if (ext === 'xml' || ext === 'rss' || ext === 'atom' || /xml/.test(contentType) || /^<\?xml/i.test(sample)) return 'xml';
  return 'text';
}

async function zipKind(zip: ZipFile, name: string): Promise<Kind> {
  if (zip.has('word/document.xml')) return 'docx';
  if (zip.has('xl/workbook.xml')) return 'xlsx';
  if (zip.has('ppt/presentation.xml')) return 'pptx';
  const mimetype = (await zip.text('mimetype'))?.trim() ?? '';
  if (mimetype === 'application/epub+zip' || zip.has('META-INF/container.xml')) return 'epub';
  if (/^application\/vnd\.oasis\.opendocument/.test(mimetype) || (zip.has('content.xml') && /\.(odt|ods|odp)$/i.test(name))) return 'odf';
  return 'zip';
}

/** Keeps the lines that contain the text, each with the heading it sits under. */
function findLines(text: string, find: string): string {
  const want = find.toLowerCase();
  const out: string[] = [];
  let section = '';
  for (const line of text.split(NL)) {
    if (/^#{1,6} /.test(line)) section = line.replace(/^#+ /, '').slice(0, 60);
    if (line.toLowerCase().includes(want)) out.push(`${section ? `[${section}] ` : ''}${line.trim().slice(0, 300)}`);
    if (out.length >= 80) break;
  }
  return out.length ? `${out.length} line${out.length === 1 ? '' : 's'} contain “${find}”:${NL}${out.join(NL)}` : `No line contains “${find}”.`;
}

function cut(text: string, offset: number): string {
  if (text.length <= MAX_CHARS && !offset) return text;
  const part = text.slice(offset, offset + MAX_CHARS);
  const rest = text.length - offset - part.length;
  return `${part}${rest > 0 ? `${NL}${NL}… ${rest} more characters; continue with offset ${offset + part.length}.` : ''}`;
}

export async function readFileContents(bytes: Uint8Array, options: FileReadOptions = {}): Promise<FileReadResult> {
  let kind = detectKind(bytes, options.name, options.contentType);
  if (kind === 'pdf') return { kind, text: 'This is a PDF: use read_pdf (pages, find, and text recognition for scans).' };
  if (kind === 'image') return { kind, text: 'This is a picture: open it in a tab and use ocr or parse_screen to read the words in it.' };
  if (kind === 'legacy-office') return { kind, text: 'This is an old binary Office file (doc, xls, ppt). It cannot be read here: open it in its web app, or ask for the same file saved as docx, xlsx or pptx.' };
  let body = '';
  try {
    if (kind === 'zip') {
      const zip = new ZipFile(bytes);
      kind = await zipKind(zip, options.name ?? '');
      if (kind === 'docx') body = await readDocx(zip);
      else if (kind === 'xlsx') {
        const sheets = await readXlsx(zip);
        const [from, to] = parseRange(options.rows);
        const wanted = options.sheet ? sheets.filter(s => s.name.toLowerCase() === options.sheet!.toLowerCase()) : sheets;
        if (options.sheet && !wanted.length) return { kind, text: `error: there is no sheet named "${options.sheet}". Sheets: ${sheets.map(s => s.name).join(', ')}.` };
        const parts = [`Workbook: ${sheets.length} sheet${sheets.length === 1 ? '' : 's'}: ${sheets.map(s => `${s.name}${s.hidden ? ' (hidden)' : ''} (${s.rowCount} rows × ${s.columns} columns)`).join('; ')}.`];
        // Without a sheet name the first sheet with data is shown in full, the others only listed.
        const show = options.sheet ? wanted : wanted.filter(s => s.rowCount).slice(0, 1);
        for (const s of show) {
          const rows = s.rows.map(r => Array.from({ length: s.columns }, (_, i) => r.cells[i] ?? ''));
          parts.push(tableText(`## Sheet ${s.name}`, rows, [from, to], s.rows.map(r => r.n)));
        }
        if (!options.sheet && sheets.length > 1) parts.push('Other sheets: ask for them with sheet "name".');
        body = parts.join(NL + NL);
      } else if (kind === 'pptx') {
        const slides = await readPptx(zip);
        body = `Presentation: ${slides.length} slides.${NL}${NL}` + slides.map(s => [`## Slide ${s.n}${s.title ? `: ${s.title}` : ''}`, ...s.paragraphs, ...s.tables, s.notes ? `Speaker notes: ${s.notes}` : ''].filter(Boolean).join(NL)).join(NL + NL);
      } else if (kind === 'epub') {
        const book = await readEpub(zip);
        const head = `Book: “${book.title}”${book.author ? ` by ${book.author}` : ''}${book.language ? ` (${book.language})` : ''}, ${book.chapters.length} chapters.`;
        const toc = book.chapters.map(c => `${c.n}. ${c.title} (${c.text.length} characters)`).join(NL);
        const chapter = options.chapter ? book.chapters.find(c => c.n === options.chapter) : undefined;
        if (options.chapter && !chapter) return { kind, text: `error: the book has no chapter ${options.chapter}.${NL}${toc}` };
        body = chapter ? `${head}${NL}${NL}## Chapter ${chapter.n}${NL}${NL}${chapter.text}` : `${head}${NL}${NL}Chapters:${NL}${toc}${NL}${NL}Read one with chapter N. The first chapter follows.${NL}${NL}${book.chapters[0]?.text ?? ''}`;
      } else if (kind === 'odf') body = await readOdf(zip);
      else {
        if (options.member) {
          const entry = zip.entries.find(e => e.name === options.member) ?? zip.entries.find(e => e.name.toLowerCase() === options.member!.toLowerCase());
          if (!entry) return { kind, text: `error: the archive has no member "${options.member}".` };
          const inner = await zip.bytes(entry.name);
          return inner ? { ...(await readFileContents(inner, { ...options, member: undefined, name: entry.name, contentType: '' })), kind: 'zip member' } : { kind, text: 'error: the member could not be read.' };
        }
        const files = zip.entries.filter(e => !e.isDirectory);
        body = `Zip archive: ${files.length} files, ${zip.entries.reduce((n, e) => n + e.size, 0)} bytes uncompressed (limits: ${DEFAULT_ZIP_LIMITS.maxMembers} members).${NL}${files.slice(0, 300).map(e => `- ${e.name} (${e.size} bytes)`).join(NL)}${files.length > 300 ? `${NL}… and ${files.length - 300} more` : ''}${NL}${NL}Open one with member "path".`;
      }
    } else {
      const text = decodeText(bytes);
      if (kind === 'json') body = readJson(text, options);
      else if (kind === 'csv') {
        const parsed = parseDelimited(text);
        body = tableText(`Table (delimiter ${parsed.delimiter === '\t' ? 'tab' : `"${parsed.delimiter}"`})`, parsed.rows, parseRange(options.rows));
      } else if (kind === 'html') body = htmlToText(text);
      else if (kind === 'xml') body = readFeed(text) ?? text.slice(0, 200_000);
      else body = text;
    }
  } catch (error) {
    if (error instanceof ZipError) return { kind, text: `error: ${error.message}.` };
    throw error;
  }
  const finalText = options.find?.trim() ? findLines(body, options.find) : cut(body, Math.max(0, Math.floor(options.offset ?? 0)));
  return { kind, text: `read_file (${kind}):${NL}${finalText}` };
}
