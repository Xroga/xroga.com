import type { XrogaBlock } from './xrogaBlocks';
import type { IParagraphOptions, IRunOptions } from 'docx';
import type { PhrasingContent } from 'mdast';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { NativeDocumentFormat } from '../../../backend/src/ai/nativeDocumentDownload';
import { nativeMarkdownTables } from '../../../backend/src/ai/nativeMarkdown';
import { parseNativeSlideDeck, parseNativeWorkbook, type NativeWorkbookFormula } from '../../../backend/src/ai/nativeOfficeContent';

type DocumentBlock = Extract<XrogaBlock, { type: 'document' }>;
type TableBlock = Extract<XrogaBlock, { type: 'table' | 'spreadsheet' | 'database' }>;
type PresentationBlock = Extract<XrogaBlock, { type: 'presentation' }>;

export interface XrogaExportFile { filename: string; blob: Blob }

export class PdfUnsupportedCharactersError extends Error {}

function fileStem(title: string | undefined, fallback: string): string {
  const value = (title ?? fallback).replace(/\\/g, '/').split('/').pop() ?? fallback;
  const stem = value.normalize('NFC').replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '-').replace(/^[.-]+|[.-]+$/g, '');
  return [...stem].slice(0, 72).join('') || fallback;
}

function validateSize(length: number, limit: number, label: string): void {
  if (length > limit) throw new Error(`${label} is too large to export in the browser.`);
}

