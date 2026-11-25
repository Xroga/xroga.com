import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readFileContents, parseDelimited, parseRange, detectKind } from '../file-format';
import { parseXml, kids } from '../office-read';
import { listZip, ZipError } from '../zip-read';
import { makeZip } from '../../../fixtures/zip-writer.mjs';

const fx = (name: string) => new Uint8Array(readFileSync(new URL(`../../../fixtures/pages/docs/${name}`, import.meta.url)));

describe('xml reader', () => {
  it('reads nested elements, attributes, entities and CDATA', () => {
    const root = parseXml('<?xml version="1.0"?><a:r x:id="1" v=\'q&amp;a\'><b>t &lt; 2 &#65;</b><c/><![CDATA[<raw>]]></a:r>');
    const r = kids(root)[0];
    expect(r.name).toBe('r');
    expect(r.attrs).toEqual({ id: '1', v: 'q&a' });
    expect(kids(r).map(k => k.name)).toEqual(['b', 'c']);
    expect(JSON.stringify(r.children)).toContain('t < 2 A');
    expect(JSON.stringify(r.children)).toContain('<raw>');
  });
});

describe('docx', () => {
  it('keeps headings, bullet and numbered lists and the table', async () => {
    const r = await readFileContents(fx('agreement.docx'), { name: 'agreement.docx' });
    expect(r.kind).toBe('docx');
    expect(r.text).toMatch(/# Supplier Agreement 2027/);
    expect(r.text).toMatch(/\n# Scope of supply/);
    expect(r.text).toMatch(/## Delivery terms/);
    expect(r.text).toMatch(/- Pallets are delivered between 06:00 and 14:00\n- Damaged goods/);
    expect(r.text).toMatch(/1\. Depot manager\n2\. Regional director\n3\. Managing board/);
    expect(r.text).toMatch(/\| Express \| 19\.80 EUR \| 20 \|/);
  });
});

describe('xlsx', () => {
  it('shows the first sheet with real row numbers, dates, booleans, shared rich text and unevaluated formulas', async () => {
    const r = await readFileContents(fx('orders.xlsx'), { name: 'orders.xlsx' });
    expect(r.text).toMatch(/Workbook: 2 sheets: Orders \(5 rows × 4 columns\); Targets \(2 rows × 2 columns\)/);
    expect(r.text).toMatch(/\| 2 \| Acme Corp \| 2026-01-01 \| 1250\.5 \| TRUE \|/);
    expect(r.text).toMatch(/\| 3 \| Bolt & Nut Ltd \| 2026-02-01 \| 980 \| FALSE \|/);
    expect(r.text).toMatch(/\| 4 \| Cargo Partners \| 2026-03-01 \| \(formula not calculated: =C2\+C3\) \| TRUE \|/);
    expect(r.text).toMatch(/\| 7 \| Total \| {2}\| 2230\.5 \|/);
    expect(r.text).toMatch(/Other sheets: ask for them/);
  });
  it('opens another sheet by name and refuses an unknown one', async () => {
    const t = await readFileContents(fx('orders.xlsx'), { sheet: 'targets' });
    expect(t.text).toMatch(/\| 2 \| North \| 5000 \|/);
    expect((await readFileContents(fx('orders.xlsx'), { sheet: 'nope' })).text).toMatch(/no sheet named "nope". Sheets: Orders, Targets/);
  });
});

describe('pptx, epub, csv, zip', () => {
  it('lists slides in presentation order with titles and bullets', async () => {
    const r = await readFileContents(fx('deck.pptx'));
    expect(r.kind).toBe('pptx');
    expect(r.text.indexOf('Q4 results')).toBeLessThan(r.text.indexOf('Roadmap review'));
    expect(r.text).toMatch(/## Slide 1: Q4 results\n- Revenue 4\.2M, up 11 percent/);
  });
  it('gives the chapter list, then one chapter', async () => {
    const toc = await readFileContents(fx('lighthouse.epub'));
    expect(toc.text).toMatch(/Book: “The Lighthouse Log” by E\. Marsh \(en\), 2 chapters/);
    expect(toc.text).toMatch(/2\. The Storm of April/);
    const two = await readFileContents(fx('lighthouse.epub'), { chapter: 2 });
    expect(two.text).toMatch(/951 millibars/);
    expect(two.text).not.toMatch(/supply boat/);
  });
  it('detects the delimiter, profiles columns and pages rows', async () => {
    expect(parseDelimited('a;b\n1;2\n3;4\n').delimiter).toBe(';');
    expect(parseDelimited('sep=|\nx|y\n1|2\n').rows).toEqual([['x', 'y'], ['1', '2']]);
    expect(parseDelimited('a,b\n"x, y",2\n"he said ""hi""",3\n').rows[2]).toEqual(['he said "hi"', '3']);
    const r = await readFileContents(fx('sales.csv'), { name: 'sales.csv', rows: '1-3' });
    expect(r.text).toMatch(/7 data rows × 4 columns/);
    expect(r.text).toMatch(/units: number, 64 to 152, sum 785/);
    expect(r.text).toMatch(/region: text, 4 values: North, South, East, West/);
    expect(r.text).toMatch(/sold_on: date, 2027-01-04 to 2027-01-14/);
    expect(r.text).toMatch(/Rows 2-3 shown/);
  });
  it('lists a plain zip and opens a member', async () => {
    const list = await readFileContents(fx('bundle.zip'));
    expect(list.text).toMatch(/Zip archive: 2 files/);
    expect(list.text).toMatch(/- data\/sales\.csv/);
    const member = await readFileContents(fx('bundle.zip'), { member: 'readme.txt' });
    expect(member.text).toMatch(/audit@example\.test/);
  });
});

describe('other formats and safety', () => {
  it('summarises JSON and turns an array of records into a table', async () => {
    const bytes = new TextEncoder().encode(JSON.stringify([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]));
    const r = await readFileContents(bytes, { name: 'x.json' });
    expect(r.text).toMatch(/JSON: array of 2/);
    expect(r.text).toMatch(/\| 3 \| 2 \| b \|/);
  });
  it('points a PDF, a picture and an old Office file to the right tool', async () => {
    expect((await readFileContents(new TextEncoder().encode('%PDF-1.7 ...'))).text).toMatch(/read_pdf/);
    expect((await readFileContents(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).text).toMatch(/ocr or parse_screen/);
    expect((await readFileContents(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 1, 2]))).text).toMatch(/old binary Office/);
  });
  it('reads a feed and finds lines with their heading', async () => {
    const feed = '<?xml version="1.0"?><rss><channel><title>News</title><item><title>One</title><link>https://a.test/1</link></item><item><title>Two</title><link>https://a.test/2</link></item></channel></rss>';
    expect((await readFileContents(new TextEncoder().encode(feed), { name: 'f.xml' })).text).toMatch(/- Two — https:\/\/a\.test\/2/);
    const found = await readFileContents(fx('agreement.docx'), { find: 'rotterdam' });
    expect(found.text).toMatch(/2 lines contain “rotterdam”/);
    expect(found.text).toMatch(/\[Scope of supply\] The supplier delivers 1,200 pallets/);
  });
  it('refuses a damaged zip, one with too many members, and a bomb', async () => {
    expect((await readFileContents(Uint8Array.from([0x50, 0x4b, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]))).text).toMatch(/error: .*not a zip container/);
    const many = makeZip(Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i}.txt`, 'x'])));
    expect(() => listZip(new Uint8Array(many), { maxMembers: 5, maxMemberBytes: 1e6, maxTotalBytes: 1e6 })).toThrow(ZipError);
    const bomb = makeZip({ 'big.txt': 'A'.repeat(3_000_000) });
    expect(() => listZip(new Uint8Array(bomb), { maxMembers: 10, maxMemberBytes: 1_000_000, maxTotalBytes: 5e6 })).toThrow(/more than the limit/);
  });
  it('detects kinds and ranges', () => {
    expect(detectKind(new TextEncoder().encode('<html><body>x'), 'a')).toBe('html');
    expect(detectKind(new TextEncoder().encode('a,b\n1,2'), 'data.csv')).toBe('csv');
    expect(parseRange('51-100')).toEqual([51, 100]);
    expect(parseRange(undefined)).toEqual([1, 50]);
  });
});
