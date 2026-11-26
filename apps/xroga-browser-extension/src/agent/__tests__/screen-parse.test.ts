import { describe, expect, it } from 'vitest';
import { describeScreen, parseScreen, type MarkBox } from '../screen-parse';
import type { OcrLineBox } from '../ocr-format';

const line = (text: string, x0: number, y0: number, x1: number, y1: number, confidence = 90): OcrLineBox => ({ text, confidence, bbox: { x0, y0, x1, y1 }, words: [] });
const pic = { width: 1000, height: 500 };

describe('parseScreen (OmniParser joining rule)', () => {
  const marks: MarkBox[] = [
    { n: 1, box: [0.05, 0.05, 0.25, 0.15] }, // a button
    { n: 2, box: [0.9, 0.02, 0.95, 0.1] }, // an icon with no words
    { n: 3, box: [0, 0, 1, 1] }, // the whole picture: a container
  ];
  const lines = [line('Save draft', 80, 30, 220, 65), line('Total due 4,200', 400, 300, 640, 340), line('x', 1, 1, 2, 2, 10)];
  const out = parseScreen(marks, lines, pic);

  it('gives a recognised line to the smallest region that holds it, so a button is labelled by its own words, not by the container around it', () => {
    expect(out.find(e => e.n === 1)?.text).toBe('Save draft');
    expect(out.find(e => e.n === 3)?.text).toBe('Total due 4,200');
  });
  it('leaves a region with no words as an icon, and drops a low-confidence smudge', () => {
    expect(out.find(e => e.n === 2)?.text).toBe('');
    expect(out.some(e => e.text === 'x')).toBe(false);
  });
  it('keeps a line that is outside every region as plain text with its place, and maps a part of the page back to the whole', () => {
    const plain = parseScreen([{ n: 1, box: [0.8, 0.8, 0.9, 0.9] }], [line('Hello', 100, 100, 200, 140)], pic, [0.5, 0.5, 1, 1]);
    const t = plain.find(e => e.kind === 'text')!;
    expect(t.at[0]).toBeCloseTo(0.5 + 0.15 * 0.5, 3);
    expect(t.at[1]).toBeCloseTo(0.5 + 0.24 * 0.5, 3);
  });
  it('lists regions and text in reading order for the model, saying which are icons', () => {
    const text = describeScreen(out);
    expect(text).toContain('3 numbered regions (2 with words, 1 icons)');
    expect(text).toContain('mark 1 «Save draft»');
    expect(text).toContain('mark 2 icon');
    expect(text.indexOf('mark 1')).toBeLessThan(text.indexOf('mark 3'));
    expect(describeScreen([])).toMatch(/nothing was found/);
  });
});

describe('parseScreen, a menu bar read as one line', () => {
  it('gives each word to its own region and keeps words in no region as one plain piece', () => {
    const w = (text: string, x0: number, x1: number) => ({ text, confidence: 90, bbox: { x0, y0: 5, x1, y1: 25 } });
    const bar: OcrLineBox = { text: 'File Edit Tools help', confidence: 90, bbox: { x0: 10, y0: 5, x1: 400, y1: 25 }, words: [w('File', 10, 60), w('Edit', 100, 150), w('Tools', 200, 280), w('help', 350, 400)] };
    const marks: MarkBox[] = [
      { n: 1, box: [0.005, 0.005, 0.07, 0.06] },
      { n: 2, box: [0.09, 0.005, 0.16, 0.06] },
      { n: 3, box: [0.19, 0.005, 0.29, 0.06] },
    ];
    const out = parseScreen(marks, [bar], { width: 1000, height: 500 });
    expect(out.find(e => e.n === 1)?.text).toBe('File');
    expect(out.find(e => e.n === 2)?.text).toBe('Edit');
    expect(out.find(e => e.n === 3)?.text).toBe('Tools');
    expect(out.filter(e => e.kind === 'text').map(e => e.text)).toEqual(['help']);
  });
});
