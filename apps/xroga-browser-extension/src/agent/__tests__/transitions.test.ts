import { describe, expect, it } from 'vitest';
import { TRANSITION_NAMES, defaultEasing, hasRule, transitionColor, type Rgba, type Sampler } from '../transitions';

const RED: Rgba = [1, 0, 0, 1];
const BLUE: Rgba = [0, 0, 1, 1];
const solid = (c: Rgba): Sampler => () => c;
const ctx = (progress: number, from: Sampler = solid(RED), to: Sampler = solid(BLUE)) => ({ progress, ratio: 16 / 9, from, to });
const rules = TRANSITION_NAMES.filter(hasRule);
const grid = Array.from({ length: 12 }, (_, i) => Array.from({ length: 12 }, (_, j) => [(i + 0.5) / 12, (j + 0.5) / 12] as const)).flat();

describe('transitions', () => {
  it('has the set of transitions, plus names that cut', () => {
    expect(rules.length).toBeGreaterThanOrEqual(35);
    for (const n of ['fade', 'fadecolor', 'fadegrayscale', 'directional-left', 'circleopen', 'crosszoom', 'dreamyzoom', 'swirl', 'pixelize', 'windowslice', 'directionalwarp', 'crosswarp']) expect(rules).toContain(n);
    expect(TRANSITION_NAMES).toContain('dummy');
    expect(hasRule('dummy')).toBe(false);
  });

  it('shows only the outgoing picture at the start and only the incoming one at the end, for every rule', () => {
    for (const name of TRANSITION_NAMES) {
      for (const [u, v] of grid) {
        expect(transitionColor(name, u, v, ctx(0))).toEqual(RED);
        expect(transitionColor(name, u, v, ctx(1))).toEqual(BLUE);
      }
    }
  });

  it('stays between the two pictures while it runs (plain rules never invent colours), for every rule', () => {
    const dips = new Set(['fadecolor', 'fadegrayscale', 'flash', 'flip', 'filmburn', 'pageturn']);
    for (const name of rules.filter(n => !dips.has(n))) {
      for (const p of [0.2, 0.5, 0.8]) {
        for (const [u, v] of grid) {
          const [r, g, b] = transitionColor(name, u, v, ctx(p));
          expect(g, `${name} at ${p}`).toBeCloseTo(0, 5);
          expect(r + b, `${name} at ${p}`).toBeCloseTo(1, 5);
        }
      }
    }
  });

  it('has started by the half, for every rule: some pixel is no longer what the outgoing picture shows there', () => {
    // a picture with structure, so a zoom or a warp shows even where a flat colour would hide it
    const pattern: Sampler = (u, v) => (Math.floor(u * 8) + Math.floor(v * 8)) % 2 === 0 ? [1, 0, 0, 1] : [1, 1, 0, 1];
    const same = (a: Rgba, b: Rgba) => a.every((x, i) => Math.abs(x - b[i]!) < 1e-6);
    for (const name of rules) {
      const moved = grid.some(([u, v]) => !same(transitionColor(name, u, v, ctx(0.5, pattern)), pattern(u, v)));
      expect(moved, `${name} has not started by the half`).toBe(true);
    }
  });

  it('fades through black and through grey, and wipes in the named direction', () => {
    expect(transitionColor('fadecolor', 0.5, 0.5, ctx(0.5))).toEqual([0, 0, 0, 1]);
    const grey = transitionColor('fadegrayscale', 0.5, 0.5, ctx(0.5));
    expect(grey[0]).toBeCloseTo(grey[1], 5);
    expect(grey[1]).toBeCloseTo(grey[2], 5);
    // wiperight: the incoming picture grows from the left edge
    expect(transitionColor('wiperight', 0.1, 0.5, ctx(0.5))).toEqual(BLUE);
    expect(transitionColor('wiperight', 0.9, 0.5, ctx(0.5))).toEqual(RED);
    expect(transitionColor('wipeleft', 0.9, 0.5, ctx(0.5))).toEqual(BLUE);
    expect(transitionColor('wipedown', 0.5, 0.1, ctx(0.5))).toEqual(BLUE);
    expect(transitionColor('wipeup', 0.5, 0.9, ctx(0.5))).toEqual(BLUE);
    // circleopen opens from the centre
    expect(transitionColor('circleopen', 0.5, 0.5, ctx(0.3))).toEqual(BLUE);
    expect(transitionColor('circleopen', 0.02, 0.02, ctx(0.3))).toEqual(RED);
  });

  it('slides: the directional ones move the outgoing picture out and the incoming one in', () => {
    const left = (x: number): Rgba => (x < 0.5 ? [1, 0, 0, 1] : [0, 1, 0, 1]);
    const from: Sampler = u => left(u);
    const to = solid(BLUE);
    const c = transitionColor('directional-left', 0.25, 0.5, { progress: 0.5, ratio: 1, from, to });
    // at u 0.25 with progress 0.5 the outgoing picture is read at 0.75 (moved left)
    expect(c).toEqual([0, 1, 0, 1]);
    expect(transitionColor('directional-left', 0.8, 0.5, { progress: 0.5, ratio: 1, from, to })).toEqual(BLUE);
  });

  it('uses a strong ease-out for the slides and a plain line for the rest, and cuts for an unknown name', () => {
    expect(defaultEasing('directional-left')).toBe('ease-out-expo');
    expect(defaultEasing('fade')).toBe('linear');
    expect(transitionColor('dummy', 0.5, 0.5, ctx(0.4))).toEqual(RED);
    expect(transitionColor('dummy', 0.5, 0.5, ctx(0.6))).toEqual(BLUE);
    expect(transitionColor('nonsense', 0.5, 0.5, ctx(0.6))).toEqual(BLUE);
  });
});
