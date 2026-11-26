// A page's regions (found by Docling's layout model, Heron, Apache-2.0) plus the words on the page, put together as Markdown in reading order:
// titles and headings, paragraphs, lists, captions, formulas, code, pictures and tables, with page headers and footers left out. Only geometry is used here,
// so this file needs no browser and is tested on its own. Written fresh from the idea of Docling's layout-then-assemble pipeline.
export interface LayoutRegion {
  label: string;
  score: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** For a table: its inner structure (rows, columns, header rows, spanning cells) in page coordinates, from the table-structure model. */
  cells?: LayoutRegion[];
}
export interface LayoutItem {
  str: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
export interface AssembleResult {
  markdown: string;
  regions: number;
  tables: number;
  pictures: number;
  /** Page headers, footers and empty check boxes left out. */
  dropped: number;
  /** Words that no region contained; they are kept at the end of their nearest line group. */
  unassigned: number;
}

const area = (r: { x0: number; y0: number; x1: number; y1: number }) => Math.max(0, r.x1 - r.x0) * Math.max(0, r.y1 - r.y0);
const inter = (a: LayoutRegion, b: LayoutRegion) => area({ x0: Math.max(a.x0, b.x0), y0: Math.max(a.y0, b.y0), x1: Math.min(a.x1, b.x1), y1: Math.min(a.y1, b.y1) });
const median = (v: number[]) => (v.length ? [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]! : 0);

/** Drop a region that repeats another of the same kind, or sits inside a table, picture or form (its words belong to the outer one). */
export function cleanRegions(input: LayoutRegion[]): LayoutRegion[] {
  const sorted = [...input].sort((a, b) => b.score - a.score);
  const kept: LayoutRegion[] = [];
  for (const r of sorted) {
    const a = area(r);
    if (a <= 0) continue;
    let drop = false;
    for (const k of kept) {
      const overlap = inter(r, k);
      if (k.label === r.label && overlap / (a + area(k) - overlap) > 0.6) drop = true;
      else if (['table', 'picture', 'form', 'key_value_region', 'code'].includes(k.label) && r.label !== k.label && overlap / a > 0.8) drop = true;
    }
    if (!drop) kept.push(r);
  }
  return kept;
}

/** Words of one region in lines: top to bottom, then left to right. */
export function toLines(items: LayoutItem[]): LayoutItem[][] {
  const h = median(items.map(i => i.y1 - i.y0)) || 10;
  const sorted = [...items].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const lines: LayoutItem[][] = [];
  const centres: number[] = [];
  for (const it of sorted) {
    const c = (it.y0 + it.y1) / 2;
    const at = centres.findIndex(lc => Math.abs(lc - c) <= 0.5 * h);
    if (at >= 0) {
      lines[at]!.push(it);
      centres[at] = (centres[at]! * (lines[at]!.length - 1) + c) / lines[at]!.length;
    } else {
      lines.push([it]);
      centres.push(c);
    }
  }
  return lines.map(l => l.sort((a, b) => a.x0 - b.x0));
}

function lineText(line: LayoutItem[], h: number): string {
  let out = '';
  let prev: LayoutItem | undefined;
  for (const it of line) {
    if (prev) {
      const gap = it.x0 - prev.x1;
      if (!/\s$/.test(out) && !/^\s/.test(it.str) && gap > 0.12 * h) out += ' ';
    }
    out += it.str;
    prev = it;
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function textLines(items: LayoutItem[]): string[] {
  const h = median(items.map(i => i.y1 - i.y0)) || 10;
  return toLines(items).map(l => lineText(l, h)).filter(Boolean);
}

function paragraph(lines: string[]): string {
  let out = '';
  for (const l of lines) {
    if (!out) out = l;
    else if (/[a-z]-$/.test(out) && /^[a-z]/.test(l)) out = out.slice(0, -1) + l;
    else out += ' ' + l;
  }
  return out;
}

const esc = (s: string) => s.replace(/\|/g, '\\|');

/** A pdf.js text item (its transform, in page units) as a box on the drawn page, whatever the page rotation or scale: `view` is the viewport's own transform. */
export function itemBox(item: { str: string; transform: number[]; width?: number; height?: number }, view: number[]): (LayoutItem & { horizontal: boolean }) | undefined {
  if (!item.str.trim()) return undefined;
  const t = item.transform;
  const [m0, m1, m2, m3, m4, m5] = view as [number, number, number, number, number, number];
  const a = m0 * t[0]! + m2 * t[1]!;
  const b = m1 * t[0]! + m3 * t[1]!;
  const c = m0 * t[2]! + m2 * t[3]!;
  const d = m1 * t[2]! + m3 * t[3]!;
  const e = m0 * t[4]! + m2 * t[5]! + m4;
  const f = m1 * t[4]! + m3 * t[5]! + m5;
  const scale = Math.hypot(m0, m1) || 1;
  const size = Math.hypot(c, d) || (item.height ?? 10) * scale;
  const w = (item.width ?? 0) * scale;
  const horizontal = Math.abs(b) <= 0.2 * Math.abs(a);
  if (horizontal) {
    const x0 = a >= 0 ? e : e - w;
    return { str: item.str, x0, x1: x0 + w, y0: f - size, y1: f + 0.2 * size, horizontal };
  }
  // text running up or down the page: its box is tall and narrow
  const y0 = b >= 0 ? f : f - w;
  return { str: item.str, x0: e - size, x1: e + 0.2 * size, y0, y1: y0 + w, horizontal };
}

const shareOf = (inner: [number, number], outer: [number, number]) => Math.max(0, Math.min(inner[1], outer[1]) - Math.max(inner[0], outer[0])) / Math.max(1e-6, inner[1] - inner[0]);

/** Cells from the table-structure model's rows and columns: each word goes where its row and column cross; a spanning cell joins the cells under it. Null when the model found no usable grid. */
export function gridFromStructure(items: LayoutItem[], structure: LayoutRegion[]): string[][] | null {
  // the model also returns the whole table as a box named just "table": it is not a part of the grid, and it must not swallow the rows and columns inside it
  const clean = cleanRegions(structure.filter(s => s.score >= 0.5 && s.label.startsWith('table ')));
  const rows = clean.filter(s => s.label === 'table row').sort((a, b) => a.y0 - b.y0);
  const cols = clean.filter(s => s.label === 'table column').sort((a, b) => a.x0 - b.x0);
  if (rows.length < 2 || cols.length < 2) return null;
  const h = median(items.map(i => i.y1 - i.y0)) || 10;
  const cellItems: LayoutItem[][][] = rows.map(() => cols.map(() => []));
  const spanning = clean.filter(s => s.label === 'table spanning cell');
  const spanCells = new Map<LayoutRegion, LayoutItem[]>();
  const nearest = (list: LayoutRegion[], v: number, lo: 'y0' | 'x0', hi: 'y1' | 'x1') => {
    let best = -1;
    let dist = Infinity;
    list.forEach((r, i) => {
      const gap = v < r[lo] ? r[lo] - v : v > r[hi] ? v - r[hi] : 0;
      if (gap < dist) {
        dist = gap;
        best = i;
      }
    });
    return dist <= 1.5 * h ? best : -1;
  };
  for (const it of items) {
    const cx = (it.x0 + it.x1) / 2;
    const cy = (it.y0 + it.y1) / 2;
    const sp = spanning.find(s => cx >= s.x0 && cx <= s.x1 && cy >= s.y0 && cy <= s.y1);
    if (sp) {
      spanCells.set(sp, [...(spanCells.get(sp) ?? []), it]);
      continue;
    }
    const ri = nearest(rows, cy, 'y0', 'y1');
    const ci = nearest(cols, cx, 'x0', 'x1');
    if (ri >= 0 && ci >= 0) cellItems[ri]![ci]!.push(it);
  }
  const grid = cellItems.map(r => r.map(c => textLines(c).join(' ')));
  for (const [sp, its] of spanCells) {
    const ris = rows.flatMap((r, i) => (shareOf([r.y0, r.y1], [sp.y0, sp.y1]) > 0.5 ? [i] : []));
    const cis = cols.flatMap((c, i) => (shareOf([c.x0, c.x1], [sp.x0, sp.x1]) > 0.5 ? [i] : []));
    if (!ris.length || !cis.length) continue;
    for (const ri of ris) for (const ci of cis) grid[ri]![ci] = '';
    grid[ris[0]!]![cis[0]!] = textLines(its).join(' ');
  }
  return grid.filter(r => r.some(Boolean));
}

function gridToMarkdown(grid: string[][]): string {
  const width = Math.max(...grid.map(r => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => esc(r[i] ?? ''));
  const out = [`| ${pad(grid[0]!).join(' | ')} |`, `| ${pad(grid[0]!).map(() => '---').join(' | ')} |`];
  for (const r of grid.slice(1)) out.push(`| ${pad(r).join(' | ')} |`);
  return out.join('\n');
}

/** Cells by the empty vertical channels between the words of the rows; a line with nothing in its first cell continues the row above. Rows and columns from the structure model win when given. */
export function tableToMarkdown(items: LayoutItem[], structure?: LayoutRegion[]): string {
  if (!items.length) return '';
  const grid = structure?.length ? gridFromStructure(items, structure) : null;
  if (grid?.length) return gridToMarkdown(grid);
  const h = median(items.map(i => i.y1 - i.y0)) || 10;
  const spans = items.map(i => [i.x0, i.x1] as [number, number]).sort((a, b) => a[0] - b[0]);
  const cols: Array<[number, number]> = [];
  for (const s of spans) {
    const last = cols[cols.length - 1];
    if (last && s[0] - last[1] < 0.6 * h) last[1] = Math.max(last[1], s[1]);
    else cols.push([s[0], s[1]]);
  }
  const lines = toLines(items);
  if (cols.length < 2) return textLines(items).join('\n');
  const rows: string[][] = [];
  for (const line of lines) {
    const cells: string[] = cols.map(() => '');
    const per: LayoutItem[][] = cols.map(() => []);
    for (const it of line) {
      const c = (it.x0 + it.x1) / 2;
      let at = cols.findIndex(([a, b]) => c >= a && c <= b);
      if (at < 0) at = cols.reduce((best, [a, b], i) => (Math.abs((a + b) / 2 - c) < Math.abs((cols[best]![0] + cols[best]![1]) / 2 - c) ? i : best), 0);
      per[at]!.push(it);
    }
    per.forEach((p, i) => (cells[i] = lineText(p, h)));
    const filled = cells.filter(Boolean).length;
    const prev = rows[rows.length - 1];
    if (prev && rows.length > 1 && !cells[0] && filled <= Math.ceil(cols.length / 2)) cells.forEach((c, i) => c && (prev[i] = (prev[i] ? prev[i] + ' ' : '') + c));
    else rows.push(cells);
  }
  const out = [`| ${rows[0]!.map(esc).join(' | ')} |`, `| ${cols.map(() => '---').join(' | ')} |`];
  for (const r of rows.slice(1)) out.push(`| ${r.map(esc).join(' | ')} |`);
  return out.join('\n');
}

/** Reading order: full-width regions split the page into bands; within a band two columns are read left then right. */
export function readingOrder(regions: LayoutRegion[], pageWidth: number): LayoutRegion[] {
  const sorted = [...regions].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const out: LayoutRegion[] = [];
  let band: LayoutRegion[] = [];
  const flush = () => {
    out.push(...orderBand(band));
    band = [];
  };
  for (const r of sorted) {
    if (r.x1 - r.x0 > 0.6 * pageWidth) {
      flush();
      out.push(r);
    } else band.push(r);
  }
  flush();
  return out;
}

function orderBand(band: LayoutRegion[]): LayoutRegion[] {
  if (band.length < 2) return band;
  const mid = (Math.min(...band.map(r => r.x0)) + Math.max(...band.map(r => r.x1))) / 2;
  const left = band.filter(r => (r.x0 + r.x1) / 2 < mid);
  const right = band.filter(r => (r.x0 + r.x1) / 2 >= mid);
  const byY = (a: LayoutRegion, b: LayoutRegion) => a.y0 - b.y0 || a.x0 - b.x0;
  if (!left.length || !right.length) return [...band].sort(byY);
  const span = (rs: LayoutRegion[]) => [Math.min(...rs.map(r => r.y0)), Math.max(...rs.map(r => r.y1))] as const;
  const [l0, l1] = span(left);
  const [r0, r1] = span(right);
  const overlapping = Math.min(l1, r1) - Math.max(l0, r0) > 0;
  // two columns only when each side is clearly narrower than half the band and they run side by side
  const narrow = left.every(r => r.x1 <= mid + 0.1 * (mid - Math.min(...band.map(q => q.x0)))) && right.every(r => r.x0 >= mid - 0.1 * (Math.max(...band.map(q => q.x1)) - mid));
  if (overlapping && narrow) return [...left.sort(byY), ...right.sort(byY)];
  return [...band].sort(byY);
}

export function assembleLayout(rawRegions: LayoutRegion[], items: LayoutItem[], page: { width: number; height: number }): AssembleResult {
  const regions = cleanRegions(rawRegions);
  const members = new Map<LayoutRegion, LayoutItem[]>(regions.map(r => [r, []]));
  const leftover: LayoutItem[] = [];
  for (const it of items) {
    if (!it.str.trim()) continue;
    const cx = (it.x0 + it.x1) / 2;
    const cy = (it.y0 + it.y1) / 2;
    let best: LayoutRegion | undefined;
    for (const r of regions) if (cx >= r.x0 && cx <= r.x1 && cy >= r.y0 && cy <= r.y1 && (!best || area(r) < area(best))) best = r;
    if (best) members.get(best)!.push(it);
    else leftover.push(it);
  }
  // words outside every region: group them into text blocks of their own so nothing on the page is lost
  const h = median(items.map(i => i.y1 - i.y0)) || 10;
  const strays: LayoutRegion[] = [];
  let group: LayoutItem[] = [];
  const closeGroup = () => {
    if (!group.length) return;
    const r: LayoutRegion = { label: 'text', score: 0, x0: Math.min(...group.map(g => g.x0)), y0: Math.min(...group.map(g => g.y0)), x1: Math.max(...group.map(g => g.x1)), y1: Math.max(...group.map(g => g.y1)) };
    strays.push(r);
    members.set(r, group);
    group = [];
  };
  let lastBottom = -Infinity;
  for (const it of [...leftover].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    if (group.length && it.y0 - lastBottom > 1.5 * h) closeGroup();
    group.push(it);
    lastBottom = Math.max(lastBottom, it.y1);
  }
  closeGroup();

  const blocks: string[] = [];
  let tables = 0;
  let pictures = 0;
  let dropped = 0;
  for (const r of readingOrder([...regions, ...strays], page.width)) {
    const its = members.get(r) ?? [];
    const lines = textLines(its);
    const text = paragraph(lines);
    switch (r.label) {
      case 'page_header':
      case 'page_footer':
      case 'checkbox_selected':
      case 'checkbox_unselected':
        dropped++;
        break;
      case 'title':
        if (text) blocks.push('# ' + text);
        break;
      case 'section_header':
        if (text) blocks.push('## ' + text);
        break;
      case 'list_item':
        if (text) blocks.push((/^\d+[.)]\s/.test(text) ? '' : '- ') + text.replace(/^[•◦▪●·*–—-]\s*/, ''));
        break;
      case 'caption':
        if (text) blocks.push('*' + text + '*');
        break;
      case 'footnote':
        if (text) blocks.push('> ' + text);
        break;
      case 'formula':
        if (text) blocks.push('$$ ' + text + ' $$');
        break;
      case 'code':
        if (lines.length) blocks.push('```\n' + lines.join('\n') + '\n```');
        break;
      case 'picture': {
        pictures++;
        blocks.push(text ? `[picture with text: ${text.slice(0, 160)}]` : '[picture]');
        break;
      }
      case 'table': {
        tables++;
        const md = tableToMarkdown(its, r.cells);
        blocks.push(md || '[table with no text]');
        break;
      }
      case 'form':
      case 'key_value_region':
      case 'document_index':
        if (lines.length) blocks.push(lines.join('\n'));
        break;
      default:
        if (text) blocks.push(text);
    }
  }
  // list items that follow each other belong in one list, not separated by blank lines
  const markdown = blocks.reduce((acc, b, i) => (i === 0 ? b : acc + (/^(- |\d+[.)] )/.test(b) && /^(- |\d+[.)] )/.test(blocks[i - 1]!) ? '\n' : '\n\n') + b), '');
  return { markdown, regions: regions.length + strays.length, tables, pictures, dropped, unassigned: leftover.length };
}
