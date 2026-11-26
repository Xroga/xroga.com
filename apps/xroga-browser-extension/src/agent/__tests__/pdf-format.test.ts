import { describe, expect, it } from 'vitest';
import { describePdf, parsePages, type PdfResult } from '../pdf-format';

describe('parsePages', () => {
  it('reads ranges and lists within the page count, and falls back to the first pages', () => {
    expect(parsePages('1-3,7', 10)).toEqual([1, 2, 3, 7]);
    expect(parsePages('8-20', 10)).toEqual([8, 9, 10]);
    expect(parsePages('3-1', 10)).toEqual([1, 2, 3]);
    expect(parsePages('2,2,2', 10)).toEqual([2]);
    expect(parsePages(undefined, 3)).toEqual([1, 2, 3]);
    expect(parsePages('nonsense', 20)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('describePdf', () => {
  const result: PdfResult = {
    pageCount: 12,
    title: 'Quarterly report',
    pages: [
      { page: 1, text: 'Revenue 4,200\nCosts 3,100', source: 'text' },
      { page: 2, text: 'Invoice total 9,990\nDue 12 Dec', source: 'picture' },
    ],
  };
  it('shows each page with a header, marks a page read from a picture, and says which pages are not read yet', () => {
    const out = describePdf(result);
    expect(out).toContain('12 pages');
    expect(out).toContain('--- page 1 ---');
    expect(out).toContain('--- page 2 (read from a picture: check numbers and names) ---');
    expect(out).toContain('use pages "3-7"');
  });
  it('returns only the matching lines with their pages for find, and says plainly when none match', () => {
    expect(describePdf(result, { find: 'invoice' })).toContain('p2: Invoice total 9,990');
    expect(describePdf(result, { find: 'nothing here' })).toMatch(/No line of the pages read contains/);
  });
  it('cuts a long read and names where to continue', () => {
    const big: PdfResult = { pageCount: 6, pages: Array.from({ length: 6 }, (_, i) => ({ page: i + 1, text: 'x'.repeat(9000), source: 'text' as const })) };
    const out = describePdf(big);
    expect(out).toMatch(/Stopped before page 3: read on with pages "3-6"/);
    expect(out).not.toContain('--- page 4');
  });
});

import { pdfAddressIn } from '../pdf-format';
describe('pdfAddressIn', () => {
  it('finds the PDF address in a page header line and ignores other pages', () => {
    expect(pdfAddressIn('report.pdf · https://a.test/files/report.pdf?x=1 · viewport 0–800 of 800 px')).toBe('https://a.test/files/report.pdf');
    expect(pdfAddressIn('Home · https://a.test/index.html · viewport 0–800 of 800 px')).toBeUndefined();
  });
});
