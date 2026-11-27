import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DOCUMENT_FORMATS, markdownToBlocks, normalizeDocument, parseCsv, describeDocument, makeDocumentBytes, MAKE_DOCUMENT_TOOL } from '../document-tool';
import { colName, excelSerial, inlineRuns, sheetNames, xlsxBytes, docxBytes, pptxBytes } from '../office-write';
import { readDocx, readPptx, readXlsx } from '../office-read';
import { ZipFile } from '../zip-read';
import { buildZip, crc32 } from '../zip-write';

// when set, the files are also written there, for the independent check with python-docx, openpyxl and python-pptx
const OUT = process.env.XROGA_OFFICE_OUT;
const keep = (name: string, bytes: Uint8Array) => {
  if (!OUT) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, name), bytes);
};

describe('zip', () => {
  it('has the CRC of the check string', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
  it('stores and deflates entries that read back the same, and refuses a bad name', async () => {
    const big = new TextEncoder().encode('abc'.repeat(5000));
    const deflate = async (d: Uint8Array) => {
      const { deflateRaw } = await import('../zip-write');
      return deflateRaw(d);
    };
    const zip = await buildZip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }, { name: 'dir/b.txt', data: big }], { deflate });
    const z = new ZipFile(zip);
    expect(await z.text('a.txt')).toBe('hello');
    expect((await z.bytes('dir/b.txt'))!.length).toBe(15000);
    expect(zip.length).toBeLessThan(5000);
    await expect(buildZip([{ name: '../x', data: new Uint8Array(1) }])).rejects.toThrow();
  });
});

describe('spreadsheet', () => {
  it('names columns and sheets the way Excel does', () => {
    expect([colName(0), colName(25), colName(26), colName(701), colName(702)]).toEqual(['A', 'Z', 'AA', 'ZZ', 'AAA']);
    expect(sheetNames(['Data', 'data', 'a/b:c', '', 'x'.repeat(40)])).toEqual(['Data', 'data 2', 'a b c', 'Sheet4', 'x'.repeat(31)]);
    expect(excelSerial('1970-01-01')).toBe(25569);
    expect(excelSerial('2026-11-27T12:00:00Z')).toBeCloseTo(46353.5, 6);
    expect(excelSerial('soon')).toBeNull();
  });
  it('writes a workbook that reads back with its header, numbers, text, dates and a formula', async () => {
    const bytes = await xlsxBytes(
      [
        { name: 'Leads', columns: ['Name', 'Rating', 'Reviews', 'Opened', 'Share'], rows: [['Café <A> & Co', 4.5, 120, '2024-03-05', 0.25], ['Bäckerei Ünal', 4, 8, '2021-11-30', 0.5], ['Total', null, '=SUM(C2:C3)', null, null]], formats: { 4: 'percent' }, formulas: true },
        { name: 'Notes', rows: [['one'], [true, 'two']] },
      ],
      { title: 'Test' },
    );
    keep('test.xlsx', bytes);
    const sheets = await readXlsx(new ZipFile(bytes));
    expect(sheets.map(s => s.name)).toEqual(['Leads', 'Notes']);
    const rows = sheets[0]!.rows.map(r => r.cells);
    expect(rows[0]).toEqual(['Name', 'Rating', 'Reviews', 'Opened', 'Share']);
    expect(rows[1]![0]).toBe('Café <A> & Co');
    expect(rows[1]![1]).toBe('4.5');
    expect(rows[1]![3]).toContain('2024-03-05');
    expect(rows[2]![0]).toBe('Bäckerei Ünal');
    expect(sheets[1]!.rows[1]!.cells[0]).toBe('TRUE');
  });
  it('refuses a workbook with no sheet', async () => {
    await expect(xlsxBytes([])).rejects.toThrow();
  });
});

