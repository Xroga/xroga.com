// Text of the zip-based document formats: Word (docx), Excel (xlsx), PowerPoint (pptx), OpenDocument (odt, ods, odp) and
// EPUB. Everything runs on the device with no library: a small XML reader and the format rules written here.
// Idea: the converter list of MarkItDown and the backends of Docling (both MIT; they use Python libraries Xroga does not
// run). Written fresh; no code copied.
import type { ZipFile } from './zip-read';

export interface XNode {
  name: string; // local name, without the namespace prefix
  attrs: Record<string, string>;
  children: Array<XNode | string>;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const local = (name: string) => name.slice(name.indexOf(':') + 1);

/** A forgiving XML reader: elements, attributes, text, CDATA; comments, declarations and doctypes are skipped. */
export function parseXml(xml: string): XNode {
  const root: XNode = { name: '#root', attrs: {}, children: [] };
  const stack: XNode[] = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*(?:\[[\s\S]*?\])?>|<\/([^\s>]+)\s*>|<([^\s/>!?]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.children.push(m[1]);
    else if (m[2] !== undefined) {
      const name = local(m[2]);
      // Close up to the matching open element; a stray close tag is ignored.
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].name === name) {
          stack.length = i;
          break;
        }
      }
    } else if (m[3] !== undefined) {
      const node: XNode = { name: local(m[3]), attrs: {}, children: [] };
      const attrRe = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
      let a: RegExpExecArray | null;
      while ((a = attrRe.exec(m[4] ?? ''))) node.attrs[local(a[1])] = decodeEntities(a[2] ?? a[3] ?? a[4] ?? '');
      top.children.push(node);
      if (!m[5]) stack.push(node);
    } else if (m[6] !== undefined) top.children.push(decodeEntities(m[6]));
  }
  return root;
}

export const kids = (n: XNode | undefined, name?: string): XNode[] => (n ? (n.children.filter(c => typeof c !== 'string' && (!name || c.name === name)) as XNode[]) : []);
export const kid = (n: XNode | undefined, name: string): XNode | undefined => kids(n, name)[0];
export function textOf(n: XNode | string | undefined): string {
  if (n === undefined) return '';
  if (typeof n === 'string') return n;
  return n.children.map(textOf).join('');
}
function descendants(n: XNode, name: string, out: XNode[] = []): XNode[] {
  for (const c of n.children) {
    if (typeof c === 'string') continue;
    if (c.name === name) out.push(c);
    else descendants(c, name, out);
  }
  return out;
}

