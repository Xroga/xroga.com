import { describe, expect, it } from 'vitest';
import { describeOcr, type OcrResult } from '../ocr-format';

const line = (text: string, x0: number, y0: number, x1: number, y1: number, confidence = 90) => ({ text, confidence, bbox: { x0, y0, x1, y1 }, words: text.split(' ').map(w => ({ text: w, confidence, bbox: { x0, y0, x1, y1 } })) });
const result: OcrResult = { text: '', lines: [line('Export as PDF', 100, 50, 300, 70), line('Save draft', 100, 150, 260, 170), line('smudge', 10, 10, 20, 20, 12), line('Total 4,200', 500, 400, 700, 420, 55)] };

describe('describeOcr', () => {
  it('lists lines with their centres as fractions of the picture, drops low-confidence noise and marks weak words', () => {
    const out = describeOcr(result, { width: 1000, height: 500 });
    expect(out).toContain('«Export as PDF» [0.200, 0.120]');
    expect(out).toContain('«Save draft» [0.180, 0.320]');
    expect(out).not.toContain('smudge');
    expect(out).toContain('«Total? 4,200?»');
  });
  it('maps a region back to fractions of the whole page, and filters with find', () => {
    const out = describeOcr(result, { width: 1000, height: 500 }, { region: [0.5, 0.5, 1, 1], find: 'save' });
    expect(out).toContain('«Save draft» [0.590, 0.660]');
    expect(out).not.toContain('Export');
  });
  it('says plainly when nothing matched or nothing was read', () => {
    expect(describeOcr(result, { width: 1000, height: 500 }, { find: 'invoice' })).toMatch(/no line contains "invoice".*other line/);
    expect(describeOcr({ text: '', lines: [] }, { width: 10, height: 10 })).toMatch(/no text was recognised/);
  });
});
