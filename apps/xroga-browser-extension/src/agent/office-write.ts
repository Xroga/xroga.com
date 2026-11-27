// Writing real Office files on the device: a spreadsheet (.xlsx), a Word document (.docx) and a presentation (.pptx), built as the XML parts the formats define and packed by zip-write.ts.
// The reading side (office-read.ts) already exists; this is its other half. The idea (a model describes the document as data, the host writes the file: sheets of rows, blocks of text and
// tables) comes from the document tool of qz-browser-agent (Apache-2.0); the writers are written fresh against the ECMA-376 part names and checked by opening the results with independent
// libraries in the tests' companion script.
import { buildZip, deflateRaw, type ZipEntry } from './zip-write';

const xmlEscape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '');
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// ---------------------------------------------------------------------------------------------------------------------------------
// spreadsheet

export type Cell = string | number | boolean | null | undefined;
export interface SheetSpec {
  name: string;
  /** A header row, shown bold with a fill, kept in view when scrolling (freeze) and filterable. */
  columns?: string[];
  rows: Cell[][];
  /** Width of each column in characters; by default from the longest value. */
  widths?: number[];
  /** Number format by column index (0-based): "0.00", "#,##0", "0%", "date", "datetime", "currency". */
  formats?: Record<number, string>;
  /** Strings starting with = are formulas (default false: the text is kept as text). */
  formulas?: boolean;
  freeze?: boolean;
  filter?: boolean;
}

export const colName = (i: number): string => {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** A sheet name Excel accepts: at most 31 characters, none of []:*?/\, not empty, unique among the sheets. */
export function sheetNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((raw, i) => {
    let base = String(raw ?? '').replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || `Sheet${i + 1}`;
    let name = base;
    let k = 2;
    while (used.has(name.toLowerCase())) {
      const tail = ` ${k++}`;
      name = base.slice(0, 31 - tail.length) + tail;
    }
    used.add(name.toLowerCase());
    base = name;
    return name;
  });
}

/** Days since 1899-12-30 for an ISO date or date-time (Excel's serial number), or null when the text is no date. */
export function excelSerial(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?(?:Z|[+-]\d{2}:?\d{2})?$/.exec(text.trim());
  if (!m) return null;
  const ms = Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  if (!Number.isFinite(ms)) return null;
  return ms / 86400000 + 25569;
}

const FORMAT_IDS: Record<string, number> = { date: 2, datetime: 3, percent: 4, currency: 5, integer: 6, decimal: 7 };
const CUSTOM_FORMATS: Record<string, string> = { date: 'yyyy-mm-dd', datetime: 'yyyy-mm-dd hh:mm', percent: '0%', currency: '#,##0.00', integer: '#,##0', decimal: '0.00' };

function styleFor(format: string | undefined, formats: string[]): number {
  if (!format) return 0;
  const key = format === '0%' ? 'percent' : format === '#,##0.00' ? 'currency' : format === '#,##0' ? 'integer' : format === '0.00' ? 'decimal' : format;
  if (FORMAT_IDS[key]) return FORMAT_IDS[key]!;
  // a custom code: kept in a list, styles after the six built-in ones
  let at = formats.indexOf(format);
  if (at < 0) {
    formats.push(format);
    at = formats.length - 1;
  }
  return 8 + at;
}