const cell = (s: string) => s.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
export function markdownTable(rows: string[][]): string {
  const width = rows.reduce((w, r) => Math.max(w, r.length), 0);
  if (!rows.length || !width) return '';
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => cell(r[i] ?? '')).join(' | ')} |`;
  return [line(rows[0]), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line)].join('\n');
}

// ---------------------------------------------------------------- docx

async function relMap(zip: ZipFile, path: string): Promise<Map<string, string>> {
  const dir = path.slice(0, path.lastIndexOf('/') + 1);
  const file = `${dir}_rels/${path.slice(path.lastIndexOf('/') + 1)}.rels`;
  const xml = await zip.text(file);
  const out = new Map<string, string>();
  if (!xml) return out;
  // The root is the first element: a real file has a newline after the declaration, which is a text child.
  for (const r of kids(kids(parseXml(xml))[0], 'Relationship')) if (r.attrs.Id) out.set(r.attrs.Id, r.attrs.Target ?? '');
  return out;
}
const resolvePath = (base: string, target: string): string => {
  if (target.startsWith('/')) return target.slice(1);
  const parts = base.slice(0, base.lastIndexOf('/') + 1).split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
};

export async function readDocx(zip: ZipFile): Promise<string> {
  const main = await zip.text('word/document.xml');
  if (!main) throw new Error('this is not a Word file (word/document.xml is missing)');
  const rels = await relMap(zip, 'word/document.xml');
  const styleNames = new Map<string, string>();
  const styles = await zip.text('word/styles.xml');
  if (styles) for (const s of descendants(parseXml(styles), 'style')) styleNames.set(s.attrs.styleId ?? '', (kid(s, 'name')?.attrs.val ?? '').toLowerCase());
  // numId -> ordered (decimal etc.) or bullet, per level
  const ordered = new Map<string, boolean>();
  const numbering = await zip.text('word/numbering.xml');
  if (numbering) {
    const abstractFmt = new Map<string, string>();
    const doc = parseXml(numbering);
    for (const a of descendants(doc, 'abstractNum')) abstractFmt.set(a.attrs.abstractNumId ?? '', kid(kids(a, 'lvl')[0], 'numFmt')?.attrs.val ?? 'bullet');
    for (const n of descendants(doc, 'num')) ordered.set(n.attrs.numId ?? '', (abstractFmt.get(kid(n, 'abstractNumId')?.attrs.val ?? '') ?? 'bullet') !== 'bullet');
  }
  const body = kid(parseXml(main).children.find(c => typeof c !== 'string') as XNode, 'body');
  const counters = new Map<string, number>();

  const runText = (n: XNode): string => {
    let out = '';
    for (const c of n.children) {
      if (typeof c === 'string') continue;
      if (c.name === 't') out += textOf(c);
      else if (c.name === 'tab') out += '\t';
      else if (c.name === 'br' || c.name === 'cr') out += '\n';
      else if (c.name === 'hyperlink') {
        const text = runText(c);
        const target = c.attrs.id ? rels.get(c.attrs.id) : undefined;
        out += target && text.trim() && /^https?:/i.test(target) ? `[${text}](${target})` : text;
      } else if (c.name === 'del' || c.name === 'delText' || c.name === 'instrText' || c.name === 'pPr' || c.name === 'rPr') continue;
      else out += runText(c);
    }
    return out;
  };
  const paragraph = (p: XNode): string => {
    const props = kid(p, 'pPr');
    const style = kid(props, 'pStyle')?.attrs.val ?? '';
    const styleName = styleNames.get(style) ?? style.toLowerCase();
    const text = runText(p).replace(/[ \t]+\n/g, '\n').trim();
    if (!text) return '';
    const heading = /^heading\s*(\d)/.exec(styleName.replace(/_/g, ' '));
    if (heading) return `${'#'.repeat(Math.min(6, Number(heading[1])))} ${text}`;
    if (styleName === 'title') return `# ${text}`;
    if (styleName === 'subtitle') return `## ${text}`;
    const num = kid(props, 'numPr');
    if (num) {
      const id = kid(num, 'numId')?.attrs.val ?? '';
      if (id === '0') return text;
      const level = Number(kid(num, 'ilvl')?.attrs.val ?? 0);
      const indent = '  '.repeat(Math.min(level, 6));
      if (ordered.get(id)) {
        const key = `${id}:${level}`;
        const next = (counters.get(key) ?? 0) + 1;
        counters.set(key, next);
        for (const k of [...counters.keys()]) if (k.startsWith(`${id}:`) && Number(k.split(':')[1]) > level) counters.delete(k);
        return `${indent}${next}. ${text}`;
      }
      return `${indent}- ${text}`;
    }
    return text;
  };
  const table = (t: XNode): string => {
    const rows = kids(t, 'tr').map(tr => kids(tr, 'tc').map(tc => kids(tc, 'p').map(p => runText(p).trim()).filter(Boolean).join(' / ')));
    return markdownTable(rows);
  };
  const out: string[] = [];
  const walk = (n: XNode) => {
    for (const c of kids(n)) {
      if (c.name === 'p') {
        const t = paragraph(c);
        if (t) out.push(t);
      } else if (c.name === 'tbl') {
        const t = table(c);
        if (t) out.push(t);
      } else if (c.name === 'sdt') walk(kid(c, 'sdtContent') ?? c);
    }
  };
  if (body) walk(body);
  // Join list lines tightly, everything else with blank lines.
  let text = '';
  out.forEach((line, i) => {
    const listy = /^\s*(?:[-]|\d+\.)\s/.test(line);
    const prevListy = i > 0 && /^\s*(?:[-]|\d+\.)\s/.test(out[i - 1]);
    text += i === 0 ? line : listy && prevListy ? `\n${line}` : `\n\n${line}`;
  });
  const notes = await zip.text('word/comments.xml');
  if (notes) {
    const comments = descendants(parseXml(notes), 'comment').map(c => `- ${c.attrs.author ?? 'someone'}: ${textOf(c).replace(/\s+/g, ' ').trim()}`).filter(l => l.length > 4);
    if (comments.length) text += `\n\n## Comments\n${comments.join('\n')}`;
  }
  return text;
}

