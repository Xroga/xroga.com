import { describe, expect, it } from 'vitest';
import { GRADE_PRESETS, applyGrade, curveTable, describeGrade, normalizeGrade, parseCube, sampleLut } from '../grade';

const px = (...colors: Array<[number, number, number, number?]>) => new Uint8ClampedArray(colors.flatMap(c => [c[0], c[1], c[2], c[3] ?? 255]));

describe('reading a grade', () => {
  it('returns nothing for nothing and clamps', () => {
    expect(normalizeGrade(undefined)).toBeUndefined();
    expect(normalizeGrade({})).toBeUndefined();
    expect(normalizeGrade({ brightness: 5, exposure: -9, hue: 999 })).toEqual({ brightness: 1, exposure: -3, hue: 180 });
  });
  it('takes a preset by name, and what is named beside it wins', () => {
    expect(normalizeGrade('bw')?.saturation).toBe(-1);
    expect(normalizeGrade({ preset: 'bw', saturation: -0.5 })?.saturation).toBe(-0.5);
    expect(normalizeGrade({ preset: 'nonsense' })).toBeUndefined();
    expect(Object.keys(GRADE_PRESETS).length).toBeGreaterThanOrEqual(8);
  });
  it('reads wheels, curves, hsl, lut, vignette, grain and a key', () => {
    const g = normalizeGrade({ wheels: { shadows: { r: 9 }, gamma: 9 }, curves: { rgb: [[1, 1], [0, 0.2]], red: [[0.5, 0.5]] }, hsl: { hue: [1, 2], saturation: [5] }, lut: 'https://example.com/a.cube', vignette: true, grain: 0.3, chromaKey: '#00ff00' })!;
    expect(g.wheels?.shadows.r).toBe(1);
    expect(g.wheels?.gamma).toBe(4);
    expect(g.curves?.rgb).toEqual([[0, 0.2], [1, 1]]);
    expect(g.curves?.red).toBeUndefined();
    expect(g.hsl?.saturation[0]).toBe(1);
    expect(g.hsl?.hue).toHaveLength(8);
    expect(g.lut).toEqual({ url: 'https://example.com/a.cube', intensity: 1 });
    expect(g.vignette?.amount).toBe(0.4);
    expect(g.grain?.amount).toBe(0.3);
    expect(g.chromaKey?.color).toEqual({ r: 0, g: 1, b: 0 });
    expect(normalizeGrade({ lut: 'http://example.com/a.cube' })).toBeUndefined();
    expect(describeGrade(g)).toContain('chroma key');
  });
});

