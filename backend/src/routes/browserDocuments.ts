import { createRequire } from 'node:module';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';

const require = createRequire(import.meta.url);
type PdfItem = { str: string; width?: number; transform?: number[] };
type PdfPage = { getTextContent(options: { normalizeWhitespace: boolean }): Promise<{ items: PdfItem[] }> };

/** Why a document could not be read: a short code the extension shows to the person, never a raw library message. */
export class DocumentError extends Error {
  constructor(readonly reason: 'encrypted' | 'no_text' | 'invalid', message: string) { super(message); this.name = 'DocumentError'; }
}

/**
 * Page text in reading order with its layout kept: text at the same height is one line, and a wide gap inside a line becomes a tab,
 * so the columns of a table stay columns and its rows stay rows (joining every item with a space merged them into one line).
 */
export function pageText(items: PdfItem[]): string {
  const words = items.filter(item => item.str.trim());
  if (words.some(item => !Array.isArray(item.transform))) return words.map(item => item.str.trim()).join(' ');
  const rows: Array<{ y: number; cells: PdfItem[] }> = [];
  for (const item of [...words].sort((a, b) => b.transform![5]! - a.transform![5]!)) {
    const row = rows.find(r => Math.abs(r.y - item.transform![5]!) <= 2.5);
    if (row) row.cells.push(item); else rows.push({ y: item.transform![5]!, cells: [item] });
  }
  return rows.map(row => {
    let line = '';
    let end = 0;
    row.cells.sort((a, b) => a.transform![4]! - b.transform![4]!).forEach((cell, index) => {
      const x = cell.transform![4]!;
      if (index > 0) line += x - end > 12 ? '\t' : ' ';
      line += cell.str.trim();
      end = x + (cell.width ?? 0);
    });
    return line;
  }).join('\n');
}
const pdf = require('pdf-parse/lib/pdf.js/v2.0.550/build/pdf.js') as {
  getDocument(options: { data: Uint8Array; isEvalSupported: false; disableFontFace: true; verbosity: 0 }): {
    promise: Promise<{ numPages: number; getPage(page: number): Promise<PdfPage> }>;
    destroy(): Promise<void>;
  };
};
const MAX_EXPANDED = 12 * 1024 * 1024;
const MAX_TEXT = 500_000;
const MAX_PAGES = 400;

// Validate every stream before giving the same archive to an Office reader.
// The central directory covers archives that use ZIP data descriptors.
function officeArchive(data: Buffer) {
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0 || end + 22 > data.length || end + 22 + data.readUInt16LE(end + 20) !== data.length ||
    data.readUInt16LE(end + 4) || data.readUInt16LE(end + 6)) throw Error('Invalid Office archive');
  let offset = data.readUInt32LE(end + 16);
  const count = data.readUInt16LE(end + 10);
  if (count > 256 || offset + data.readUInt32LE(end + 12) !== end) throw Error('Invalid Office directory');
  const files = new Map<string, Buffer>();
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || data.readUInt32LE(offset) !== 0x02014b50) throw Error('Invalid Office directory');
    const method = data.readUInt16LE(offset + 10);
    const compressed = data.readUInt32LE(offset + 20);
    const size = data.readUInt32LE(offset + 24);
    const nameEnd = offset + 46 + data.readUInt16LE(offset + 28);
    const local = data.readUInt32LE(offset + 42);
    const name = data.toString('utf8', offset + 46, nameEnd);
    total += size;
    if (nameEnd > end || local + 30 > end || data.readUInt32LE(local) !== 0x04034b50 ||
      total > MAX_EXPANDED || files.has(name) || data.readUInt16LE(offset + 8) & 1 ||
      name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) throw Error('Unsafe Office entry');
    const content = local + 30 + data.readUInt16LE(local + 26) + data.readUInt16LE(local + 28);
    if (content + compressed > end) throw Error('Invalid Office entry');
    const raw = data.subarray(content, content + compressed);
    const bytes = method === 0 ? raw : method === 8 ? inflateRawSync(raw, { maxOutputLength: Math.max(1, size) }) : null;
    if (!bytes || bytes.length !== size) throw Error('Invalid Office entry size');
    files.set(name, bytes);
    offset = nameEnd + data.readUInt16LE(offset + 30) + data.readUInt16LE(offset + 32);
  }
  if (offset !== end) throw Error('Invalid Office directory length');
  return files;
}

