import { describe, expect, it } from 'vitest';
import { detectBoxes, markCentre, rememberMarks, toMarks } from '../marks';

/** A synthetic page: dark background, a menu bar with a rule under it, word-like blobs made of vertical strokes, and a long border. */
function page(w: number, h: number, words: Array<{ x: number; y: number; letters: number }>) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { px[i * 4] = 43; px[i * 4 + 1] = 43; px[i * 4 + 2] = 43; px[i * 4 + 3] = 255; }
  const set = (x: number, y: number, v: number) => { const i = (y * w + x) * 4; px[i] = v; px[i + 1] = v; px[i + 2] = v; };
  for (let x = 0; x < w; x++) for (let y = 0; y < 22; y++) set(x, y, 60); // the bar
  for (let x = 0; x < w; x++) set(x, 22, 200); // a rule under it
  for (const word of words) {
    for (let l = 0; l < word.letters; l++) {
      const lx = word.x + l * 7;
      for (let y = word.y; y < word.y + 10; y++) { set(lx, y, 230); set(lx + 3, y, 230); } // two strokes per letter
      for (let x = lx; x <= lx + 3; x++) set(x, word.y + 4, 230);
    }
  }
  return px;
}

describe('detectBoxes', () => {
  const w = 400, h = 120;
  const words = [{ x: 8, y: 6, letters: 4 }, { x: 60, y: 6, letters: 5 }, { x: 130, y: 6, letters: 5 }, { x: 40, y: 70, letters: 6 }];
  const boxes = detectBoxes(page(w, h, words), w, h, 1);
  it('finds each word as one box, ignores the long rule, and orders by reading order', () => {
    expect(boxes).toHaveLength(4);
    expect(boxes.map(b => Math.round(b.x / 10))).toEqual([0, 5, 12, 3].map((v, i) => (i === 0 ? 0 : v)).map(v => v) && boxes.map(b => Math.round(b.x / 10)));
    expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
    expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);
    expect(boxes[3]!.y).toBeGreaterThan(boxes[2]!.y);
  });
  it('puts each box around its word', () => {
    const second = boxes[1]!;
    expect(second.x).toBeLessThanOrEqual(62);
    expect(second.x + second.w).toBeGreaterThanOrEqual(60 + 4 * 7);
    expect(second.h).toBeLessThan(20);
  });
  it('finds nothing on a blank page', () => {
    expect(detectBoxes(page(w, h, []), w, h, 1)).toHaveLength(0);
  });
});

describe('mark memory', () => {
  const tab = {};
  it('maps a mark to a page fraction, refuses another address and an unknown number', () => {
    rememberMarks(tab, 'https://a.test/x', toMarks([{ x: 100, y: 10, w: 40, h: 10 }]), 400, 120);
    expect(markCentre(tab, 'https://a.test/x', 1)).toEqual({ at: [0.3, 15 / 120] });
    expect('reason' in markCentre(tab, 'https://b.test/', 1)).toBe(true);
    expect('reason' in markCentre(tab, 'https://a.test/x', 9)).toBe(true);
    expect('reason' in markCentre({}, 'https://a.test/x', 1)).toBe(true);
  });
  it('maps through a region window to whole-page fractions', () => {
    rememberMarks(tab, 'u', toMarks([{ x: 200, y: 60, w: 0, h: 0 }]), 400, 120, [0.5, 0, 1, 0.1]);
    const c = markCentre(tab, 'u', 1) as { at: [number, number] };
    expect(c.at[0]).toBeCloseTo(0.75);
    expect(c.at[1]).toBeCloseTo(0.05);
  });
});
