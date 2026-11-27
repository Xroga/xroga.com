// `make_document`: a real spreadsheet (.xlsx), Word document (.docx) or presentation (.pptx) written on the device from data the agent gives, saved in Downloads after the person agrees. This file
// is the part that needs no browser: the tool definition, checking the request (including turning markdown and CSV text into blocks and sheets, which is what a model writes most readily),
// naming the file and describing it. The bytes come from office-write.ts. The idea of a document tool with sheets and blocks comes from qz-browser-agent (Apache-2.0); written fresh.
import { docxBytes, pptxBytes, xlsxBytes, type Block, type Cell, type SheetSpec, type SlideSpec } from './office-write';
import type { AgentTool } from './tools';

export const DOCUMENT_FORMATS = ['xlsx', 'docx', 'pptx'] as const;
export type DocumentFormat = (typeof DOCUMENT_FORMATS)[number];

export const MAKE_DOCUMENT_TOOL: AgentTool = {
  name: 'make_document',
  source: 'agent',
  group: 'files',
  description:
    'Make a real Office file on this device and save it in Downloads (asks first in Ask mode, never overwrites): format xlsx (a spreadsheet), docx (a Word document) or pptx (a presentation). xlsx: sheets [{ name, columns: [header…], rows: [[cell…]…], formats?: { columnIndex: "date"|"datetime"|"percent"|"currency"|"integer"|"decimal"|"0.000" }, widths?, formulas? (strings starting = become formulas), freeze?, filter? }], or csv: "text" for one sheet. docx: markdown: "# Title\\n## Heading\\ntext with **bold**, *italic*, `code` and [links](https://…)\\n- bullets\\n1. numbers\\n| a | b |\\n|---|---|\\n| 1 | 2 |" or blocks [{ type: title|heading|paragraph|bullets|numbered|table|quote|code|pageBreak, … }]; page: a4|letter, landscape. pptx: slides [{ title, subtitle?, bullets: [text or { text, level }], text?, table: { header, rows }?, footer?, background?: "1F3864" }] (the first slide with only a title is a cover). Use it when the person asked for a file in that format, for tables, reports and decks that should open in Excel, Word or PowerPoint.',
  parameters: {
    type: 'object',
    properties: {
      format: { type: 'string', enum: [...DOCUMENT_FORMATS] },
      filename: { type: 'string', maxLength: 110 },
      title: { type: 'string', maxLength: 200 },
      sheets: { type: 'array', items: { type: 'object' } },
      csv: { type: 'string' },
      markdown: { type: 'string' },
      blocks: { type: 'array', items: { type: 'object' } },
      slides: { type: 'array', items: { type: 'object' } },
      page: { type: 'string', enum: ['a4', 'letter'] },
      landscape: { type: 'boolean' },
    },
    required: ['format'],
    additionalProperties: false,
  },
};

export const DOCUMENT_MIME: Record<DocumentFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export interface DocumentRequest {
  format: DocumentFormat;
  filename: string;
  title: string;
  sheets: SheetSpec[];
  blocks: Block[];
  slides: SlideSpec[];
  page: 'a4' | 'letter';
  landscape: boolean;
  notes: string[];
}
export type Checked = { ok: true; request: DocumentRequest } | { ok: false; errors: string[] };

/** CSV text (quotes, doubled quotes, commas, semicolons or tabs, line breaks inside quotes) as rows; numbers and booleans are kept as such. */
export function parseCsv(text: string): Cell[][] {
  const t = text.replace(/^﻿/, '');
  const first = t.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', ';', '\t', '|'].map(d => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some(f => f !== '') || row.length > 1) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some(f => f !== '') || row.length > 1) rows.push(row);
  return rows.map(r => r.map(f => cellOf(f)));
}

/** A text field as a cell: a plain number (not one with leading zeros, such as a postcode or a phone number) or true/false become that; everything else stays text. */
export function cellOf(field: string): Cell {
  const s = field.trim();
  if (s === '') return null;
  if (/^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(s)) return Number(s);
  if (/^(true|false)$/i.test(s)) return s.toLowerCase() === 'true';
  return field;
}