function decodeXml(text: string) {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  return text.replace(/&(amp|lt|gt|quot|apos|#x[0-9a-f]+|#\d+);/gi, (match, key: string) => {
    if (key in entities) return entities[key]!;
    const n = key.startsWith('#x') ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
  });
}

export async function readBrowserDocument(name: string, data: Buffer): Promise<string> {
  let text: string;
  if (/\.pdf$/i.test(name)) {
    if (data.toString('ascii', 0, 5) !== '%PDF-') throw new DocumentError('invalid', 'Invalid PDF');
    const task = pdf.getDocument({ data: Uint8Array.from(data), isEvalSupported: false, disableFontFace: true, verbosity: 0 });
    try {
      const document = await task.promise;
      text = '';
      const last = Math.min(document.numPages, MAX_PAGES);
      for (let page = 1; page <= last; page++) {
        const content = await (await document.getPage(page)).getTextContent({ normalizeWhitespace: true });
        const block = `[Page ${page}]\n${pageText(content.items)}\n\n`;
        // A long document is read as far as the limits allow and says where it stopped, instead of being refused.
        if (text.length + block.length > MAX_TEXT) {
          text += `[Stopped before page ${page} of ${document.numPages}: the text limit was reached]\n`;
          break;
        }
        text += block;
        if (page === last && last < document.numPages) text += `[Stopped after page ${last} of ${document.numPages}: the page limit was reached]\n`;
      }
    } catch (error) {
      if (error instanceof DocumentError) throw error;
      if (/password/i.test(`${(error as { name?: string } | null)?.name} ${(error as Error | null)?.message}`)) throw new DocumentError('encrypted', 'This PDF is password-protected.');
      throw new DocumentError('invalid', 'This PDF could not be read.');
    } finally {
      await task.destroy();
    }
  } else if (/\.docx$/i.test(name)) {
    const xml = officeArchive(data).get('word/document.xml')?.toString('utf8');
    if (!xml) throw Error('Missing Word document');
    text = decodeXml(xml.replace(/<w:(?:tab|br)\b[^>]*\/>/g, '\t')
      .replace(/<\/w:p>/g, '\n').replace(/<\/w:tc>/g, '\t').replace(/<[^>]+>/g, ''));
  } else if (/\.xlsx$/i.test(name)) {
    if (!officeArchive(data).has('xl/workbook.xml')) throw Error('Missing spreadsheet');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Uint8Array.from(data).buffer);
    const lines: string[] = [];
    let chars = 0;
    workbook.eachSheet(sheet => {
      lines.push(`[Sheet: ${sheet.name}]`);
      sheet.eachRow(row => {
        const cells: string[] = [];
        row.eachCell(cell => {
          const value = cell.formula && cell.result == null ? '[formula has no cached result]' : cell.text;
          if (value) cells.push(`${cell.address}=${JSON.stringify(value)}`);
        });
        const line = cells.join('\t');
        chars += line.length;
        if (chars > MAX_TEXT) throw Error('Split large spreadsheets');
        if (line) lines.push(line);
      });
    });
    text = lines.join('\n');
  } else {
    throw Error('Unsupported document format');
  }
  text = text.trim();
  if (!text || !text.replace(/\[Page \d+\]/g, '').trim()) throw new DocumentError('no_text', 'The document has no readable text (a scanned or image-only file).');
  if (text.length > MAX_TEXT + 200) throw new DocumentError('invalid', 'The document text is over the limit.');
  return text;
}