function sheetXml(sheet: SheetSpec, customFormats: string[]): string {
  const header = sheet.columns && sheet.columns.length ? [sheet.columns as Cell[]] : [];
  const all: Cell[][] = [...header, ...sheet.rows];
  const cols = Math.max(0, ...all.map(r => r.length));
  const widths: number[] = [];
  for (let c = 0; c < cols; c++) {
    const given = sheet.widths?.[c];
    if (typeof given === 'number' && given > 0) widths.push(Math.min(255, given));
    else {
      let w = 8;
      for (const row of all.slice(0, 500)) w = Math.max(w, Math.min(60, String(row[c] ?? '').length + 2));
      widths.push(w);
    }
  }
  const out: string[] = [XML, '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'];
  const freeze = sheet.freeze ?? header.length > 0;
  out.push(`<sheetViews><sheetView workbookViewId="0">${freeze && header.length ? '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/>' : ''}</sheetView></sheetViews>`);
  out.push('<sheetFormatPr defaultRowHeight="15"/>');
  if (cols) out.push('<cols>' + widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>');
  out.push('<sheetData>');
  all.forEach((row, ri) => {
    const isHeader = header.length > 0 && ri === 0;
    const cells: string[] = [];
    row.forEach((v, ci) => {
      if (v === null || v === undefined || v === '') return;
      const ref = `${colName(ci)}${ri + 1}`;
      const fmt = isHeader ? undefined : sheet.formats?.[ci];
      if (typeof v === 'number') {
        if (!Number.isFinite(v)) return;
        const s = isHeader ? 1 : styleFor(fmt, customFormats);
        cells.push(`<c r="${ref}"${s ? ` s="${s}"` : ''}><v>${v}</v></c>`);
      } else if (typeof v === 'boolean') {
        cells.push(`<c r="${ref}" t="b"><v>${v ? 1 : 0}</v></c>`);
      } else {
        const text = String(v);
        if (!isHeader && sheet.formulas && text.startsWith('=')) {
          cells.push(`<c r="${ref}"${styleFor(fmt, customFormats) ? ` s="${styleFor(fmt, customFormats)}"` : ''}><f>${xmlEscape(text.slice(1))}</f></c>`);
          return;
        }
        const serial = !isHeader && (fmt === 'date' || fmt === 'datetime' || /^\d{4}-\d{2}-\d{2}/.test(text)) ? excelSerial(text) : null;
        if (serial !== null) {
          const style = fmt === 'datetime' || /[T ]\d{2}:\d{2}/.test(text) ? 3 : 2;
          cells.push(`<c r="${ref}" s="${style}"><v>${serial}</v></c>`);
        } else cells.push(`<c r="${ref}"${isHeader ? ' s="1"' : ''} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(text)}</t></is></c>`);
      }
    });
    out.push(`<row r="${ri + 1}">${cells.join('')}</row>`);
  });
  out.push('</sheetData>');
  if (sheet.filter ?? (header.length > 0 && sheet.rows.length > 0)) out.push(`<autoFilter ref="A1:${colName(Math.max(0, cols - 1))}${all.length}"/>`);
  out.push('<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>');
  out.push('</worksheet>');
  return out.join('');
}

function stylesXml(custom: string[]): string {
  const numFmts = [...custom.map((c, i) => `<numFmt numFmtId="${200 + i}" formatCode="${xmlEscape(c)}"/>`)];
  const builtIn = Object.entries(CUSTOM_FORMATS).map(([k, code]) => `<numFmt numFmtId="${100 + (FORMAT_IDS[k] ?? 0)}" formatCode="${xmlEscape(code)}"/>`);
  // the cell formats: 0 plain, 1 header, 2 date, 3 date-time, 4 percent, 5 currency, 6 integer, 7 decimal, then custom ones
  const xf = (id: number, extra = '') => `<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0"${id ? ' applyNumberFormat="1"' : ''}${extra}/>`;
  const cellXfs = [
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
    xf(100 + 2),
    xf(100 + 3),
    xf(100 + 4),
    xf(100 + 5),
    xf(100 + 6),
    xf(100 + 7),
    ...custom.map((_, i) => xf(200 + i)),
  ];
  return `${XML}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="${builtIn.length + numFmts.length}">${builtIn.join('')}${numFmts.join('')}</numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7EEF7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${cellXfs.length}">${cellXfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

export async function xlsxBytes(sheetsIn: readonly SheetSpec[], options: { title?: string } = {}): Promise<Uint8Array> {
  if (!sheetsIn.length) throw new Error('a workbook needs at least one sheet');
  const names = sheetNames(sheetsIn.map(s => s.name));
  const custom: string[] = [];
  const sheetFiles = sheetsIn.map(s => sheetXml(s, custom));
  const entries: ZipEntry[] = [
    {
      name: '[Content_Types].xml',
      data: enc(`${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheetFiles.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`),
    },
    { name: '_rels/.rels', data: enc(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`) },
    { name: 'docProps/core.xml', data: enc(coreXml(options.title)) },
    { name: 'xl/workbook.xml', data: enc(`${XML}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) },
    { name: 'xl/_rels/workbook.xml.rels', data: enc(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { name: 'xl/styles.xml', data: enc(stylesXml(custom)) },
    ...sheetFiles.map((xml, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: enc(xml) })),
  ];
  return buildZip(entries, { deflate: deflateRaw });
}

function coreXml(title?: string): string {
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  return `${XML}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xmlEscape(title ?? '')}</dc:title><dc:creator>Xroga</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Word document

export interface Run {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  code?: boolean;
  color?: string;
  link?: string;
}
export type Block =
  | { type: 'title'; text: string }
  | { type: 'heading'; text: string; level?: number }
  | { type: 'paragraph'; text?: string; runs?: Run[]; align?: 'left' | 'center' | 'right' | 'justify' }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: string[] }
  | { type: 'table'; header?: string[]; rows: Cell[][]; widths?: number[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'pageBreak' };

/** **bold**, *italic*, `code` and [text](https://address) inside a string become runs, so a model can write plain markdown. Nothing else is interpreted. */
export function inlineRuns(text: string): Run[] {
  const runs: Run[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*\s][^*]*)\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index) });
    if (m[2] !== undefined) runs.push({ text: m[2], bold: true });
    else if (m[4] !== undefined) runs.push({ text: m[4], italic: true });
    else if (m[6] !== undefined) runs.push({ text: m[6], code: true });
    else runs.push({ text: m[8]!, link: m[9]! });
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last) });
  return runs.length ? runs : [{ text }];
}