/** Markdown as blocks: # headings, paragraphs (lines joined), - or * bullets, 1. numbers, > quotes, ``` code, tables with a |---| row, --- as a page break only when written as ***pagebreak***. */
export function markdownToBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ type: 'paragraph', text: para.join(' ') });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    if (trimmed.startsWith('```')) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i]!.trim().startsWith('```'); i++) code.push(lines[i]!);
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flush();
      // one top-level "# " at the very start is the document's title
      if (h[1]!.length === 1 && blocks.length === 0) blocks.push({ type: 'title', text: h[2]! });
      else blocks.push({ type: 'heading', text: h[2]!, level: h[1]!.length - (blocks.some(b => b.type === 'title') ? 1 : 0) || 1 });
      continue;
    }
    if (/^\*{3}pagebreak\*{3}$/i.test(trimmed)) {
      flush();
      blocks.push({ type: 'pageBreak' });
      continue;
    }
    if (trimmed.startsWith('|') && /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test((lines[i + 1] ?? '').trim())) {
      flush();
      const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      const header = cells(trimmed);
      const rows: Cell[][] = [];
      for (i += 2; i < lines.length && lines[i]!.trim().startsWith('|'); i++) rows.push(cells(lines[i]!));
      i--;
      blocks.push({ type: 'table', header, rows });
      continue;
    }
    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flush();
      const items = [bullet[1]!];
      while (i + 1 < lines.length && /^[-*+]\s+/.test(lines[i + 1]!.trim())) items.push(lines[++i]!.trim().replace(/^[-*+]\s+/, ''));
      blocks.push({ type: 'bullets', items });
      continue;
    }
    const num = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (num) {
      flush();
      const items = [num[1]!];
      while (i + 1 < lines.length && /^\d+[.)]\s+/.test(lines[i + 1]!.trim())) items.push(lines[++i]!.trim().replace(/^\d+[.)]\s+/, ''));
      blocks.push({ type: 'numbered', items });
      continue;
    }
    if (trimmed.startsWith('>')) {
      flush();
      blocks.push({ type: 'quote', text: trimmed.replace(/^>\s?/, '') });
      continue;
    }
    para.push(trimmed);
  }
  flush();
  return blocks;
}

const BLOCK_TYPES = ['title', 'heading', 'paragraph', 'bullets', 'numbered', 'table', 'quote', 'code', 'pageBreak'];
const MAX_CELL = 32767;