// ---------------------------------------------------------------- xlsx

export interface SheetData {
  name: string;
  hidden: boolean;
  rows: Array<{ n: number; cells: string[] }>;
  columns: number;
  rowCount: number;
}

const BUILTIN_DATE = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);
const isDateFormat = (code: string) => {
  const stripped = code.replace(/"[^"]*"|\\.|\[[^\]]*\]/g, '');
  return /[ymdhs]/i.test(stripped) && !/^[#0.,%\s]+$/.test(stripped);
};
export function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/[^A-Za-z]/g, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
export function colName(i: number): string {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}
function serialToText(serial: number, date1904: boolean): string {
  const base = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30);
  const d = new Date(base + Math.round(serial * 86400000));
  const iso = d.toISOString();
  return serial % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
}

export async function readXlsx(zip: ZipFile, limits = { rows: 200_000 }): Promise<SheetData[]> {
  const wbXml = await zip.text('xl/workbook.xml');
  if (!wbXml) throw new Error('this is not an Excel file (xl/workbook.xml is missing)');
  const wb = parseXml(wbXml);
  const date1904 = descendants(wb, 'workbookPr').some(n => n.attrs.date1904 === '1' || n.attrs.date1904 === 'true');
  const rels = await relMap(zip, 'xl/workbook.xml');
  const shared: string[] = [];
  const ssXml = await zip.text('xl/sharedStrings.xml');
  // Phonetic runs (rPh) are not part of the text: only the direct t and r children are read.
  if (ssXml) {
    for (const si of descendants(parseXml(ssXml), 'si')) {
      let s = '';
      for (const c of kids(si)) {
        if (c.name === 't') s += textOf(c);
        else if (c.name === 'r') s += textOf(kid(c, 't'));
      }
      shared.push(s);
    }
  }
  const dateStyles = new Set<number>();
  const stXml = await zip.text('xl/styles.xml');
  if (stXml) {
    const st = parseXml(stXml);
    const custom = new Map<number, string>();
    for (const f of descendants(st, 'numFmt')) custom.set(Number(f.attrs.numFmtId), f.attrs.formatCode ?? '');
    const xfs = kids(descendants(st, 'cellXfs')[0], 'xf');
    xfs.forEach((xf, i) => {
      const id = Number(xf.attrs.numFmtId ?? 0);
      if (BUILTIN_DATE.has(id) || (custom.has(id) && isDateFormat(custom.get(id) ?? ''))) dateStyles.add(i);
    });
  }
  const sheets: SheetData[] = [];
  for (const s of descendants(wb, 'sheet')) {
    const rid = s.attrs.id;
    const target = rid ? rels.get(rid) : undefined;
    const name = s.attrs.name ?? `Sheet${sheets.length + 1}`;
    if (!target) continue;
    const path = resolvePath('xl/workbook.xml', target);
    const xml = await zip.text(path);
    if (!xml) continue;
    const data = descendants(parseXml(xml), 'sheetData')[0];
    const rows: SheetData['rows'] = [];
    let width = 0;
    let rowNo = 0;
    for (const r of kids(data, 'row')) {
      rowNo = r.attrs.r ? Number(r.attrs.r) : rowNo + 1;
      if (rows.length >= limits.rows) break;
      const cells: string[] = [];
      let col = 0;
      for (const c of kids(r, 'c')) {
        col = c.attrs.r ? colIndex(c.attrs.r) : col;
        const type = c.attrs.t ?? 'n';
        const v = textOf(kid(c, 'v'));
        let value = '';
        if (type === 's') value = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') value = textOf(kid(c, 'is'));
        else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
        else if (type === 'e') value = v;
        else if (type === 'str') value = v;
        else if (v !== '') {
          const num = Number(v);
          value = dateStyles.has(Number(c.attrs.s ?? -1)) && Number.isFinite(num) ? serialToText(num, date1904) : v;
        }
        const f = kid(c, 'f');
        if (!value && f) value = `(formula not calculated: =${textOf(f).slice(0, 80)})`;
        cells[col] = value;
        col++;
      }
      width = Math.max(width, cells.length);
      if (cells.some(x => x)) rows.push({ n: rowNo, cells: Array.from(cells, x => x ?? '') });
    }
    sheets.push({ name, hidden: s.attrs.state === 'hidden' || s.attrs.state === 'veryHidden', rows, columns: width, rowCount: rows.length });
  }
  return sheets;
}

