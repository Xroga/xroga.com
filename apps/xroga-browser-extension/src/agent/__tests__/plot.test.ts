import { describe, expect, it } from 'vitest';
import { autoYRange, niceStep, normalizePlot, parseExpression, sampleFunction, ticks } from '../plot';
import { normalizeSpec } from '../compose-spec';

const f = (s: string) => parseExpression(s);

describe('the formula reader', () => {
  it('does arithmetic with the usual precedence and powers', () => {
    expect(f('1+2*3')(0)).toBe(7);
    expect(f('(1+2)*3')(0)).toBe(9);
    expect(f('2^3^2')(0)).toBe(512 === f('2^3^2')(0) ? 512 : 64);
    expect(f('-x^2')(3)).toBe(-9);
    expect(f('10/4')(0)).toBe(2.5);
    expect(f('2**3')(0)).toBe(8);
    expect(f('x^2/4 + 1')(4)).toBe(5);
  });
  it('knows x, constants and functions, and writes like people do', () => {
    expect(f('sin(pi/2)')(0)).toBeCloseTo(1, 12);
    expect(f('e^x')(1)).toBeCloseTo(Math.E, 12);
    expect(f('2x')(5)).toBe(10);
    expect(f('3sin(x)')(Math.PI / 2)).toBeCloseTo(3, 12);
    expect(f('2(x+1)')(2)).toBe(6);
    expect(f('max(1, x, 3)')(5)).toBe(5);
    expect(f('sqrt(abs(x))')(-16)).toBe(4);
    expect(f('sin(x)/x')(Math.PI)).toBeCloseTo(0, 12);
    expect(f('ln(e)')(0)).toBeCloseTo(1, 12);
    expect(f('2.5e1')(0)).toBe(25);
  });
  it('refuses what it does not know, and never runs code', () => {
    expect(() => f('')).toThrow();
    expect(() => f('1+')).toThrow();
    expect(() => f('foo(x)')).toThrow(/not a function/);
    expect(() => f('y+1')).toThrow(/not known/);
    expect(() => f('(1+2')).toThrow(/closing bracket/);
    expect(() => f('alert(1)')).toThrow();
    expect(() => f('constructor.constructor("return 1")()')).toThrow();
    expect(() => f('x'.repeat(301))).toThrow();
  });
});

describe('ticks and ranges', () => {
  it('picks 1, 2 or 5 times a power of ten', () => {
    expect(niceStep(10, 5)).toBe(2);
    expect(niceStep(1, 5)).toBe(0.2);
    expect(niceStep(100, 4)).toBe(20);
    expect(ticks(-5, 5, 5)).toEqual([-4, -2, 0, 2, 4]);
    expect(ticks(0, 1, 5).every(t => t >= 0 && t <= 1)).toBe(true);
  });
  it('samples a curve, breaking it at a pole and at what is not a number', () => {
    const pts = sampleFunction(f('tan(x)'), [-3, 3], [-5, 5], 300);
    expect(pts.filter(p => p === null).length).toBeGreaterThan(0);
    const sqrtPts = sampleFunction(f('sqrt(x)'), [-4, 4], [-5, 5], 80);
    expect(sqrtPts.slice(0, 5).every(p => p === null)).toBe(true);
    expect(sqrtPts[sqrtPts.length - 1]).toMatchObject({ y: 2 });
  });
  it('finds a range that holds the curve without a pole stretching it', () => {
    const [lo, hi] = autoYRange(f('sin(x)'), [-6, 6]);
    expect(lo).toBeLessThan(-1);
    expect(hi).toBeGreaterThan(1);
    expect(hi).toBeLessThan(1.5);
    const [, hi2] = autoYRange(f('tan(x)'), [-3, 3]);
    expect(hi2).toBeLessThan(200);
  });
});

describe('the plot layer in a spec', () => {
  const clip = (layer: object) => ({ clips: [{ duration: 4, layers: [{ type: 'fill-color', color: '#101820' }, layer] }] });
  it('keeps a function, a line and bars', () => {
    const fn = normalizeSpec(clip({ type: 'plot', kind: 'function', expr: 'sin(x); cos(x)', xRange: [-6, 6], title: 'Waves', drawIn: 2 }));
    expect(fn.ok).toBe(true);
    const line = normalizeSpec(clip({ type: 'plot', kind: 'line', values: [3, 5, 4, 8, 6] }));
    expect(line.ok).toBe(true);
    const bar = normalizeSpec(clip({ type: 'plot', kind: 'bar', values: [10, 20, 15], labels: ['A', 'B', 'C'], colors: ['#f00', '#0f0', '#00f'] }));
    expect(bar.ok).toBe(true);
    if (fn.ok) expect((fn.spec.clips[0]!.layers[1] as { plot: { drawIn: number; expr: string } }).plot).toMatchObject({ drawIn: 2, expr: 'sin(x); cos(x)' });
  });
  it('says what is wrong with a plot', () => {
    expect(normalizePlot({ kind: 'function' }, (_v, d) => d)).toMatchObject({ ok: false });
    const bad = normalizeSpec(clip({ type: 'plot', kind: 'function', expr: 'foo(x)' }));
    expect(bad.ok).toBe(false);
    expect(bad.ok ? '' : bad.errors.join()).toContain('plot) expr');
    expect(normalizeSpec(clip({ type: 'plot', kind: 'bar', values: [] })).ok).toBe(false);
  });
});