function plainText(value: string, verifiedLinks?: ReadonlySet<string>): string {
  return value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label: string, url: string) =>
    safeWebUrl(url) && (!verifiedLinks || verifiedLinks.has(url)) ? label + ' (' + url + ')' : label).replace(/\*\*|__|`/g, '');
}

function safeWebUrl(url: string): boolean {
  try {
    const target = new URL(url);
    return !target.username && !target.password && ['http:', 'https:'].includes(target.protocol);
  } catch { return false; }
}

function isRightToLeft(text: string): boolean {
  const firstLetter = text.match(/\p{L}/u)?.[0] ?? '';
  return /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Syriac}\p{Script=Thaana}\p{Script=Nko}\p{Script=Adlam}]/u.test(firstLetter);
}

/** The canonical Markdown block is persisted in the chat; the file is regenerated on demand. */
export async function exportDocumentDocx(block: DocumentBlock, verifiedLinks?: ReadonlySet<string>): Promise<XrogaExportFile> {
  validateSize(block.content.length, 200_000, 'Document');
  const { Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } = await import('docx');
  const markdown = unified().use(remarkParse);
  type Run = InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>;
  type RunStyle = Pick<IRunOptions, 'bold' | 'italics' | 'style'>;
  const inlineRuns = (line: string) => {
    const [paragraph] = markdown.parse(line).children;
    if (paragraph?.type !== 'paragraph') return [new TextRun(plainText(line, verifiedLinks))];
    const render = (nodes: PhrasingContent[], style: RunStyle = {}): Run[] => nodes.flatMap((node): Run[] => {
      if (node.type === 'strong') return render(node.children, { ...style, bold: true });
      if (node.type === 'emphasis') return render(node.children, { ...style, italics: true });
      if (node.type === 'text' || node.type === 'inlineCode') return [new TextRun({ ...style, text: node.value })];
      if (node.type === 'link') {
        if (!safeWebUrl(node.url) || (verifiedLinks && !verifiedLinks.has(node.url))) return render(node.children, style);
        return [new ExternalHyperlink({ children: render(node.children, { ...style, style: 'Hyperlink' }), link: node.url })];
      }
      const raw = line.slice(node.position?.start.offset, node.position?.end.offset);
      return [new TextRun({ ...style, text: raw })];
    });
    return render(paragraph.children);
  };
  const paragraph = (line: string, options: Pick<IParagraphOptions, 'heading' | 'bullet'> = {}) =>
    new Paragraph({ ...options, bidirectional: isRightToLeft(plainText(line, verifiedLinks)) || undefined, children: inlineRuns(line) });
  const lines = block.content.replace(/\r\n?/g, '\n').split('\n');
  const tables = new Map((block.format === 'markdown' ? nativeMarkdownTables(block.content) : []).map(table => [table.start, table]));
  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const table = tables.get(index);
    if (table) {
      const rows = [table.head, ...table.rows].map((row, rowIndex) => new TableRow({
        tableHeader: rowIndex === 0,
        cantSplit: true,
        children: row.map(cell => new TableCell({ children: [paragraph(cell)] })),
      }));
      children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } }));
      index = table.end - 1;
      continue;
    }
    const line = lines[index]!.trim();
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const bullet = line.match(/^[-*]\s+(.+)$/);
    children.push(heading
      ? paragraph(heading[2]!, { heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][heading[1]!.length - 1] })
      : bullet
        ? paragraph(bullet[1]!, { bullet: { level: 0 } })
        : paragraph(line));
  }
  const doc = new Document({ title: block.title ?? 'Xroga document', creator: 'Xroga', sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  return { filename: `${fileStem(block.title, 'document')}.docx`, blob };
}

/** PDF export deliberately fails on unsupported glyphs instead of silently corrupting them. */
export async function exportDocumentPdf(block: DocumentBlock, verifiedLinks?: ReadonlySet<string>): Promise<XrogaExportFile> {
  validateSize(block.content.length, 200_000, 'Document');
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(block.title ?? 'Xroga document');
  pdf.setCreator('Xroga');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const characterSets = { body: new Set(font.getCharacterSet()), heading: new Set(bold.getCharacterSet()) };
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 48;
  const availableWidth = pageSize[0] - margin * 2;
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;
  const addLine = (text: string, size: number, isBold = false) => {
    if (y < margin + size) { page = pdf.addPage(pageSize); y = pageSize[1] - margin; }
    page.drawText(text, { x: margin, y, size, font: isBold ? bold : font, color: rgb(0.08, 0.11, 0.17) });
    y -= size * 1.45;
  };
  for (const raw of block.content.split(/\r?\n/)) {
    const heading = raw.match(/^#{1,3}\s+(.+)$/);
    const size = heading ? (heading[0].startsWith('# ') ? 19 : 15) : 10.5;
    const text = plainText(heading?.[1] ?? raw, verifiedLinks).replace(/\t/g, '    ');
    if (!text.trim()) { y -= 7; continue; }
    const characters = heading ? characterSets.heading : characterSets.body;
    for (const character of text) {
      if (!characters.has(character.codePointAt(0)!)) {
        throw new PdfUnsupportedCharactersError('The PDF font does not support all characters in this answer. Download DOCX to preserve the text.');
      }
    }
    const activeFont = heading ? bold : font;
    const words = text.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (activeFont.widthOfTextAtSize(candidate, size) <= availableWidth) {
        line = candidate;
        continue;
      }
      if (line) addLine(line, size, Boolean(heading));
      if (activeFont.widthOfTextAtSize(word, size) <= availableWidth) {
        line = word;
        continue;
      }
      line = '';
      for (const character of word) {
        if (line && activeFont.widthOfTextAtSize(line + character, size) > availableWidth) {
          addLine(line, size, Boolean(heading));
          line = '';
        }
        line += character;
      }
    }
    if (line) addLine(line, size, Boolean(heading));
    if (heading) y -= 5;
  }
  const bytes = await pdf.save();
  return { filename: `${fileStem(block.title, 'document')}.pdf`, blob: new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }) };
}

export function exportTableXlsx(block: TableBlock): Promise<XrogaExportFile> {
  return writeTableXlsx(block);
}

async function writeTableXlsx(block: TableBlock, formulas: readonly NativeWorkbookFormula[] = []): Promise<XrogaExportFile> {
  validateSize(block.rows.length, 10_000, 'Table');
  validateSize(block.columns.length, 50, 'Table');
  const excelPackage = await import('exceljs');
  const ExcelJS = excelPackage.default ?? excelPackage;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Xroga';
  // Excel's limit is in UTF-16 units. Keep a supplementary character intact at the boundary.
  const sheetName = fileStem(block.title, 'Data').slice(0, 31).replace(/[\uD800-\uDBFF]$/, '');
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = block.columns.map((column) => ({ header: column.label, key: column.key, width: Math.min(42, Math.max(12, column.label.length + 4)) }));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of block.rows) {
    const values: Record<string, string | number | boolean | null> = {};
    for (const column of block.columns) {
      const value = row[column.key] ?? null;
      // Model-authored strings are always literal cells; never execute them as formulas.
      values[column.key] = value;
    }
    sheet.addRow(values);
  }
  if (formulas.length) {
    workbook.calcProperties.fullCalcOnLoad = true;
    for (const { address, formula, result } of formulas) sheet.getCell(address).value = { formula, result };
  }
  if (block.rows.length) sheet.autoFilter = { from: 'A1', to: `${sheet.getRow(1).getCell(block.columns.length).address}` };
  const buffer = await workbook.xlsx.writeBuffer();
  return { filename: `${fileStem(block.title, 'table')}.xlsx`, blob: new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) };
}

export async function exportPresentationPptx(block: PresentationBlock): Promise<XrogaExportFile> {
  validateSize(block.slides.length, 80, 'Presentation');
  const { default: PptxGenJS } = await import('pptxgenjs');
  const deck = new PptxGenJS();
  deck.layout = 'LAYOUT_WIDE';
  deck.author = 'Xroga';
  deck.subject = block.title ?? 'Xroga presentation';
  for (const item of block.slides) {
    const slide = deck.addSlide();
    slide.background = { color: 'F8FAFC' };
    const titleRtl = isRightToLeft(item.title);
    slide.addText(item.title.slice(0, 200), { x: 0.7, y: 0.55, w: 11.9, h: 0.8, fontFace: 'Aptos Display', fontSize: 28, bold: true, color: '0F172A', breakLine: false, fit: 'shrink',
      rtlMode: titleRtl, align: titleRtl ? 'right' : 'left' });
    const body = [item.body, ...(item.bullets ?? []).map((bullet) => `• ${bullet}`)].filter(Boolean).join('\n\n');
    const bodyRtl = isRightToLeft(body);
    if (body) slide.addText(body.slice(0, 4_000), { x: 0.8, y: 1.7, w: 11.7, h: 4.7, fontFace: 'Aptos', fontSize: 20, color: '334155', valign: 'top', breakLine: false, fit: 'shrink',
      rtlMode: bodyRtl, align: bodyRtl ? 'right' : 'left' });
  }
  const output = await deck.write({ outputType: 'arraybuffer', compression: true });
  return { filename: `${fileStem(block.title, 'presentation')}.pptx`, blob: new Blob([output as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }) };
}

export async function exportAnswerFile(response: string, format: NativeDocumentFormat, verifiedLinks: ReadonlySet<string>,
  shared = false): Promise<XrogaExportFile> {
  if (format === 'xlsx') {
    const data = parseNativeWorkbook(response);
    if (!data) throw new Error('This answer has no complete spreadsheet to download.');
    const columns = data.headers.map((label, index) => ({ label, key: 'column-' + index }));
    const rows = data.rows.map(row => Object.fromEntries(row.map((value, index) => [columns[index]!.key, value])));
    return writeTableXlsx({ schemaVersion: 1, id: 'answer-workbook', type: 'spreadsheet', title: data.title, columns, rows }, data.formulas);
  }
  if (format === 'pptx') {
    const data = parseNativeSlideDeck(response);
    if (!data) throw new Error('This answer has no complete slide deck to download.');
    return exportPresentationPptx({ schemaVersion: 1, id: 'answer-slides', type: 'presentation', title: data.title,
      slides: data.slides.map(slide => ({ ...slide, title: plainText(slide.title, verifiedLinks), body: plainText(slide.body, verifiedLinks) })) });
  }
  const heading = /^#{1,3}[ \t]+([^\r\n]+)/m.exec(response)?.[1]?.trim();
  const document: DocumentBlock = { schemaVersion: 1, id: 'answer-document', type: 'document', content: response,
    title: shared ? 'Shared Xroga answer' : heading?.slice(0, 100) || 'Xroga document', format: 'markdown' };
  if (format === 'txt') {
    validateSize(response.length, 200_000, 'Document');
    const text = plainText(response.replace(/^ {0,3}#{1,6}[ \t]+/gm, ''), verifiedLinks);
    return { filename: `${fileStem(document.title, 'document')}.txt`, blob: new Blob([text], { type: 'text/plain;charset=utf-8' }) };
  }
  return format === 'docx' ? exportDocumentDocx(document, verifiedLinks) : exportDocumentPdf(document, verifiedLinks);
}

export function downloadExportedFile(file: XrogaExportFile): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