// ---------------------------------------------------------------- pptx

export interface Slide {
  n: number;
  title: string;
  paragraphs: string[];
  tables: string[];
  notes: string;
}

function shapeParagraphs(root: XNode): { title: string; paragraphs: string[]; tables: string[] } {
  let title = '';
  const paragraphs: string[] = [];
  const tables: string[] = [];
  const para = (p: XNode) => {
    let s = '';
    for (const c of kids(p)) {
      if (c.name === 'r' || c.name === 'fld') s += textOf(kid(c, 't'));
      else if (c.name === 'br') s += '\n';
    }
    const level = Number(kid(p, 'pPr')?.attrs.lvl ?? 0);
    return { text: s.trim(), level };
  };
  const walk = (n: XNode) => {
    for (const c of kids(n)) {
      if (c.name === 'sp') {
        const ph = descendants(c, 'ph')[0];
        const isTitle = ph && /^(title|ctrTitle)$/.test(ph.attrs.type ?? '');
        const body = kid(c, 'txBody');
        const lines = kids(body, 'p').map(para).filter(p => p.text);
        if (isTitle && !title) title = lines.map(l => l.text).join(' ');
        else for (const l of lines) paragraphs.push(`${'  '.repeat(Math.min(l.level, 4))}${l.level || lines.length > 1 ? '- ' : ''}${l.text}`);
      } else if (c.name === 'tbl') {
        tables.push(markdownTable(kids(c, 'tr').map(tr => kids(tr, 'tc').map(tc => kids(kid(tc, 'txBody'), 'p').map(p => para(p).text).filter(Boolean).join(' / ')))));
      } else if (c.name === 'graphicFrame' || c.name === 'grpSp' || c.name === 'spTree' || c.name === 'cSld' || c.name === 'sld' || c.name === 'graphic' || c.name === 'graphicData') walk(c);
    }
  };
  walk(root);
  return { title, paragraphs, tables };
}

export async function readPptx(zip: ZipFile): Promise<Slide[]> {
  const pres = await zip.text('ppt/presentation.xml');
  if (!pres) throw new Error('this is not a PowerPoint file (ppt/presentation.xml is missing)');
  const rels = await relMap(zip, 'ppt/presentation.xml');
  const order = descendants(parseXml(pres), 'sldId').map(s => rels.get(s.attrs.id ?? '')).filter((x): x is string => !!x).map(t => resolvePath('ppt/presentation.xml', t));
  const slides: Slide[] = [];
  for (const [i, path] of order.entries()) {
    const xml = await zip.text(path);
    if (!xml) continue;
    const parts = shapeParagraphs(parseXml(xml));
    let notes = '';
    const slideRels = await relMap(zip, path);
    for (const target of slideRels.values()) {
      if (!/notesSlide/.test(target)) continue;
      const nx = await zip.text(resolvePath(path, target));
      if (nx) notes = shapeParagraphs(parseXml(nx)).paragraphs.filter(p => !/^\s*-?\s*\d+$/.test(p)).join(' ').replace(/\s*-\s+/g, ' ').trim();
    }
    slides.push({ n: i + 1, ...parts, notes });
  }
  return slides;
}

// ---------------------------------------------------------------- OpenDocument

