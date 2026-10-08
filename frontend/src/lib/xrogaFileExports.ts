import type { XrogaBlock } from './xrogaBlocks';

type DocumentBlock = Extract<XrogaBlock, { type: 'document' }>;
type TableBlock = Extract<XrogaBlock, { type: 'table' | 'spreadsheet' | 'database' }>;
type PresentationBlock = Extract<XrogaBlock, { type: 'presentation' }>;

export interface XrogaExportFile { filename: string; blob: Blob }

function fileStem(title: string | undefined, fallback: string): string {
  const value = (title ?? fallback).replace(/\\/g, '/').split('/').pop() ?? fallback;
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 72) || fallback;
}

function validateSize(length: number, limit: number, label: string): void {
  if (length > limit) throw new Error(`${label} is too large to export in the browser.`);
}

function plainText(value: string): string {
  return value.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)').replace(/\*\*|__|`/g, '');
}

function safeWebUrl(url: string): boolean {
  try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
}

/** The canonical Markdown block is persisted in the chat; the file is regenerated on demand. */
export async function exportDocumentDocx(block: DocumentBlock): Promise<XrogaExportFile> {
  validateSize(block.content.length, 200_000, 'Document');
  const { Document, ExternalHyperlink, HeadingLevel, Packer, Paragraph, TextRun } = await import('docx');
  const children = block.content.split(/\r?\n/).map((raw) => {
    const line = raw.trim();
    if (!line) return new Paragraph('');
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) return new Paragraph({ text: plainText(heading[2]!), heading: [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3][heading[1]!.length - 1] });
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) return new Paragraph({ text: plainText(bullet[1]!), bullet: { level: 0 } });
    const runs: Array<InstanceType<typeof TextRun> | InstanceType<typeof ExternalHyperlink>> = [];
    const links = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
    let cursor = 0;
    for (const match of line.matchAll(links)) {
      if (match.index > cursor) runs.push(new TextRun(plainText(line.slice(cursor, match.index))));
      if (safeWebUrl(match[2]!)) runs.push(new ExternalHyperlink({ children: [new TextRun({ text: match[1]!, style: 'Hyperlink' })], link: match[2]! }));
      else runs.push(new TextRun(match[1]!));
      cursor = match.index + match[0].length;
    }
    if (cursor < line.length) runs.push(new TextRun(plainText(line.slice(cursor))));
    return new Paragraph({ children: runs });
  });
  const doc = new Document({ title: block.title ?? 'Xroga document', creator: 'Xroga', sections: [{ children }] });
  const blob = await Packer.toBlob(doc);
  return { filename: `${fileStem(block.title, 'document')}.docx`, blob };
}

/** PDF export deliberately fails on unsupported glyphs instead of silently corrupting them. */
export async function exportDocumentPdf(block: DocumentBlock): Promise<XrogaExportFile> {
  validateSize(block.content.length, 200_000, 'Document');
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  pdf.setTitle(block.title ?? 'Xroga document');
  pdf.setCreator('Xroga');
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 48;
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
    const text = plainText(heading?.[1] ?? raw).replace(/[\u2018\u2019]/g, "'").replace(/[\u2013\u2014]/g, '-').replace(/[\u201C\u201D]/g, '"');
    if (!text.trim()) { y -= 7; continue; }
    if (/[^\x20-\x7E]/.test(text)) throw new Error('PDF export currently supports Latin text only. Download DOCX to preserve all characters.');
    const activeFont = heading ? bold : font;
    const words = text.split(/\s+/);
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && activeFont.widthOfTextAtSize(candidate, size) > pageSize[0] - margin * 2) { addLine(line, size, Boolean(heading)); line = word; }
      else line = candidate;
    }
    if (line) addLine(line, size, Boolean(heading));
    if (heading) y -= 5;
  }
  const bytes = await pdf.save();
  return { filename: `${fileStem(block.title, 'document')}.pdf`, blob: new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }) };
}

export async function exportTableXlsx(block: TableBlock): Promise<XrogaExportFile> {
  validateSize(block.rows.length, 10_000, 'Table');
  validateSize(block.columns.length, 50, 'Table');
  const excelPackage = await import('exceljs');
  const ExcelJS = excelPackage.default ?? excelPackage;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Xroga';
  const sheet = workbook.addWorksheet(fileStem(block.title, 'Data').slice(0, 31));
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
    slide.addText(item.title.slice(0, 200), { x: 0.7, y: 0.55, w: 11.9, h: 0.8, fontFace: 'Aptos Display', fontSize: 28, bold: true, color: '0F172A', breakLine: false, fit: 'shrink' });
    const body = [item.body, ...(item.bullets ?? []).map((bullet) => `• ${bullet}`)].filter(Boolean).join('\n\n');
    if (body) slide.addText(body.slice(0, 4_000), { x: 0.8, y: 1.7, w: 11.7, h: 4.7, fontFace: 'Aptos', fontSize: 20, color: '334155', valign: 'top', breakLine: false, fit: 'shrink' });
  }
  const output = await deck.write({ outputType: 'arraybuffer', compression: true });
  return { filename: `${fileStem(block.title, 'presentation')}.pptx`, blob: new Blob([output as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }) };
}

export function downloadExportedFile(file: XrogaExportFile): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
