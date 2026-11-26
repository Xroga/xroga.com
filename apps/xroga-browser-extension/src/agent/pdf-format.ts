// `read_pdf`: the text of a PDF, page by page, read on the device (pdf.js), and a page that is only a picture is read with the on-device text recognition. The outline of a tab that
// shows a PDF is empty (the viewer is a plugin), so without this a model cannot read a report, an invoice, a statement or a paper at all. Idea: the PDF skill of anthropics/skills
// (Apache-2.0; it relies on Python libraries Xroga does not run) and the page-by-page reading of MarkItDown and Docling (MIT, batch 4 to read); written fresh.
import type { AgentTool } from './tools';

export const READ_PDF_TOOL: AgentTool = {
  name: 'read_pdf',
  source: 'agent',
  group: 'reading',
  description:
    'Read the text of a PDF: the one open in the tab (default) or a public address. pages like "1-3,7" reads only those (default the first 5); find returns only the lines that contain that text, with their page; ocr true reads pages as pictures (for scans); structure true returns headings, lists, tables and columns in reading order as Markdown, with its outline. Pages with no text are read as pictures automatically. Read-only; nothing leaves the browser.',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', maxLength: 2000 },
      pages: { type: 'string', maxLength: 60 },
      find: { type: 'string', maxLength: 120 },
      ocr: { type: 'boolean' },
      structure: { type: 'boolean' },
      language: { type: 'string', enum: ['english', 'arabic', 'urdu', 'hindi', 'spanish', 'french', 'german', 'portuguese', 'russian', 'chinese'] },
      tabId: { type: 'number' },
    },
    additionalProperties: false,
  },
};

export interface PdfPageText {
  page: number;
  text: string;
  source: 'text' | 'picture';
}
export interface PdfResult {
  pageCount: number;
  title?: string;
  pages: PdfPageText[];
  /** The document's own table of contents, when it has one and structure was asked for. */
  outline?: Array<{ title: string; depth: number; page?: number }>;
}

/** "1-3,7" as page numbers within 1..count, in order, without repeats. Empty or unreadable gives the first `fallback` pages. */
export function parsePages(spec: string | undefined, count: number, fallback = 5): number[] {
  const out: number[] = [];
  for (const part of String(spec ?? '').split(',')) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let p = Math.max(1, Math.min(a, b)); p <= Math.min(count, Math.max(a, b)); p++) if (!out.includes(p)) out.push(p);
  }
  if (out.length) return out.slice(0, 200);
  return Array.from({ length: Math.min(count, fallback) }, (_, i) => i + 1);
}

const MAX_CHARS = 24_000;
const NL = String.fromCharCode(10);

/** The pages as text for the model, cut at a size with the next pages named; `find` keeps only matching lines. */
export function describePdf(result: PdfResult, options: { find?: string; requested?: number[] } = {}): string {
  const head = `read_pdf: ${result.pageCount} page${result.pageCount === 1 ? '' : 's'}${result.title ? `, “${result.title.slice(0, 80)}”` : ''}.`;
  const want = options.find?.trim().toLowerCase();
  if (want) {
    const hits: string[] = [];
    for (const p of result.pages) for (const line of p.text.split(NL)) if (line.toLowerCase().includes(want)) hits.push(`p${p.page}: ${line.trim().slice(0, 240)}`);
    return hits.length ? `${head} ${hits.length} line${hits.length === 1 ? '' : 's'} contain "${options.find}" (in pages ${[...new Set(result.pages.map(p => p.page))].join(', ')}):${NL}${hits.slice(0, 80).join(NL)}` : `${head} No line of the pages read contains "${options.find}". Read other pages with pages, or without find to see the text.`;
  }
  let used = 0;
  const parts: string[] = [];
  let stopped: number | undefined;
  for (const p of result.pages) {
    const body = p.text.trim() || '(no text on this page)';
    if (used + body.length > MAX_CHARS && parts.length) {
      stopped = p.page;
      break;
    }
    used += body.length;
    parts.push(`--- page ${p.page}${p.source === 'picture' ? ' (read from a picture: check numbers and names)' : ''} ---${NL}${body.slice(0, MAX_CHARS)}`);
  }
  const lastRead = result.pages[result.pages.length - 1]?.page ?? 0;
  const more = stopped ? ` Stopped before page ${stopped}: read on with pages "${stopped}-${Math.min(result.pageCount, stopped + 4)}".` : lastRead < result.pageCount ? ` Pages ${lastRead + 1} to ${result.pageCount} are not read yet: use pages "${lastRead + 1}-${Math.min(result.pageCount, lastRead + 5)}".` : '';
  const toc = result.outline?.length ? `${NL}Outline:${NL}${result.outline.slice(0, 60).map(o => `${'  '.repeat(o.depth - 1)}- ${o.title}${o.page ? ` (p${o.page})` : ''}`).join(NL)}${NL}` : '';
  return `${head}${more}${toc}${NL}${parts.join(NL)}`;
}

/** The address of the PDF a page outline says the tab shows (its header line names the address, then the viewport), or undefined. */
export function pdfAddressIn(outline: string): string | undefined {
  return /(https?:\/\/\S+?\.pdf)(?:[?#]\S*)?\s+·\s+viewport/i.exec(outline)?.[1];
}
