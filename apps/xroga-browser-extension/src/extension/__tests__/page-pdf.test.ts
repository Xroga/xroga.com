import { describe, expect, it } from 'vitest';
import { MAX_PDF_BYTES, pdfName, printToBase64 } from '../page-pdf';

describe('page pdf', () => {
  it('names the file from the page title and the date, without characters a file system refuses', () => {
    expect(pdfName('Invoice: Q3 / "final"?', new Date('2026-11-25T10:00:00Z'))).toBe('Invoice Q3 final 2026-11-25.pdf');
    expect(pdfName(undefined, new Date('2026-11-25T10:00:00Z'))).toBe('page 2026-11-25.pdf');
    expect(pdfName('..hidden', new Date('2026-11-25T10:00:00Z'))).toBe('hidden 2026-11-25.pdf');
  });
  it('returns the bytes the browser printed', async () => {
    const r = await printToBase64(async () => ({ data: 'JVBERi0xLjQ=' }));
    expect(r).toEqual({ ok: true, base64: 'JVBERi0xLjQ=', bytes: 9 });
  });
  it('says what went wrong instead of throwing', async () => {
    expect(await printToBase64(async () => ({}))).toMatchObject({ ok: false });
    expect(await printToBase64(async () => { throw new Error('Debugger is not attached to the tab'); })).toEqual({ ok: false, reason: 'Debugger is not attached to the tab' });
    const big = 'A'.repeat(Math.ceil((MAX_PDF_BYTES * 4) / 3) + 8);
    expect(await printToBase64(async () => ({ data: big }))).toMatchObject({ ok: false });
  });
});

describe('pdf options', () => {
  it('turns the options asked into print parameters', async () => {
    const { pdfParams } = await import('../page-pdf');
    expect(pdfParams()).toEqual({ printBackground: true, landscape: false, preferCSSPageSize: true });
    expect(pdfParams({ paper: 'A4', landscape: true, scale: 0.8, background: false })).toEqual({ printBackground: false, landscape: true, paperWidth: 8.27, paperHeight: 11.7, preferCSSPageSize: false, scale: 0.8 });
    expect(pdfParams({ paper: 'nonsense', scale: 9 })).toEqual({ printBackground: true, landscape: false, preferCSSPageSize: true });
  });
});