class Rels {
  items: Array<{ id: string; target: string }> = [];
  link(target: string): string {
    const found = this.items.find(i => i.target === target);
    if (found) return found.id;
    const id = `rIdL${this.items.length + 1}`;
    this.items.push({ id, target });
    return id;
  }
}

function runXml(r: Run, rels: Rels, base: string = ''): string {
  const props = [
    base,
    r.link ? '<w:rStyle w:val="Hyperlink"/>' : '',
    r.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/>' : '',
    r.bold ? '<w:b/>' : '',
    r.italic ? '<w:i/>' : '',
    r.underline ? '<w:u w:val="single"/>' : '',
    r.color && /^#?[0-9a-f]{6}$/i.test(r.color) ? `<w:color w:val="${r.color.replace('#', '').toUpperCase()}"/>` : '',
  ].join('');
  const body = `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${xmlEscape(r.text)}</w:t></w:r>`;
  return r.link ? `<w:hyperlink r:id="${rels.link(r.link)}">${body}</w:hyperlink>` : body;
}

function paragraph(runs: Run[], rels: Rels, pPr = '', base = ''): string {
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runs.map(r => runXml(r, rels, base)).join('')}</w:p>`;
}

function tableXml(block: Extract<Block, { type: 'table' }>, rels: Rels): string {
  const cols = Math.max(block.header?.length ?? 0, ...block.rows.map(r => r.length), 1);
  const total = 9000;
  const widths = block.widths && block.widths.length === cols ? block.widths : Array(cols).fill(1);
  const sum = widths.reduce((a, b) => a + b, 0) || cols;
  const grid = widths.map(w => Math.round((w / sum) * total));
  const cell = (v: Cell, i: number, header: boolean) =>
    `<w:tc><w:tcPr><w:tcW w:w="${grid[i] ?? 1000}" w:type="dxa"/>${header ? '<w:shd w:val="clear" w:color="auto" w:fill="E7EEF7"/>' : ''}</w:tcPr>${paragraph(inlineRuns(v === null || v === undefined ? '' : String(v)), rels, '<w:spacing w:before="40" w:after="40"/>', header ? '<w:b/>' : '')}</w:tc>`;
  const row = (cells: Cell[], header: boolean) => `<w:tr>${header ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${Array.from({ length: cols }, (_, i) => cell(cells[i], i, header)).join('')}</w:tr>`;
  const borders = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(b => `<w:${b} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:tblBorders>${borders}</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>${grid.map(g => `<w:gridCol w:w="${g}"/>`).join('')}</w:tblGrid>${block.header ? row(block.header, true) : ''}${block.rows.map(r => row(r, false)).join('')}</w:tbl><w:p/>`;
}

export function docxBody(blocks: readonly Block[], rels: Rels): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (b.type === 'title') out.push(paragraph(inlineRuns(b.text), rels, '<w:pStyle w:val="Title"/>'));
    else if (b.type === 'heading') out.push(paragraph(inlineRuns(b.text), rels, `<w:pStyle w:val="Heading${Math.min(6, Math.max(1, Math.round(b.level ?? 1)))}"/>`));
    else if (b.type === 'paragraph') {
      const runs = b.runs && b.runs.length ? b.runs : inlineRuns(b.text ?? '');
      out.push(paragraph(runs, rels, b.align ? `<w:jc w:val="${b.align === 'justify' ? 'both' : b.align}"/>` : ''));
    } else if (b.type === 'bullets') for (const item of b.items) out.push(paragraph(inlineRuns(item), rels, '<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'));
    else if (b.type === 'numbered') for (const item of b.items) out.push(paragraph(inlineRuns(item), rels, '<w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>'));
    else if (b.type === 'table') out.push(tableXml(b, rels));
    else if (b.type === 'quote') out.push(paragraph(inlineRuns(b.text), rels, '<w:pStyle w:val="Quote"/>'));
    else if (b.type === 'code') for (const line of b.text.split('\n')) out.push(paragraph([{ text: line, code: true }], rels, '<w:pStyle w:val="Code"/>'));
    else if (b.type === 'pageBreak') out.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>');
  }
  return out.join('');
}

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

function stylesDocx(): string {
  const heading = (n: number, size: number, color: string) => `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="${n === 1 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr><w:rPr><w:b/><w:color w:val="${color}"/><w:sz w:val="${size}"/></w:rPr></w:style>`;
  return `${XML}<w:styles ${W_NS}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-US"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style><w:style w:type="character" w:default="1" w:styleId="DefaultParagraphFont"><w:name w:val="Default Paragraph Font"/><w:uiPriority w:val="1"/><w:semiHidden/></w:style><w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:uiPriority w:val="99"/><w:semiHidden/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="48"/><w:color w:val="1F3864"/></w:rPr></w:style>${heading(1, 34, '1F3864')}${heading(2, 28, '2F5496')}${heading(3, 24, '2F5496')}${heading(4, 22, '404040')}${heading(5, 22, '404040')}${heading(6, 22, '595959')}<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:after="60"/><w:ind w:left="720"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:pBdr><w:left w:val="single" w:sz="18" w:space="8" w:color="BFBFBF"/></w:pBdr><w:ind w:left="360"/></w:pPr><w:rPr><w:i/><w:color w:val="595959"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/><w:spacing w:after="0"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="20"/></w:rPr></w:style><w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style></w:styles>`;
}

