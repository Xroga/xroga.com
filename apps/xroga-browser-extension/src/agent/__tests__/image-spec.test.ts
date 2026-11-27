import { describe, expect, it } from 'vitest';
import { CONVERT_IMAGE_TOOL, icoFromPngs, imageFilename, imageMime, normalizeImage, outsideRounded, planResize, trimBounds } from '../image-spec';
import { polygonArea, simplifyLoop, traceImage, traceMask } from '../vector-trace';

describe('sizing like sharp', () => {
  it('keeps the size when none is asked', () => {
    expect(planResize(400, 300, undefined, undefined, 'cover')).toEqual({ outW: 400, outH: 300, dx: 0, dy: 0, dw: 400, dh: 300 });
  });
  it('cover fills the box and crops the overflow, anchored by position', () => {
    const c = planResize(400, 200, 100, 100, 'cover');
    expect([c.outW, c.outH, c.dh]).toEqual([100, 100, 100]);
    expect(c.dw).toBe(200);
    expect(c.dx).toBe(-50);
    const left = planResize(400, 200, 100, 100, 'cover', 'left');
    expect(left.dx).toBe(0);
    const right = planResize(400, 200, 100, 100, 'cover', 'right');
    expect(right.dx).toBe(-100);
  });
  it('contain fits the whole picture and leaves the rest', () => {
    const c = planResize(400, 200, 100, 100, 'contain');
    expect([c.outW, c.outH, c.dw, c.dh, c.dx, c.dy]).toEqual([100, 100, 100, 50, 0, 25]);
    expect(planResize(400, 200, 100, 100, 'contain', 'top').dy).toBe(0);
  });
  it('inside and outside make the output the scaled picture, fill stretches', () => {
    expect(planResize(400, 200, 100, 100, 'inside')).toMatchObject({ outW: 100, outH: 50 });
    expect(planResize(400, 200, 100, 100, 'outside')).toMatchObject({ outW: 200, outH: 100 });
    expect(planResize(400, 200, 100, 100, 'fill')).toMatchObject({ outW: 100, outH: 100, dw: 100, dh: 100 });
  });
  it('gives the other side from the aspect, and does not enlarge when asked', () => {
    expect(planResize(400, 200, 100, undefined, 'cover')).toMatchObject({ outW: 100, outH: 50 });
    expect(planResize(400, 200, undefined, 100, 'cover')).toMatchObject({ outW: 200, outH: 100 });
    expect(planResize(100, 50, 400, undefined, 'cover', 'center', true)).toMatchObject({ outW: 100, outH: 50 });
    expect(planResize(100, 50, 400, undefined, 'cover', 'center', false)).toMatchObject({ outW: 400, outH: 200 });
  });
});

describe('trim', () => {
  it('finds what is inside a plain border, and nothing in a plain picture', () => {
    const w = 10;
    const h = 8;
    const px = new Uint8ClampedArray(w * h * 4).fill(255);
    for (let y = 2; y < 5; y++) for (let x = 3; x < 8; x++) px.set([10, 20, 30, 255], (y * w + x) * 4);
    expect(trimBounds(px, w, h)).toEqual({ left: 3, top: 2, width: 5, height: 3 });
    expect(trimBounds(new Uint8ClampedArray(w * h * 4).fill(255), w, h)).toBeNull();
  });
});

describe('ico and corners', () => {
  it('writes a directory that points at each picture', () => {
    const a = Uint8Array.from([1, 2, 3]);
    const b = Uint8Array.from([4, 5, 6, 7]);
    const ico = icoFromPngs([{ size: 16, png: a }, { size: 256, png: b }]);
    const dv = new DataView(ico.buffer);
    expect([dv.getUint16(2, true), dv.getUint16(4, true)]).toEqual([1, 2]);
    expect([ico[6], ico[22]]).toEqual([16, 0]);
    expect(dv.getUint32(6 + 12, true)).toBe(6 + 32);
    expect(Array.from(ico.slice(dv.getUint32(22 + 12, true)))).toEqual([4, 5, 6, 7]);
    expect(() => icoFromPngs([{ size: 512, png: a }])).toThrow();
  });
  it('cuts the corners and keeps the middle', () => {
    expect(outsideRounded(0, 0, 100, 100, 30)).toBe(true);
    expect(outsideRounded(50, 50, 100, 100, 30)).toBe(false);
    expect(outsideRounded(50, 0, 100, 100, 30)).toBe(false);
    expect(outsideRounded(0, 0, 100, 100, 0)).toBe(false);
    expect(outsideRounded(1, 1, 100, 100, 50)).toBe(true);
  });
});

