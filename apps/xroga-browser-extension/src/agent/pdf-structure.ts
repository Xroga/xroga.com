// Structure of a PDF page for read_pdf: reading order across columns, headings (from the document's own outline first, then section
// numbering, then type size), lists, paragraphs and tables, as Markdown. The order of evidence follows the heading-hierarchy stage of
// Docling (MIT: bookmarks, then numbering, then style) and its reading-order and table stages; written fresh for text items, no
// models and no code copied.

export interface PdfTextItem {
  str: string;
  x: number; // left edge
  y: number; // baseline, upwards from the bottom of the page
  w: number;
  h: number; // type size
}
export interface OutlineEntry {
  title: string;
  depth: number; // 1 is the top level
  page?: number;
}

interface Line {
  y: number;
  h: number;
  x: number; // left edge of the first item
  right: number;
  items: PdfTextItem[];
  text: string;
}

const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The size most characters are set in: the body text. */
export function bodySize(pages: PdfTextItem[][]): number {
  const weight = new Map<number, number>();
  for (const items of pages) for (const it of items) {
    const key = Math.round(it.h * 2) / 2;
    if (key > 0) weight.set(key, (weight.get(key) ?? 0) + it.str.trim().length);
  }
  let best = 10;
  let most = 0;
  for (const [size, w] of weight) if (w > most) { most = w; best = size; }
  return best;
}

function joinItems(items: PdfTextItem[]): string {
  let out = '';
  let right: number | undefined;
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    if (!it.str) continue;
    const gap = right === undefined ? 0 : it.x - right;
    if (out && !out.endsWith(' ') && !it.str.startsWith(' ') && gap > it.h * 0.15) out += ' ';
    out += it.str;
    right = it.x + it.w;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Items grouped into lines by baseline. */
function toLines(items: PdfTextItem[]): Line[] {
  const sorted = items.filter(i => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - it.y) <= Math.max(it.h, last.h) * 0.45) {
      last.items.push(it);
      last.h = Math.max(last.h, it.h);
    } else lines.push({ y: it.y, h: it.h, x: it.x, right: it.x + it.w, items: [it], text: '' });
  }
  for (const l of lines) {
    l.items.sort((a, b) => a.x - b.x);
    l.x = l.items[0]!.x;
    l.right = Math.max(...l.items.map(i => i.x + i.w));
    l.text = joinItems(l.items);
  }
  return lines;
}

/** Splits items into a left and a right column when a clear vertical gutter runs through most of the page. */
export function splitColumns(items: PdfTextItem[], pageWidth: number): PdfTextItem[][] {
  const real = items.filter(i => i.str.trim());
  if (real.length < 20 || pageWidth <= 0) return [items];
  const lo = pageWidth * 0.3;
  const hi = pageWidth * 0.7;
  const step = pageWidth / 200;
  let best: { x: number; crossings: number } | undefined;
  for (let x = lo; x <= hi; x += step) {
    let crossings = 0;
    for (const it of real) if (it.x < x && it.x + it.w > x) crossings++;
    if (!best || crossings < best.crossings) best = { x, crossings };
  }
  if (!best) return [items];
  const left = real.filter(i => i.x + i.w / 2 < best!.x).length;
  const right = real.length - left;
  // A gutter: almost nothing crosses it and both sides hold real text.
  if (best.crossings > real.length * 0.03 || left < real.length * 0.25 || right < real.length * 0.25) return [items];
  const l = real.filter(i => i.x + i.w / 2 < best!.x);
  const r = real.filter(i => i.x + i.w / 2 >= best!.x);
  return [l, r];
}

const BULLET = /^(?:[•●▪■◦○▫–—*·-]|\(?\d{1,3}[.)]|\(?[a-z][.)])\s+/;
const NUMBERED = /^(\d{1,2}(?:\.\d{1,2}){0,3})\.?\s+(\S.*)$/;

