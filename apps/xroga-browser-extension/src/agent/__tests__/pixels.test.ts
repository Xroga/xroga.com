import { describe, expect, it } from 'vitest';
import { describeHits, parseColor, scanColor } from '../pixels';

function canvas(w: number, h: number, paint: (x: number, y: number) => [number, number, number] | undefined) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = paint(x, y) ?? [30, 30, 30];
      data.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }
  return data;
}

describe('find_color pixel search', () => {
  it('parses hex and rgb colours and rejects anything else', () => {
    expect(parseColor('#FF0000')).toEqual([255, 0, 0]);
    expect(parseColor('rgb(0, 128, 255)')).toEqual([0, 128, 255]);
    expect(parseColor('red')).toBeUndefined();
    expect(parseColor('rgb(300,0,0)')).toBeUndefined();
  });

  it('finds a red swatch and a blue swatch at their centres', () => {
    const w = 400;
    const h = 200;
    const data = canvas(w, h, (x, y) =>
      x >= 40 && x < 80 && y >= 150 && y < 190 ? [255, 0, 0] : x >= 300 && x < 330 && y >= 20 && y < 50 ? [0, 0, 255] : undefined,
    );
    const red = scanColor(data, w, h, { color: '#ff0000' });
    expect(red).toHaveLength(1);
    expect(red[0].fx).toBeCloseTo(60 / w, 1);
    expect(red[0].fy).toBeCloseTo(170 / h, 1);
    const blue = scanColor(data, w, h, { color: 'rgb(0,0,255)' });
    expect(blue[0].box.x).toBeGreaterThanOrEqual(296);
    expect(blue[0].box.x).toBeLessThanOrEqual(304);
  });

  it('says plainly when nothing matches and respects the region and the tolerance', () => {
    const w = 200;
    const h = 100;
    const data = canvas(w, h, (x, y) => (x < 40 && y < 40 ? [250, 10, 10] : undefined));
    expect(scanColor(data, w, h, { color: '#00ff00' })).toEqual([]);
    expect(describeHits([], { width: w, height: h }, '#00ff00')).toContain('no area of that colour');
    expect(scanColor(data, w, h, { color: '#ff0000', region: [0.5, 0.5, 1, 1] })).toEqual([]);
    expect(scanColor(data, w, h, { color: '#ff0000', tolerance: 20 })).toHaveLength(1);
    expect(scanColor(data, w, h, { color: '#ff0000', tolerance: 2 })).toEqual([]);
  });

  it('separates two areas of the same colour, largest first', () => {
    const w = 300;
    const h = 100;
    const data = canvas(w, h, (x, y) => (((x >= 10 && x < 40) || (x >= 200 && x < 260)) && y >= 30 && y < 70 ? [0, 200, 0] : undefined));
    const hits = scanColor(data, w, h, { color: '#00c800', limit: 5 });
    expect(hits).toHaveLength(2);
    expect(hits[0].pixels).toBeGreaterThan(hits[1].pixels);
  });
});