function numberingDocx(): string {
  const level = (fmt: string, text: string, font?: string) => `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${fmt}"/><w:lvlText w:val="${text}"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>${font ? `<w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:hint="default"/></w:rPr>` : ''}</w:lvl>`;
  return `${XML}<w:numbering ${W_NS}><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="hybridMultilevel"/>${level('bullet', '•', 'Calibri')}</w:abstractNum><w:abstractNum w:abstractNumId="2"><w:multiLevelType w:val="hybridMultilevel"/>${level('decimal', '%1.')}</w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="2"/></w:num></w:numbering>`;
}

export async function docxBytes(blocks: readonly Block[], options: { title?: string; page?: 'a4' | 'letter'; landscape?: boolean } = {}): Promise<Uint8Array> {
  const rels = new Rels();
  const body = docxBody(blocks, rels);
  const [w, h] = options.page === 'letter' ? [12240, 15840] : [11906, 16838];
  const size = options.landscape ? `<w:pgSz w:w="${h}" w:h="${w}" w:orient="landscape"/>` : `<w:pgSz w:w="${w}" w:h="${h}"/>`;
  const sect = `<w:sectPr>${size}<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>`;
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc(`${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`) },
    { name: '_rels/.rels', data: enc(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`) },
    { name: 'docProps/core.xml', data: enc(coreXml(options.title)) },
    { name: 'word/document.xml', data: enc(`${XML}<w:document ${W_NS}><w:body>${body}${sect}</w:body></w:document>`) },
    { name: 'word/styles.xml', data: enc(stylesDocx()) },
    { name: 'word/numbering.xml', data: enc(numberingDocx()) },
    {
      name: 'word/_rels/document.xml.rels',
      data: enc(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdN" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>${rels.items.map(i => `<Relationship Id="${i.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${xmlEscape(i.target)}" TargetMode="External"/>`).join('')}</Relationships>`),
    },
  ];
  return buildZip(entries, { deflate: deflateRaw });
}

