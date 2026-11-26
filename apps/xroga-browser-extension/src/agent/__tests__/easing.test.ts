import { describe, expect, it } from 'vitest';
import { EASING_NAMES, isEasing, resolveEasing, springEase } from '../easing';
import { ease, normalizeSpec } from '../compose-spec';
import { keyEase, keyframesFromList } from '../compose-motion';

describe('easing names', () => {
  it('reads the spellings of one curve as one', () => {
    const a = resolveEasing('ease-in-out-cubic')!;
    for (const n of ['easeInOutCubic', 'in-out-cubic', 'inoutcubic', 'EASE_IN_OUT_CUBIC']) expect(resolveEasing(n)!(0.3)).toBeCloseTo(a(0.3), 10);
    expect(resolveEasing('ease-in')!(0.5)).toBeCloseTo(0.125, 10);
    expect(isEasing('nonsense')).toBe(false);
    expect(isEasing('spring-bouncy')).toBe(true);
  });
  it('starts at 0 and ends at 1 for every name it offers, and is clamped outside', () => {
    for (const name of EASING_NAMES) {
      const f = resolveEasing(name)!;
      expect(f(0), name).toBeCloseTo(0, 6);
      expect(f(1), name).toBeCloseTo(1, 6);
      expect(f(-3)).toBeCloseTo(0, 6);
      expect(f(7)).toBeCloseTo(1, 6);
    }
    expect(EASING_NAMES.length).toBeGreaterThan(30);
  });
  it('has the shapes: in is slow first, out is fast first, in-out is symmetric', () => {
    for (const kind of ['sine', 'quad', 'cubic', 'quart', 'quint', 'expo', 'circ']) {
      expect(resolveEasing(`ease-in-${kind}`)!(0.3)).toBeLessThan(0.3);
      expect(resolveEasing(`ease-out-${kind}`)!(0.3)).toBeGreaterThan(0.3);
      const io = resolveEasing(`ease-in-out-${kind}`)!;
      expect(io(0.5)).toBeCloseTo(0.5, 6);
      expect(io(0.2) + io(0.8)).toBeCloseTo(1, 6);
    }
  });
  it('goes past the target for back and elastic, and bounces to rest', () => {
    expect(resolveEasing('ease-out-back')!(0.7)).toBeGreaterThan(1);
    expect(resolveEasing('ease-in-back')!(0.2)).toBeLessThan(0);
    expect(Math.max(...Array.from({ length: 50 }, (_, i) => resolveEasing('ease-out-elastic')!(i / 49)))).toBeGreaterThan(1.05);
    const bounce = resolveEasing('ease-out-bounce')!;
    expect(bounce(0.9)).toBeGreaterThan(0.9);
    expect(bounce(0.5)).toBeGreaterThan(0.6);
  });
  it('springs overshoot when lightly damped, not when damped enough, and settle at the end', () => {
    const bouncy = springEase({ stiffness: 16, damping: 0.2 });
    const soft = springEase({ stiffness: 8, damping: 1.1 });
    const samples = Array.from({ length: 80 }, (_, i) => i / 79);
    expect(Math.max(...samples.map(bouncy))).toBeGreaterThan(1.2);
    expect(Math.max(...samples.map(soft))).toBeLessThanOrEqual(1.001);
    expect(bouncy(1)).toBe(1);
    expect(Math.abs(bouncy(0.97) - 1)).toBeLessThan(0.08);
  });
});

describe('where easing is used', () => {
  it('keeps the old curves for the old names and uses the family for new ones', () => {
    expect(keyEase('ease-in', 0.5)).toBe(0.25);
    expect(keyEase('ease-in-out-cubic', 0.25)).toBeCloseTo(resolveEasing('ease-in-out-cubic')!(0.25), 10);
    expect(keyEase('spring', 0.4)).toBeCloseTo(resolveEasing('spring')!(0.4), 10);
    expect(ease('ease-out-expo', 0.5)).toBeCloseTo(1 - 2 ** -5, 10);
    expect(ease('ease-out-bounce', 0.9)).toBeGreaterThan(0.9);
  });
  it('accepts them in keyframes and in transitions', () => {
    const k = keyframesFromList([{ at: 0, scale: 1, easing: 'ease-out-back' }, { at: 1, scale: 2 }], 4)!;
    expect(k.scale![0]!.easing).toBe('ease-out-back');
    const r = normalizeSpec({ clips: [{ duration: 2, transition: { name: 'fade', duration: 0.5, easing: 'ease-in-out-quart' }, layers: [{ type: 'fill-color', color: '#fff' }] }, { duration: 2, layers: [{ type: 'fill-color', color: '#000' }] }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.spec.clips[0]!.transition!.easing).toBe('ease-in-out-quart');
  });
});

describe('stagger', () => {
  it('brings foreground layers in one after another, keeping a start that was named', async () => {
    const r = normalizeSpec({ clips: [{ duration: 6, stagger: 0.5, layers: [{ type: 'fill-color', color: '#111' }, { type: 'title', text: 'a' }, { type: 'title', text: 'b' }, { type: 'subtitle', text: 'c', start: 4 }, { type: 'shape', shape: 'rect' }] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spec.clips[0]!.layers.map(l => (l as { start: number }).start)).toEqual([0, 0, 0.5, 4, 1]);
  });
});
