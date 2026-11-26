import { describe, expect, it } from 'vitest';
import { diffPictures, viewOfChange } from '../pixels';

const picture = (width: number, height: number, fill = 255) => ({ width, height, data: new Uint8ClampedArray(width * height * 4).fill(fill) });
const paint = (p: ReturnType<typeof picture>, x0: number, y0: number, x1: number, y1: number, value: number) => {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let c = 0; c < 3; c++) p.data[(y * p.width + x) * 4 + c] = value;
};

describe('diffPictures', () => {
  it('finds nothing in identical pictures, and ignores a speck and tiny colour noise', () => {
    const a = picture(100, 100);
    expect(diffPictures(a, picture(100, 100))).toEqual({ fraction: 0, box: null });
    const speck = picture(100, 100);
    paint(speck, 10, 10, 13, 13, 0);
    expect(diffPictures(a, speck)).toEqual({ fraction: 0, box: null });
    const faint = picture(100, 100, 250);
    expect(diffPictures(a, faint)).toEqual({ fraction: 0, box: null });
  });

  it('returns the box and the share of what changed (a menu opened under a label)', () => {
    const a = picture(200, 100);
    const b = picture(200, 100);
    paint(b, 20, 10, 60, 50, 0);
    const change = diffPictures(a, b)!;
    expect(change.box).toEqual([0.1, 0.1, 0.3, 0.5]);
    expect(change.fraction).toBeCloseTo((40 * 40) / (200 * 100), 5);
  });

  it('cannot compare pictures of different sizes', () => {
    expect(diffPictures(picture(100, 100), picture(100, 101))).toBeNull();
  });
});

describe('viewOfChange', () => {
  it('adds a margin and grows a small change to a readable size, inside the page', () => {
    const v = viewOfChange([0.04, 0.02, 0.09, 0.06])!;
    expect(v[2] - v[0]).toBeGreaterThanOrEqual(0.3);
    expect(v[3] - v[1]).toBeGreaterThanOrEqual(0.2);
    expect(v[0]).toBeGreaterThanOrEqual(0);
    expect(v[1]).toBeGreaterThanOrEqual(0);
    expect(v[2]).toBeLessThanOrEqual(1);
    expect(v[3]).toBeLessThanOrEqual(1);
    // The change is inside the view.
    expect(v[0]).toBeLessThanOrEqual(0.04);
    expect(v[2]).toBeGreaterThanOrEqual(0.09);
  });

  it('keeps a change near the right or bottom edge inside the page', () => {
    const v = viewOfChange([0.95, 0.93, 0.99, 0.99])!;
    expect(v[2]).toBeLessThanOrEqual(1);
    expect(v[3]).toBeLessThanOrEqual(1);
    expect(v[0]).toBeLessThanOrEqual(0.95);
    expect(v[1]).toBeLessThanOrEqual(0.93);
  });

  it('gives no crop when the change fills most of the page', () => {
    expect(viewOfChange([0.05, 0.05, 0.95, 0.95])).toBeNull();
  });
});