// ---------------------------------------------------------------------------------------------------------------------------------
// presentation

export interface SlideSpec {
  title?: string;
  subtitle?: string;
  /** Bullets; an item may be { text, level } for a nested one. */
  bullets?: Array<string | { text: string; level?: number }>;
  text?: string;
  table?: { header?: string[]; rows: Cell[][] };
  /** A short line at the foot (a source, a date). */
  footer?: string;
  /** A background colour (6 hex digits) for a title or section slide. */
  background?: string;
}

const EMU = 12700;
const SW = 12192000;
const SH = 6858000;

function textBox(id: number, name: string, x: number, y: number, w: number, h: number, paras: string, anchor = 't'): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${xmlEscape(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="${anchor}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
}
const para = (text: string, size: number, opts: { bold?: boolean; color?: string; bullet?: boolean; level?: number; align?: string } = {}): string => {
  const ppr = opts.bullet ? `<a:pPr marL="${342900 + (opts.level ?? 0) * 342900}" indent="-285750"${opts.align ? ` algn="${opts.align}"` : ''}><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/></a:pPr>` : `<a:pPr${opts.align ? ` algn="${opts.align}"` : ''}><a:buNone/></a:pPr>`;
  return `<a:p>${ppr}<a:r><a:rPr lang="en-US" sz="${size * 100}"${opts.bold ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${opts.color ?? '262626'}"/></a:solidFill></a:rPr><a:t>${xmlEscape(text)}</a:t></a:r></a:p>`;
};

function tableFrame(id: number, x: number, y: number, w: number, table: { header?: string[]; rows: Cell[][] }): string {
  const cols = Math.max(table.header?.length ?? 0, ...table.rows.map(r => r.length), 1);
  const colW = Math.floor(w / cols);
  const rowH = 370840;
  const cell = (v: Cell, header: boolean) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1400"${header ? ' b="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${header ? 'FFFFFF' : '262626'}"/></a:solidFill></a:rPr><a:t>${xmlEscape(v === null || v === undefined ? '' : String(v))}</a:t></a:r></a:p></a:txBody><a:tcPr><a:lnL w="6350"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:lnL><a:lnR w="6350"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:lnR><a:lnT w="6350"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:lnT><a:lnB w="6350"><a:solidFill><a:srgbClr val="BFBFBF"/></a:solidFill></a:lnB><a:solidFill><a:srgbClr val="${header ? '2F5496' : 'FFFFFF'}"/></a:solidFill></a:tcPr></a:tc>`;
  const row = (cells: Cell[], header: boolean) => `<a:tr h="${rowH}">${Array.from({ length: cols }, (_, i) => cell(cells[i], header)).join('')}</a:tr>`;
  const rows = [...(table.header ? [row(table.header, true)] : []), ...table.rows.slice(0, 40).map(r => row(r, false))];
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr><p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${colW * cols}" cy="${rowH * rows.length}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="1" bandRow="1"/><a:tblGrid>${Array.from({ length: cols }, () => `<a:gridCol w="${colW}"/>`).join('')}</a:tblGrid>${rows.join('')}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

export function slideXml(slide: SlideSpec, index: number): string {
  const shapes: string[] = [];
  let id = 2;
  const dark = !!slide.background && /^[0-9a-f]{6}$/i.test(slide.background);
  const ink = dark ? 'FFFFFF' : '262626';
  const titleOnly = !slide.bullets?.length && !slide.text && !slide.table;
  if (slide.title) {
    if (titleOnly && index === 0) {
      shapes.push(textBox(id++, 'Title', 914400, 2100000, SW - 1828800, 1500000, para(slide.title, 44, { bold: true, color: ink, align: 'l' }), 'b'));
      if (slide.subtitle) shapes.push(textBox(id++, 'Subtitle', 914400, 3700000, SW - 1828800, 1000000, para(slide.subtitle, 22, { color: dark ? 'D9D9D9' : '595959' })));
    } else {
      shapes.push(textBox(id++, 'Title', 609600, 365760, SW - 1219200, 900000, para(slide.title, 32, { bold: true, color: dark ? ink : '1F3864' }), 'ctr'));
      if (slide.subtitle) shapes.push(textBox(id++, 'Subtitle', 609600, 1190000, SW - 1219200, 500000, para(slide.subtitle, 18, { color: dark ? 'D9D9D9' : '595959' })));
    }
  }
  const top = slide.subtitle ? 1800000 : 1400000;
  if (slide.bullets?.length) {
    const paras = slide.bullets.slice(0, 14).map(b => (typeof b === 'string' ? para(b, 22, { bullet: true, color: ink }) : para(b.text, b.level ? 18 : 22, { bullet: true, level: Math.min(4, Math.max(0, b.level ?? 0)), color: ink }))).join('');
    shapes.push(textBox(id++, 'Body', 609600, top, SW - 1219200, SH - top - 700000, paras));
  } else if (slide.text) {
    shapes.push(textBox(id++, 'Body', 609600, top, SW - 1219200, SH - top - 700000, slide.text.split('\n').map(l => para(l, 20, { color: ink })).join('')));
  }
  if (slide.table) shapes.push(tableFrame(id++, 609600, top, SW - 1219200, slide.table));
  if (slide.footer) shapes.push(textBox(id++, 'Footer', 609600, SH - 560000, SW - 1219200, 380000, para(slide.footer, 12, { color: dark ? 'BFBFBF' : '7F7F7F' })));
  const bg = dark ? `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${slide.background!.toUpperCase()}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` : '';
  return `${XML}<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld>${bg}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapes.join('')}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

const THEME = `${XML}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Xroga"><a:themeElements><a:clrScheme name="Xroga"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="1F3864"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="2F5496"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Xroga"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Xroga"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`;

export async function pptxBytes(slides: readonly SlideSpec[], options: { title?: string } = {}): Promise<Uint8Array> {
  if (!slides.length) throw new Error('a presentation needs at least one slide');
  const n = slides.length;
  const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
  const group = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: enc(`${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`) },
    { name: '_rels/.rels', data: enc(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`) },
    { name: 'docProps/core.xml', data: enc(coreXml(options.title)) },
    { name: 'ppt/presentation.xml', data: enc(`${XML}<p:presentation ${NS}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${SW}" cy="${SH}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`) },
    { name: 'ppt/_rels/presentation.xml.rels', data: enc(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slides.map((_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>`) },
    { name: 'ppt/slideMasters/slideMaster1.xml', data: enc(`${XML}<p:sldMaster ${NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>${group}</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="3200"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1800"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>`) },
    { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', data: enc(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`) },
    { name: 'ppt/slideLayouts/slideLayout1.xml', data: enc(`${XML}<p:sldLayout ${NS} type="blank" preserve="1"><p:cSld name="Blank">${group}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`) },
    { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', data: enc(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`) },
    { name: 'ppt/theme/theme1.xml', data: enc(THEME) },
    ...slides.flatMap((s, i) => [
      { name: `ppt/slides/slide${i + 1}.xml`, data: enc(slideXml(s, i)) },
      { name: `ppt/slides/_rels/slide${i + 1}.xml.rels`, data: enc(`${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`) },
    ]),
  ];
  void EMU;
  return buildZip(entries, { deflate: deflateRaw });
}