function headingLevelByNumber(text: string): number | undefined {
  const m = NUMBERED.exec(text);
  if (!m || text.length > 100 || /[.!?]$/.test(text)) return undefined;
  if (!/^[A-Z(]/.test(m[2]!)) return undefined;
  return Math.min(4, m[1]!.split('.').length);
}

interface Block {
  kind: 'heading' | 'list' | 'paragraph' | 'table';
  level?: number;
  text: string;
  rows?: string[][];
}

function cellsOf(line: Line): { x: number; text: string }[] {
  const cells: { x: number; text: string }[] = [];
  let current: PdfTextItem[] = [];
  let right: number | undefined;
  const flush = () => {
    if (current.length) cells.push({ x: current[0]!.x, text: joinItems(current) });
    current = [];
  };
  for (const it of line.items) {
    if (right !== undefined && it.x - right > line.h * 1.4) flush();
    current.push(it);
    right = it.x + it.w;
  }
  flush();
  return cells;
}

/** The page as Markdown. `outline` is the document's own table of contents, when it has one. */
export function structurePage(items: PdfTextItem[], pageWidth: number, context: { body: number; sizes: number[]; outline?: OutlineEntry[]; page?: number }): string {
  const columns = splitColumns(items, pageWidth);
  const blocks: Block[] = [];
  const outline = new Map<string, number>();
  for (const o of context.outline ?? []) if (!o.page || o.page === context.page) outline.set(norm(o.title), o.depth);
  const headingSizes = [...new Set(context.sizes.filter(s => s >= context.body * 1.15).map(s => Math.round(s * 2) / 2))].sort((a, b) => b - a).slice(0, 4);

  for (const col of columns) {
    const lines = toLines(col);
    // Tables first: consecutive lines of several aligned cells.
    let i = 0;
    let paragraph: Line[] = [];
    const flushParagraph = () => {
      if (!paragraph.length) return;
      let text = '';
      for (const l of paragraph) {
        if (text.endsWith('-') && /^[a-z]/.test(l.text)) text = text.slice(0, -1) + l.text;
        else text += (text ? ' ' : '') + l.text;
      }
      blocks.push({ kind: 'paragraph', text });
      paragraph = [];
    };
    while (i < lines.length) {
      const line = lines[i]!;
      const cells = cellsOf(line);
      if (cells.length >= 2) {
        let j = i;
        const rows: string[][] = [];
        while (j < lines.length) {
          const c = cellsOf(lines[j]!);
          if (c.length < 2 || Math.abs(c.length - cells.length) > 1 || Math.abs(c[0]!.x - cells[0]!.x) > line.h * 0.8) break;
          rows.push(c.map(x => x.text));
          j++;
        }
        if (rows.length >= 3) {
          flushParagraph();
          blocks.push({ kind: 'table', text: '', rows });
          i = j;
          continue;
        }
      }
      const size = Math.round(line.h * 2) / 2;
      const key = norm(line.text);
      let level: number | undefined = outline.get(key);
      if (level === undefined && size > context.body * 1.15 && headingSizes.includes(size) && line.text.length < 140 && !/[.!?]$/.test(line.text)) level = headingSizes.indexOf(size) + 1;
      if (level === undefined) {
        const byNumber = headingLevelByNumber(line.text);
        if (byNumber !== undefined && line.h >= context.body * 0.95 && line.text.split(' ').length <= 12) level = byNumber;
      }
      if (level !== undefined) {
        flushParagraph();
        blocks.push({ kind: 'heading', level: Math.min(6, level), text: line.text });
      } else if (BULLET.test(line.text) && line.text.length > 2) {
        flushParagraph();
        blocks.push({ kind: 'list', text: line.text.replace(BULLET, '') });
      } else {
        const prev = lines[i - 1];
        const gap = prev ? prev.y - line.y : 0;
        if (paragraph.length && gap > line.h * 1.9) flushParagraph();
        const last = blocks[blocks.length - 1];
        // A wrapped line of a list item continues that item.
        if (!paragraph.length && last?.kind === 'list' && prev && gap <= line.h * 1.6 && line.x > prev.x - 1) last.text += ` ${line.text}`;
        else paragraph.push(line);
      }
      i++;
    }
    flushParagraph();
  }

  const out: string[] = [];
  for (const b of blocks) {
    if (b.kind === 'heading') out.push(`${'#'.repeat(b.level ?? 1)} ${b.text}`);
    else if (b.kind === 'list') out.push(`- ${b.text}`);
    else if (b.kind === 'table' && b.rows) {
      const width = Math.max(...b.rows.map(r => r.length));
      const row = (r: string[]) => `| ${Array.from({ length: width }, (_, k) => (r[k] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
      out.push([row(b.rows[0]!), `|${' --- |'.repeat(width)}`, ...b.rows.slice(1).map(row)].join('\n'));
    } else out.push(b.text);
  }
  // Lists stay tight, everything else is separated by a blank line.
  let text = '';
  out.forEach((block, i) => {
    const listy = block.startsWith('- ');
    const prevListy = i > 0 && out[i - 1]!.startsWith('- ');
    text += i === 0 ? block : listy && prevListy ? `\n${block}` : `\n\n${block}`;
  });
  return text;
}