describe('Word document', () => {
  it('reads inline markdown as runs', () => {
    expect(inlineRuns('a **b** *c* `d` [e](https://x.test/y) f')).toEqual([{ text: 'a ' }, { text: 'b', bold: true }, { text: ' ' }, { text: 'c', italic: true }, { text: ' ' }, { text: 'd', code: true }, { text: ' ' }, { text: 'e', link: 'https://x.test/y' }, { text: ' f' }]);
    expect(inlineRuns('2 * 3 * 4')).toEqual([{ text: '2 * 3 * 4' }]);
  });
  it('turns markdown into blocks', () => {
    const b = markdownToBlocks('# Report\n\nIntro line one\nline two\n\n## Part\n- a\n- b\n\n1. x\n2. y\n\n| h1 | h2 |\n|---|---|\n| 1 | 2 |\n\n> wise\n\n```\ncode here\n```\n***pagebreak***\n### Deep');
    expect(b.map(x => x.type)).toEqual(['title', 'paragraph', 'heading', 'bullets', 'numbered', 'table', 'quote', 'code', 'pageBreak', 'heading']);
    expect((b[1] as { text: string }).text).toBe('Intro line one line two');
    expect((b[2] as { level: number }).level).toBe(1);
    expect((b[9] as { level: number }).level).toBe(2);
    expect((b[5] as { header: string[] }).header).toEqual(['h1', 'h2']);
  });
  it('writes a document that reads back with its headings, lists, table and text', async () => {
    const blocks = [
      ...markdownToBlocks('# Weekly report\n\nSpend was **up** this week, see [the sheet](https://example.com/s).\n\n## Wins\n- Lower cost per lead\n- Better quality score\n\n## Numbers\n| Metric | Value |\n|---|---|\n| Spend | 1,200 |\n| Leads | 48 |\n\n1. Keep going\n2. Review Monday'),
    ];
    const bytes = await docxBytes(blocks, { title: 'Weekly report' });
    keep('test.docx', bytes);
    const text = await readDocx(new ZipFile(bytes));
    for (const part of ['Weekly report', 'Spend was', 'Lower cost per lead', 'Metric', '1,200', 'Review Monday']) expect(text).toContain(part);
  });
});

describe('presentation', () => {
  it('writes a deck that reads back with titles, bullets and a table', async () => {
    const bytes = await pptxBytes(
      [
        { title: 'Q4 plan', subtitle: 'Growth and spend', background: '1F3864' },
        { title: 'Priorities', bullets: ['Launch the new campaign', { text: 'Test three audiences', level: 1 }, 'Report weekly'], footer: 'Source: internal' },
        { title: 'Numbers', table: { header: ['Channel', 'Spend'], rows: [['Search', 1200], ['Social', 800]] } },
        { title: 'Notes', text: 'First line\nSecond line' },
      ],
      { title: 'Q4' },
    );
    keep('test.pptx', bytes);
    const slides = await readPptx(new ZipFile(bytes));
    expect(slides).toHaveLength(4);
    expect(slides[0]!.paragraphs.join(' ')).toContain('Q4 plan');
    expect(slides[1]!.paragraphs.join(' ')).toContain('Test three audiences');
    expect(slides[2]!.tables.join('\n')).toContain('Search');
    expect(slides[3]!.paragraphs.join(' ')).toContain('Second line');
  });
});

describe('the request', () => {
  it('reads CSV with quotes, other delimiters and keeps leading zeros as text', () => {
    expect(parseCsv('a,b\n"x, y",2\n"say ""hi""",007\n')).toEqual([['a', 'b'], ['x, y', 2], ['say "hi"', '007']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], [1, 2]]);
  });
  it('checks the format and what each format needs, and names the file', () => {
    expect(normalizeDocument({ format: 'pdf' }).ok).toBe(false);
    expect(normalizeDocument({ format: 'xlsx' }).ok).toBe(false);
    expect(normalizeDocument({ format: 'docx', filename: '../x' }).ok).toBe(false);
    const r = normalizeDocument({ format: 'xlsx', title: 'Q1 leads', csv: 'name,score\nA,1\nB,2' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request.filename).toBe('Q1 leads.xlsx');
    expect(r.request.sheets[0]).toMatchObject({ columns: ['name', 'score'], rows: [['A', 1], ['B', 2]] });
    expect(describeDocument(r.request)).toContain('2 rows');
    const d = normalizeDocument({ format: 'docx', filename: 'report.docx', markdown: '# T\ntext' });
    expect(d.ok && d.request.filename).toBe('report.docx');
    const p = normalizeDocument({ format: 'pptx', slides: [{ title: 'A', bullets: ['x', { text: 'y', level: 1 }] }] });
    expect(p.ok && p.request.slides[0]!.bullets).toEqual(['x', { text: 'y', level: 1 }]);
    expect(normalizeDocument({ format: 'docx', blocks: [{ type: 'sparkle' }] }).ok).toBe(false);
  });
  it('makes the bytes for each format from a checked request', async () => {
    for (const [format, extra] of [['xlsx', { sheets: [{ name: 'S', rows: [[1]] }] }], ['docx', { markdown: 'hello' }], ['pptx', { slides: [{ title: 'x' }] }]] as const) {
      const r = normalizeDocument({ format, ...extra });
      expect(r.ok).toBe(true);
      if (r.ok) {
        const bytes = await makeDocumentBytes(r.request);
        expect(String.fromCharCode(bytes[0]!, bytes[1]!)).toBe('PK');
      }
    }
    expect([...DOCUMENT_FORMATS]).toEqual(['xlsx', 'docx', 'pptx']);
    expect(MAKE_DOCUMENT_TOOL.name).toBe('make_document');
  });
});