/** Checks a request and fills in what it leaves out. Every refusal says which part and why. */
export function normalizeDocument(args: Record<string, unknown>): Checked {
  const errors: string[] = [];
  const notes: string[] = [];
  const format = String(args.format ?? '').toLowerCase() as DocumentFormat;
  if (!(DOCUMENT_FORMATS as readonly string[]).includes(format)) errors.push(`format must be one of ${DOCUMENT_FORMATS.join(', ')}.`);
  const title = typeof args.title === 'string' ? args.title.trim().slice(0, 200) : '';
  const sheets: SheetSpec[] = [];
  const blocks: Block[] = [];
  const slides: SlideSpec[] = [];

  if (format === 'xlsx') {
    const raw: unknown[] = Array.isArray(args.sheets) ? args.sheets : [];
    raw.slice(0, 255).forEach((s, i) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const rows = Array.isArray(o.rows) ? (o.rows as unknown[]).map(r => (Array.isArray(r) ? r : [r])) : [];
      if (!Array.isArray(o.rows)) errors.push(`sheet ${i + 1} needs rows: [[cell, …], …].`);
      const clean = (rows as unknown[][]).slice(0, 1_048_575).map(r => r.slice(0, 16384).map(c => (typeof c === 'string' ? (c.length > MAX_CELL ? (notes.push(`a cell was cut to ${MAX_CELL} characters, the most Excel keeps`), c.slice(0, MAX_CELL)) : c) : typeof c === 'number' || typeof c === 'boolean' || c === null || c === undefined ? c : String(c)) as Cell));
      const sheet: SheetSpec = { name: typeof o.name === 'string' && o.name.trim() ? o.name : `Sheet${i + 1}`, rows: clean };
      if (Array.isArray(o.columns)) sheet.columns = (o.columns as unknown[]).slice(0, 16384).map(c => String(c ?? ''));
      if (Array.isArray(o.widths)) sheet.widths = (o.widths as unknown[]).map(Number).filter(Number.isFinite);
      if (o.formats && typeof o.formats === 'object') sheet.formats = Object.fromEntries(Object.entries(o.formats as Record<string, unknown>).filter(([k, v]) => /^\d+$/.test(k) && typeof v === 'string').map(([k, v]) => [Number(k), String(v)]));
      if (o.formulas === true) sheet.formulas = true;
      if (typeof o.freeze === 'boolean') sheet.freeze = o.freeze;
      if (typeof o.filter === 'boolean') sheet.filter = o.filter;
      sheets.push(sheet);
    });
    if (typeof args.csv === 'string' && args.csv.trim()) {
      const all = parseCsv(args.csv);
      // the first row is the header when it is all text and the next row has a number or is shorter text: a plain heuristic, said in the notes
      const header = all[0]?.every(c => typeof c === 'string') && all.length > 1;
      sheets.push({ name: title || 'Data', ...(header ? { columns: all[0]!.map(String) } : {}), rows: header ? all.slice(1) : all });
      notes.push(header ? 'the first line of the CSV became the header row' : 'the CSV has no header row');
    }
    if (!sheets.length && !errors.length) errors.push('xlsx needs sheets: [{ name, columns, rows }] or csv text.');
  } else if (format === 'docx') {
    const rawBlocks: unknown[] = Array.isArray(args.blocks) ? args.blocks : [];
    rawBlocks.slice(0, 20000).forEach((b, i) => {
      const o = (b ?? {}) as Record<string, unknown>;
      if (!BLOCK_TYPES.includes(String(o.type))) {
        errors.push(`block ${i + 1} has the type "${String(o.type)}": use ${BLOCK_TYPES.join(', ')}.`);
        return;
      }
      blocks.push(o as unknown as Block);
    });
    if (typeof args.markdown === 'string' && args.markdown.trim()) blocks.push(...markdownToBlocks(args.markdown));
    if (title && !blocks.some(b => b.type === 'title')) blocks.unshift({ type: 'title', text: title });
    if (!blocks.length && !errors.length) errors.push('docx needs markdown text or blocks.');
  } else if (format === 'pptx') {
    const raw: unknown[] = Array.isArray(args.slides) ? args.slides : [];
    raw.slice(0, 500).forEach(s => {
      const o = (s ?? {}) as Record<string, unknown>;
      const slide: SlideSpec = {};
      if (typeof o.title === 'string') slide.title = o.title;
      if (typeof o.subtitle === 'string') slide.subtitle = o.subtitle;
      if (typeof o.text === 'string') slide.text = o.text;
      if (typeof o.footer === 'string') slide.footer = o.footer;
      if (typeof o.background === 'string' && /^#?[0-9a-f]{6}$/i.test(o.background)) slide.background = o.background.replace('#', '');
      if (Array.isArray(o.bullets)) slide.bullets = (o.bullets as unknown[]).map(b => (typeof b === 'string' ? b : b && typeof b === 'object' && typeof (b as { text?: unknown }).text === 'string' ? { text: String((b as { text: unknown }).text), level: Number((b as { level?: unknown }).level) || 0 } : String(b)));
      if (o.table && typeof o.table === 'object' && Array.isArray((o.table as { rows?: unknown }).rows)) slide.table = { header: Array.isArray((o.table as { header?: unknown }).header) ? ((o.table as { header: unknown[] }).header).map(String) : undefined, rows: ((o.table as { rows: unknown[] }).rows).map(r => (Array.isArray(r) ? r : [r]) as Cell[]) };
      slides.push(slide);
    });
    if (!slides.length && !errors.length) errors.push('pptx needs slides: [{ title, bullets }].');
    if (slides.length > 40 && slides.some(s => (s.bullets?.length ?? 0) > 14)) notes.push('a slide with more than 14 bullets shows only the first 14');
  }

  const base = typeof args.filename === 'string' ? args.filename.trim() : '';
  // eslint-disable-next-line no-control-regex
  if (base && (/[/\\:*?"<>|\u0000-\u001f]/.test(base) || base.startsWith('.') || base.length > 120)) errors.push('filename must be a plain file name, without folders.');
  if (errors.length) return { ok: false, errors };
  const stem = (base || title || 'document').replace(new RegExp(`\\.(${DOCUMENT_FORMATS.join('|')})$`, 'i'), '').replace(/[/\\:*?"<>|\u0000-\u001f]/g, ' ').trim().slice(0, 100) || 'document';
  return {
    ok: true,
    request: { format, filename: `${stem}.${format}`, title, sheets, blocks, slides, page: args.page === 'letter' ? 'letter' : 'a4', landscape: args.landscape === true, notes },
  };
}

export function describeDocument(r: DocumentRequest): string {
  if (r.format === 'xlsx') {
    const cells = r.sheets.reduce((n, s) => n + s.rows.reduce((m, row) => m + row.length, 0), 0);
    return `a spreadsheet of ${r.sheets.length} sheet${r.sheets.length === 1 ? '' : 's'} (${r.sheets.map(s => `${s.name}: ${s.rows.length} rows`).join(', ')}), ${cells} cells`;
  }
  if (r.format === 'docx') return `a Word document of ${r.blocks.length} block${r.blocks.length === 1 ? '' : 's'} (${r.blocks.filter(b => b.type === 'heading' || b.type === 'title').length} headings, ${r.blocks.filter(b => b.type === 'table').length} tables)`;
  return `a presentation of ${r.slides.length} slide${r.slides.length === 1 ? '' : 's'}${r.slides[0]?.title ? `, starting "${r.slides[0].title}"` : ''}`;
}

/** The file's bytes for a checked request. */
export async function makeDocumentBytes(r: DocumentRequest): Promise<Uint8Array> {
  if (r.format === 'xlsx') return xlsxBytes(r.sheets, { title: r.title });
  if (r.format === 'docx') return docxBytes(r.blocks, { title: r.title, page: r.page, landscape: r.landscape });
  return pptxBytes(r.slides, { title: r.title });
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