describe('the pixel pass', () => {
  it('leaves a pixel alone with an empty grade', () => {
    const p = px([10, 120, 250]);
    applyGrade(p, 1, 1, {});
    expect(Array.from(p)).toEqual([10, 120, 250, 255]);
  });
  it('brightens, and makes black and white', () => {
    const p = px([100, 100, 100]);
    applyGrade(p, 1, 1, { brightness: 0.2 });
    expect(p[0]).toBeGreaterThan(120);
    const q = px([200, 50, 50]);
    applyGrade(q, 1, 1, { saturation: -1 });
    expect(Math.abs(q[0]! - q[1]!)).toBeLessThanOrEqual(1);
    expect(Math.abs(q[1]! - q[2]!)).toBeLessThanOrEqual(1);
  });
  it('warms: red up, blue down', () => {
    const p = px([128, 128, 128]);
    applyGrade(p, 1, 1, { temperature: 0.5 });
    expect(p[0]).toBeGreaterThan(p[2]!);
  });
  it('rotates hue: red becomes greenish at 120 degrees', () => {
    const p = px([255, 0, 0]);
    applyGrade(p, 1, 1, { hue: 120 });
    expect(p[1]).toBeGreaterThan(p[0]!);
  });
  it('tints shadows with the shadow wheel and not the highlights', () => {
    const dark = px([30, 30, 30]);
    const light = px([230, 230, 230]);
    const wheels = { shadows: { r: 0, g: 0, b: 1 }, midtones: { r: 0, g: 0, b: 0 }, highlights: { r: 0, g: 0, b: 0 }, lift: 0, gamma: 1, gain: 1 };
    applyGrade(dark, 1, 1, { wheels });
    applyGrade(light, 1, 1, { wheels });
    expect(dark[2]! - dark[0]!).toBeGreaterThan(30);
    expect(light[2]! - light[0]!).toBeLessThan(8);
  });
  it('follows a curve, and an inverting curve inverts', () => {
    const p = px([40, 200, 90]);
    applyGrade(p, 1, 1, { curves: { rgb: [[0, 1], [1, 0]] } });
    expect(p[0]).toBeGreaterThan(205);
    expect(p[1]).toBeLessThan(60);
    const t = curveTable([[0, 0], [0.5, 0.8], [1, 1]]);
    expect(t[128]).toBeGreaterThan(0.7);
    for (let i = 1; i < 256; i++) expect(t[i]!).toBeGreaterThanOrEqual(t[i - 1]! - 1e-6);
  });
  it('moves one hue range only', () => {
    const red = px([220, 40, 40]);
    const blue = px([40, 40, 220]);
    const hsl = { hue: [0, 0, 0, 0, 0, 0, 0, 0], saturation: [-1, 0, 0, 0, 0, 0, 0, 0], luminance: [0, 0, 0, 0, 0, 0, 0, 0] };
    applyGrade(red, 1, 1, { hsl });
    applyGrade(blue, 1, 1, { hsl });
    expect(Math.abs(red[0]! - red[1]!)).toBeLessThan(30);
    expect(blue[2]! - blue[0]!).toBeGreaterThan(150);
  });
  it('darkens the corners with a vignette and not the middle', () => {
    const size = 9;
    const p = new Uint8ClampedArray(size * size * 4).fill(200);
    for (let i = 3; i < p.length; i += 4) p[i] = 255;
    applyGrade(p, size, size, { vignette: { amount: 1, midpoint: 0.3, feather: 0.5, roundness: 1 } });
    const mid = p[(4 * size + 4) * 4]!;
    const corner = p[0]!;
    expect(mid).toBeGreaterThan(190);
    expect(corner).toBeLessThan(60);
  });
  it('adds grain that is different from frame to frame', () => {
    const a = new Uint8ClampedArray(16 * 16 * 4).fill(128);
    const b = new Uint8ClampedArray(a);
    applyGrade(a, 16, 16, { grain: { amount: 0.5, size: 1 } }, { frame: 1 });
    applyGrade(b, 16, 16, { grain: { amount: 0.5, size: 1 } }, { frame: 2 });
    expect(Array.from(a)).not.toEqual(Array.from(b));
    expect(new Set(Array.from(a.filter((_, i) => i % 4 === 0))).size).toBeGreaterThan(5);
  });
  it('sharpens an edge', () => {
    const w = 5;
    const p = new Uint8ClampedArray(w * 3 * 4);
    for (let y = 0; y < 3; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 4; c++) p[(y * w + x) * 4 + c] = c === 3 ? 255 : x < 2 ? 80 : 160;
    applyGrade(p, w, 3, { sharpen: 1 });
    expect(p[(1 * w + 2) * 4]).toBeGreaterThan(160);
    expect(p[(1 * w + 1) * 4]).toBeLessThan(80);
  });
  it('keys out green and keeps skin', () => {
    const p = px([0, 255, 0], [220, 160, 130], [30, 200, 40]);
    applyGrade(p, 3, 1, { chromaKey: { color: { r: 0, g: 1, b: 0 }, tolerance: 0.4, softness: 0.1, spill: 0.5 } });
    expect(p[3]).toBeLessThan(10);
    expect(p[7]).toBe(255);
    expect(p[11]).toBeLessThan(80);
  });
});

describe('a 3D LUT', () => {
  const cube = (f: (r: number, g: number, b: number) => [number, number, number]) => {
    const rows: string[] = ['# test', 'LUT_3D_SIZE 2'];
    for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) rows.push(f(r, g, b).join(' '));
    return rows.join('\n');
  };
  it('reads a cube, refuses a broken one, and samples between corners', () => {
    const lut = parseCube(cube((r, g, b) => [1 - r, 1 - g, 1 - b]));
    expect(lut.size).toBe(2);
    const out = { r: 0, g: 0, b: 0 };
    sampleLut(lut, 0.5, 0.5, 0.5, out);
    expect(out.r).toBeCloseTo(0.5, 5);
    sampleLut(lut, 1, 0, 0.25, out);
    expect(out.r).toBeCloseTo(0, 5);
    expect(out.g).toBeCloseTo(1, 5);
    expect(out.b).toBeCloseTo(0.75, 5);
    expect(() => parseCube('LUT_3D_SIZE 2\n0 0 0')).toThrow();
    expect(() => parseCube('LUT_1D_SIZE 4')).toThrow();
  });
  it('is applied at its intensity', () => {
    const lut = parseCube(cube((r, g, b) => [1 - r, 1 - g, 1 - b]));
    const full = px([255, 0, 0]);
    const half = px([255, 0, 0]);
    applyGrade(full, 1, 1, { lut: { url: 'https://x/y.cube', intensity: 1 } }, { lut });
    applyGrade(half, 1, 1, { lut: { url: 'https://x/y.cube', intensity: 0.5 } }, { lut });
    expect(full[0]).toBe(0);
    expect(full[1]).toBe(255);
    expect(half[0]).toBeGreaterThan(110);
    expect(half[0]).toBeLessThan(145);
  });
});