export async function readOdf(zip: ZipFile): Promise<string> {
  const xml = await zip.text('content.xml');
  if (!xml) throw new Error('this is not an OpenDocument file (content.xml is missing)');
  const body = descendants(parseXml(xml), 'body')[0];
  const out: string[] = [];
  const inline = (n: XNode): string => {
    let s = '';
    for (const c of n.children) {
      if (typeof c === 'string') s += c;
      else if (c.name === 's') s += ' '.repeat(Math.min(20, Number(c.attrs.c ?? 1)));
      else if (c.name === 'tab') s += '\t';
      else if (c.name === 'line-break') s += '\n';
      else if (c.name === 'a') s += `[${inline(c)}](${c.attrs.href ?? ''})`;
      else s += inline(c);
    }
    return s;
  };
  const walk = (n: XNode, depth: number) => {
    for (const c of kids(n)) {
      if (c.name === 'h') out.push(`${'#'.repeat(Math.min(6, Number(c.attrs['outline-level'] ?? 1)))} ${inline(c).trim()}`);
      else if (c.name === 'p') {
        const t = inline(c).trim();
        if (t) out.push(depth ? `${'  '.repeat(depth - 1)}- ${t}` : t);
      } else if (c.name === 'list') walk(c, depth + 1);
      else if (c.name === 'list-item' || c.name === 'list-header') walk(c, depth);
      else if (c.name === 'table') {
        const rows: string[][] = [];
        for (const tr of descendants(c, 'table-row')) {
          const cells: string[] = [];
          for (const tc of kids(tr, 'table-cell')) {
            const rep = Math.min(Number(tc.attrs['number-columns-repeated'] ?? 1), 50);
            const text = kids(tc, 'p').map(p => inline(p).trim()).join(' / ') || tc.attrs.value || tc.attrs['string-value'] || '';
            for (let i = 0; i < rep; i++) cells.push(text);
          }
          while (cells.length && !cells[cells.length - 1]) cells.pop();
          if (cells.length) rows.push(cells);
          if (rows.length >= 5000) break;
        }
        const t = markdownTable(rows);
        if (t) out.push(`${c.attrs.name ? `## Sheet ${c.attrs.name}\n` : ''}${t}`);
      } else if (c.name === 'page') {
        out.push(`## Slide ${c.attrs.name ?? ''}`.trim());
        walk(c, depth);
      } else walk(c, depth);
    }
  };
  if (body) walk(body, 0);
  return out.join('\n\n');
}

// ---------------------------------------------------------------- html and epub

export function htmlToText(markup: string): string {
  let s = markup.replace(/\r\n/g, '\n');
  s = s.replace(/<(script|style|head|noscript)[\s\S]*?<\/\1>/gi, '');
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, n: string, t: string) => `\n\n${'#'.repeat(Number(n))} ${t.replace(/<[^>]+>/g, '').trim()}\n\n`);
  s = s.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, h: string, t: string) => {
    const text = t.replace(/<[^>]+>/g, '').trim();
    return text && /^https?:/i.test(h) ? `[${text}](${h})` : text;
  });
  s = s.replace(/<li[^>]*>/gi, '\n- ').replace(/<\/(p|div|section|article|tr|table|ul|ol|blockquote|figure)>/gi, '\n\n').replace(/<(br|hr)\s*\/?>/gi, '\n').replace(/<\/t[dh]>/gi, ' | ');
  s = s.replace(/<[^>]+>/g, '');
  return decodeEntities(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export interface Chapter {
  n: number;
  href: string;
  title: string;
  text: string;
}
export interface EpubBook {
  title: string;
  author: string;
  language: string;
  chapters: Chapter[];
}

export async function readEpub(zip: ZipFile): Promise<EpubBook> {
  const container = await zip.text('META-INF/container.xml');
  const rootPath = container ? descendants(parseXml(container), 'rootfile')[0]?.attrs['full-path'] : undefined;
  if (!rootPath) throw new Error('this is not an EPUB (META-INF/container.xml names no package file)');
  const opfText = await zip.text(rootPath);
  if (!opfText) throw new Error('the package file of the EPUB is missing');
  const opf = parseXml(opfText);
  const meta = descendants(opf, 'metadata')[0];
  const manifest = new Map<string, { href: string; type: string }>();
  for (const it of descendants(opf, 'item')) manifest.set(it.attrs.id ?? '', { href: it.attrs.href ?? '', type: it.attrs['media-type'] ?? '' });
  const chapters: Chapter[] = [];
  let n = 0;
  for (const ref of descendants(opf, 'itemref')) {
    const item = manifest.get(ref.attrs.idref ?? '');
    if (!item || !/html|xml/.test(item.type)) continue;
    const path = resolvePath(rootPath, decodeURIComponent(item.href.split('#')[0]));
    const html = await zip.text(path);
    if (!html) continue;
    const text = htmlToText(html);
    if (!text) continue;
    n++;
    const heading = /^#{1,3}\s+(.+)$/m.exec(text)?.[1] ?? text.split('\n')[0].slice(0, 80);
    chapters.push({ n, href: item.href, title: heading.slice(0, 120), text });
  }
  return { title: textOf(kid(meta, 'title')).trim(), author: textOf(kid(meta, 'creator')).trim(), language: textOf(kid(meta, 'language')).trim(), chapters };
}
