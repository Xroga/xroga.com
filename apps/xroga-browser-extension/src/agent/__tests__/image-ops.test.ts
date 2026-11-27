import { describe, expect, it } from 'vitest';
import { extractChannel, gamma, median, negate, normalise, threshold, tint, unflatten } from '../image-ops';
import { normalizeImage } from '../image-spec';

const px = (...c: Array<[number, number, number, number?]>) => new Uint8ClampedArray(c.flatMap(x => [x[0], x[1], x[2], x[3] ?? 255]));

describe('picture operations', () => {
  it('median removes a single bright speck and keeps an edge', () => {
    const w = 5;
    const h = 5;
    const p = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) p.set([40, 40, 40, 255], i * 4);
    p.set([255, 255, 255, 255], (2 * w + 2) * 4);
    median(p, w, h, 3);
    expect(p[(2 * w + 2) * 4]).toBe(40);
    const edge = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) edge.set(x < 2 ? [0, 0, 0, 255] : [200, 200, 200, 255], (y * w + x) * 4);
    median(edge, w, h, 3);
    expect(edge[(2 * w + 0) * 4]).toBe(0);
    expect(edge[(2 * w + 4) * 4]).toBe(200);
  });
  it('gamma brightens the middle and leaves black and white', () => {
    const p = px([0, 0, 0], [128, 128, 128], [255, 255, 255]);
    gamma(p, 2);
    expect(p[0]).toBe(0);
    expect(p[4]).toBeGreaterThan(170);
    expect(p[8]).toBe(255);
  });
  it('normalise stretches a hazy picture to the full range, and leaves a flat one', () => {
    const p = new Uint8ClampedArray(100 * 4);
    for (let i = 0; i < 100; i++) p.set([100 + i, 100 + i, 100 + i, 255], i * 4);
    const r = normalise(p, 1, 99);
    expect(r.low).toBeGreaterThanOrEqual(100);
    expect(p[0]).toBe(0);
    expect(p[99 * 4]).toBe(255);
    const flat = px([90, 90, 90], [91, 91, 91]);
    normalise(flat);
    expect(flat[0]).toBe(90);
  });
  it('threshold, negate, tint, channel and unflatten do what they say', () => {
    const t = px([200, 200, 200], [50, 50, 50]);
    threshold(t, 128);
    expect([t[0], t[4]]).toEqual([255, 0]);
    const n = px([10, 20, 30, 200]);
    negate(n);
    expect(Array.from(n)).toEqual([245, 235, 225, 200]);
    const ti = px([128, 128, 128], [0, 0, 0]);
    tint(ti, [200, 100, 50]);
    expect(ti[0]).toBeGreaterThan(ti[2]!);
    expect([ti[4], ti[5], ti[6]]).toEqual([0, 0, 0]);
    const ch = px([10, 200, 30, 90]);
    extractChannel(ch, 'green');
    expect(Array.from(ch)).toEqual([200, 200, 200, 255]);
    const u = px([255, 255, 255], [250, 250, 250], [200, 30, 30], [235, 235, 235]);
    unflatten(u, 12);
    expect(u[3]).toBe(0);
    expect(u[7]).toBe(0);
    expect(u[11]).toBe(255);
    expect(u[15]).toBeGreaterThan(0);
    expect(u[15]).toBeLessThan(255);
  });
});

describe('asking for them', () => {
  it('reads each option and clamps it', () => {
    const r = normalizeImage({ url: 'https://x.test/a.png', median: 5, gamma: 9, normalise: true, threshold: 300, tint: '#c86432', negate: true, unflatten: true, channel: 'green', watermark: { url: 'https://x.test/w.png', blend: 'multiply' } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.request).toMatchObject({ median: 5, gamma: 3, normalise: { lower: 1, upper: 99 }, threshold: 255, tint: [200, 100, 50], negate: true, unflatten: 12, channel: 'green' });
    expect(r.request.watermark?.blend).toBe('multiply');
    const bad = normalizeImage({ url: 'https://x.test/a.png', tint: 'red', channel: 'purple', watermark: { url: 'https://x.test/w.png', blend: 'explode' } });
    expect(bad.ok && bad.request.tint).toBeUndefined();
    expect(bad.ok && bad.request.channel).toBeUndefined();
    expect(bad.ok && bad.request.watermark?.blend).toBe('source-over');
  });
});
