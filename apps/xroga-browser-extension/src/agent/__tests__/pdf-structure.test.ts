import { describe, expect, it } from 'vitest';
import { bodySize, splitColumns, structurePage, type PdfTextItem } from '../pdf-structure';

const t = (str: string, x: number, y: number, h = 10, w = str.length * 5): PdfTextItem => ({ str, x, y, w, h });
const para = (prefix: string, count: number, x: number, top: number, h = 10): PdfTextItem[] =>
  Array.from({ length: count }, (_, i) => t(`${prefix}${i + 1} sample words of ordinary body text`, x, top - i * 12, h, 200));

describe('structurePage', () => {
  it('ranks headings by type size and keeps body text as paragraphs', () => {
    const items = [t('Annual Report', 50, 780, 20, 150), t('1 Introduction', 50, 740, 14, 120), ...para('B', 4, 50, 710)];
    const body = bodySize([items]);
    expect(body).toBe(10);
    const md = structurePage(items, 600, { body, sizes: items.map(i => i.h) });
    expect(md.startsWith('# Annual Report\n\n## 1 Introduction\n\nB1 sample words')).toBe(true);
    expect(md).toContain('B4 sample words of ordinary body text');
  });

  it('takes the level from the document outline before type size', () => {
    const items = [t('Methods', 50, 740, 10, 50), ...para('B', 3, 50, 710)];
    const md = structurePage(items, 600, { body: 10, sizes: [10], outline: [{ title: 'Methods', depth: 2 }], page: 1 });
    expect(md.startsWith('## Methods\n\nB1')).toBe(true);
  });

  it('uses section numbering for a heading set in body size', () => {
    const items = [t('2.1 Data collection', 50, 740, 10, 100), ...para('B', 3, 50, 710)];
    const md = structurePage(items, 600, { body: 10, sizes: [10] });
    expect(md.startsWith('## 2.1 Data collection')).toBe(true);
  });

  it('reads two columns one after the other', () => {
    const items = [...para('L', 12, 50, 700), ...para('R', 12, 330, 700)];
    expect(splitColumns(items, 600)).toHaveLength(2);
    const md = structurePage(items, 600, { body: 10, sizes: [10] });
    expect(md.indexOf('L12')).toBeLessThan(md.indexOf('R1 '));
  });

  it('keeps a single column page in one piece', () => {
    expect(splitColumns(para('B', 30, 50, 760), 600)).toHaveLength(1);
  });

  it('makes list items and joins hyphenated lines into one paragraph', () => {
    const items = [t('• first point', 50, 700, 10, 70), t('• second point', 50, 688, 10, 80), t('inter-', 50, 640, 10, 30), t('national trade grows', 50, 628, 10, 100)];
    const md = structurePage(items, 600, { body: 10, sizes: [10] });
    expect(md).toContain('- first point\n- second point');
    expect(md).toContain('international trade grows');
  });

  it('turns aligned columns of cells into a table', () => {
    const row = (y: number, a: string, b: string, c: string) => [t(a, 50, y, 10, 40), t(b, 200, y, 10, 30), t(c, 320, y, 10, 40)];
    const items = [...row(700, 'Item', 'Qty', 'Price'), ...row(688, 'Bolt', '12', '3.50'), ...row(676, 'Nut', '40', '1.20')];
    const md = structurePage(items, 600, { body: 10, sizes: [10] });
    expect(md).toContain('| Item | Qty | Price |');
    expect(md).toContain('| --- | --- | --- |');
    expect(md).toContain('| Nut | 40 | 1.20 |');
  });
});