describe('the request', () => {
  it('checks the address, the format and the fit', () => {
    expect(normalizeImage({}).ok).toBe(false);
    expect(normalizeImage({ url: 'ftp://x/y.png' }).ok).toBe(false);
    expect(normalizeImage({ url: 'https://x.test/a.png', format: 'gif' }).ok).toBe(false);
    expect(normalizeImage({ url: 'https://x.test/a.png', fit: 'squash' }).ok).toBe(false);
    expect(normalizeImage({ url: 'https://x.test/a.png', background: 'javascript:alert(1)' }).ok).toBe(false);
    expect(normalizeImage({ url: 'https://x.test/a.png', format: 'svg', sizes: [16, 32] }).ok).toBe(false);
  });
  it('fills in defaults and reads the options', () => {
    const r = normalizeImage({ url: 'https://x.test/a.jpg', format: 'jpeg', width: 800.4, crop: { width: 100, height: 100 }, rotate: -90, round: 'circle', padding: 8, grade: { preset: 'bw' }, sizes: [64, 128, 4], watermark: { url: 'https://x.test/w.png' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const q = r.request;
    expect(q).toMatchObject({ width: 800, fit: 'cover', position: 'center', quality: 85, rotate: 270, round: 0.5, background: '#ffffff', sizes: [64, 128], filename: 'xroga-images.zip' });
    expect(q.padding).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
    expect(q.grade?.saturation).toBe(-1);
    expect(q.crop).toEqual({ left: 0, top: 0, width: 100, height: 100 });
    expect(q.watermark).toMatchObject({ position: 'bottom-right', scale: 0.2, opacity: 0.8 });
    expect(imageMime(q)).toBe('application/zip');
  });
  it('names files by what they are', () => {
    expect(imageFilename(undefined, 'jpeg', false)).toBe('xroga-image.jpg');
    expect(imageFilename('logo.PNG', 'webp', false)).toBe('logo.webp');
    expect(imageFilename('../x', 'png', false)).toBe('xroga-image.png');
    expect(CONVERT_IMAGE_TOOL.name).toBe('convert_image');
    const f = normalizeImage({ url: 'https://x.test/logo.png', favicons: true });
    expect(f.ok && f.request.filename).toBe('xroga-images.zip');
  });
});

describe('tracing', () => {
  const draw = (w: number, h: number, shapes: (x: number, y: number) => [number, number, number] | null) => {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.set([...(shapes(x, y) ?? [255, 255, 255]), 255], (y * w + x) * 4);
    return px;
  };
  it('follows the edges of a square with a hole into two loops', () => {
    const w = 12;
    const mask = new Uint8Array(w * w);
    for (let y = 2; y < 10; y++) for (let x = 2; x < 10; x++) if (!(x >= 5 && x < 7 && y >= 5 && y < 7)) mask[y * w + x] = 1;
    const loops = traceMask(mask, w, w);
    expect(loops).toHaveLength(2);
    const areas = loops.map(l => polygonArea(l)).sort((a, b) => b - a);
    expect(areas).toEqual([64, 4]);
  });
  it('cuts a ring of points to its corners', () => {
    const square: Array<[number, number]> = [];
    for (let i = 0; i < 10; i++) square.push([i, 0]);
    for (let i = 0; i < 10; i++) square.push([10, i]);
    for (let i = 10; i > 0; i--) square.push([i, 10]);
    for (let i = 10; i > 0; i--) square.push([0, i]);
    const s = simplifyLoop(square, 0.5);
    expect(s.length).toBe(4);
    expect(polygonArea(s)).toBeCloseTo(100, 6);
  });
  it('traces a red disc and a blue square on white into layers with the right areas', () => {
    const w = 80;
    const h = 60;
    const px = draw(w, h, (x, y) => (Math.hypot(x - 20, y - 30) < 14 ? [220, 30, 30] : x >= 46 && x < 70 && y >= 16 && y < 44 ? [20, 40, 220] : null));
    const t = traceImage(px, w, h, { colors: 4, epsilon: 0.8 });
    expect(t.background && t.background[0] > 240).toBe(true);
    const red = t.layers.find(l => l.color[0] > 180 && l.color[2] < 80)!;
    const blue = t.layers.find(l => l.color[2] > 180 && l.color[0] < 80)!;
    expect(red).toBeTruthy();
    expect(blue).toBeTruthy();
    expect(polygonArea(red.loops[0]!)).toBeGreaterThan(Math.PI * 14 * 14 * 0.9);
    expect(polygonArea(red.loops[0]!)).toBeLessThan(Math.PI * 14 * 14 * 1.1);
    expect(polygonArea(blue.loops[0]!)).toBeCloseTo(24 * 28, -1);
    expect(blue.loops[0]!.length).toBeLessThanOrEqual(5);
    expect(t.svg.startsWith('<svg')).toBe(true);
    expect(t.svg).toContain('fill-rule="evenodd"');
    expect(t.svg.length).toBeLessThan(4000);
  });
  it('leaves transparent pixels out and a plain picture is only a background', () => {
    const px = new Uint8ClampedArray(16 * 16 * 4);
    const t = traceImage(px, 16, 16);
    expect(t.layers).toHaveLength(0);
    const flat = draw(16, 16, () => [10, 10, 10]);
    expect(traceImage(flat, 16, 16).layers).toHaveLength(0);
  });
});

describe('curves in the trace', () => {
  it('keeps corners as lines and smooths a gentle turn', async () => {
    const { loopPath } = await import('../vector-trace');
    expect(loopPath([[0, 0], [10, 0], [10, 10], [0, 10]])).not.toContain('Q');
    const circle = Array.from({ length: 24 }, (_, i) => [50 + 40 * Math.cos((i / 24) * 2 * Math.PI), 50 + 40 * Math.sin((i / 24) * 2 * Math.PI)] as [number, number]);
    const d = loopPath(circle);
    expect((d.match(/Q/g) ?? []).length).toBe(24);
    expect(d.startsWith('M')).toBe(true);
    expect(d.endsWith('Z')).toBe(true);
    expect(loopPath(circle, false)).not.toContain('Q');
    const mixed = loopPath([[0, 0], [20, 0], [30, 2], [40, 8], [40, 40], [0, 40]]);
    expect(mixed).toContain('Q');
    expect(mixed).toContain('L');
  });
});

import { binaryMask, toOklab, traceImage as traceImageV2 } from '../vector-trace';
describe('vtracer v2 ideas', () => {
  it('oklab: white is lightness 1, black 0, grey has no chroma', () => {
    expect(toOklab(255, 255, 255)[0]).toBeCloseTo(1, 2);
    expect(toOklab(0, 0, 0)[0]).toBeCloseTo(0, 3);
    const g = toOklab(128, 128, 128);
    expect(Math.abs(g[1])).toBeLessThan(0.001);
  });
  it('adaptive threshold finds ink under uneven light where a fixed cut-off fails', () => {
    const w = 40, h = 40, px = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const bg = 120 + x * 3; // shadow on the left
      const ink = x >= 18 && x < 22 && y >= 5 && y < 35;
      const v = ink ? bg - 70 : bg;
      px.set([v, v, v, 255], (y * w + x) * 4);
    }
    const fixed = binaryMask(px, w, h, { threshold: 128 });
    const adap = binaryMask(px, w, h, { adaptive: true, window: 15, t: 15 });
    expect(adap[20 * w + 20]).toBe(1);
    expect(adap[20 * w + 2]).toBe(0);
    expect(fixed[20 * w + 2]).toBe(1); // the shadow is wrongly ink with a fixed cut-off
  });
  it('bw preset gives one black layer and no background; palette is honoured', () => {
    const w = 30, h = 30, px = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) { const x = i % w; const dark = x > 10 && x < 20; px.set(dark ? [20, 20, 20, 255] : [240, 240, 240, 255], i * 4); }
    const bw = traceImageV2(px, w, h, { preset: 'bw' });
    expect(bw.layers.length).toBe(1);
    expect(bw.svg).toContain('#000000');
    const pal = traceImageV2(px, w, h, { palette: [[255, 0, 0], [0, 0, 255]] });
    expect(pal.svg).toMatch(/#ff0000|#0000ff/i);
  });
});
