import { describe, expect, it } from 'vitest';
import { describeImageHits, findTemplate, type Picture } from '../template-match';

function blank(w: number, h: number, v = 240): Picture {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set([v, v, v, 255], i);
  return { data, width: w, height: h };
}
/** A small asymmetric icon: a dark square with a lighter corner and a bar. */
function icon(size = 24): Picture {
  const p = blank(size, size, 250);
  const set = (x: number, y: number, v: number) => p.data.set([v, v, v, 255], (y * size + x) * 4);
  for (let y = 2; y < size - 2; y++) for (let x = 2; x < size - 2; x++) set(x, y, 40);
  for (let y = 2; y < 9; y++) for (let x = 2; x < 9; x++) set(x, y, 200);
  for (let x = 6; x < size - 4; x++) set(x, size - 8, 230);
  return p;
}
function paste(page: Picture, tpl: Picture, ox: number, oy: number): void {
  for (let y = 0; y < tpl.height; y++) for (let x = 0; x < tpl.width; x++) page.data.set(tpl.data.subarray((y * tpl.width + x) * 4, (y * tpl.width + x) * 4 + 4), ((oy + y) * page.width + ox + x) * 4);
}

describe('findTemplate', () => {
  it('finds every copy of an icon, best first, at the right place', () => {
    const page = blank(400, 240);
    paste(page, icon(), 50, 30);
    paste(page, icon(), 300, 180);
    const hits = findTemplate(page, icon());
    expect(hits).toHaveLength(2);
    const centres = hits.map(h => [Math.round(h.fx * 400), Math.round(h.fy * 240)]).sort((a, b) => a[0]! - b[0]!);
    expect(centres[0]![0]).toBeGreaterThanOrEqual(61);
    expect(centres[0]![0]).toBeLessThanOrEqual(63);
    expect(centres[1]![1]).toBeGreaterThanOrEqual(191);
    expect(centres[1]![1]).toBeLessThanOrEqual(193);
    expect(hits[0]!.score).toBeGreaterThan(0.99);
  });
  it('still finds it when the page is a little noisy, and finds nothing when the icon is absent', () => {
    const page = blank(300, 200);
    paste(page, icon(), 100, 100);
    for (let i = 0; i < page.data.length; i += 4) { const n = ((i * 7919) % 11) - 5; page.data[i] = Math.max(0, Math.min(255, page.data[i]! + n)); }
    expect(findTemplate(page, icon())).toHaveLength(1);
    expect(findTemplate(blank(300, 200), icon())).toHaveLength(0);
  });
  it('refuses a flat template and a template larger than the page, and the description says what to do', () => {
    expect(findTemplate(blank(100, 100), blank(20, 20, 128))).toEqual([]);
    expect(findTemplate(blank(10, 10), icon())).toEqual([]);
    expect(describeImageHits([], 0.9)).toMatch(/does not appear/);
    expect(describeImageHits([{ fx: 0.25, fy: 0.5, score: 1, box: { x: 0, y: 0, width: 1, height: 1 } }], 0.9)).toContain('1. [0.250, 0.500] score 1');
  });
});
