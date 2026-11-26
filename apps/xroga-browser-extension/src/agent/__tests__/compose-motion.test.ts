import { describe, expect, it } from 'vitest';
import { buildPlayback } from '../compose-playback';
import { NO_MOTION, backOut, evaluateKeyframes, keyEase, keyframesFromList, motionAt, presetPose, type Keyframe } from '../compose-motion';

const kf = (time: number, value: number, easing: Keyframe['easing'] = 'linear'): Keyframe => ({ time, value, easing });

describe('keyframes', () => {
  it('runs between keyframes on the easing of the one before, and holds the ends', () => {
    const list = [kf(0, 0), kf(2, 10, 'ease-in'), kf(4, 20)];
    expect(evaluateKeyframes(list, -1)).toBe(0);
    expect(evaluateKeyframes(list, 1)).toBe(5);
    expect(evaluateKeyframes(list, 3)).toBeCloseTo(10 + 10 * keyEase('ease-in', 0.5), 6);
    expect(evaluateKeyframes(list, 9)).toBe(20);
    expect(evaluateKeyframes([kf(0, 1, 'hold'), kf(5, 9)], 4)).toBe(1);
    expect(() => evaluateKeyframes([], 1)).toThrow();
  });

  it('reads the friendly list into one sorted list per property, ignoring what is not a number', () => {
    const k = keyframesFromList([{ at: 2, x: 0.2, opacity: 1 }, { at: 0, x: -0.2, scale: 1, rotation: 0, easing: 'ease-out' }, { at: 'soon', x: 5 }, { at: 1, y: 'up' }], 5)!;
    expect(k.x!.map(e => [e.time, e.value])).toEqual([[0, -0.2], [2, 0.2]]);
    expect(k.x![0]!.easing).toBe('ease-out');
    expect(k.opacity).toHaveLength(1);
    expect(k.y).toBeUndefined();
    expect(keyframesFromList([{ at: 1 }], 5)).toBeUndefined();
    expect(keyframesFromList('no', 5)).toBeUndefined();
  });
});

describe('presets', () => {
  it('start off and end at rest, slide in from the named side and out the other way', () => {
    for (const p of ['fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'zoom', 'pop'] as const) {
      const rest = presetPose(p, 1, 'in');
      expect(rest.dx).toBeCloseTo(0, 6);
      expect(rest.dy).toBeCloseTo(0, 6);
      expect(rest.scale).toBeCloseTo(1, 6);
      expect(rest.opacity).toBeCloseTo(1, 6);
      expect(presetPose(p, 0, 'in').opacity).toBeCloseTo(0, 6);
    }
    expect(presetPose('slide-left', 0, 'in').dx).toBeGreaterThan(0); // comes from the right, moving left
    expect(presetPose('slide-left', 0, 'out').dx).toBeLessThan(0); // and leaves to the left
    expect(presetPose('slide-down', 0, 'in').dy).toBeLessThan(0);
    expect(presetPose('zoom', 0, 'in').scale).toBeCloseTo(0.5, 6);
    expect(presetPose('pop', 0, 'in').scale).toBeCloseTo(0.3, 6);
    expect(Math.max(...Array.from({ length: 21 }, (_, i) => presetPose('pop', i / 20, 'in').scale))).toBeGreaterThan(1.05);
    expect(backOut(1)).toBeCloseTo(1, 6);
  });

  it('combines keyframes with an entrance and an exit, and is still outside them', () => {
    const layer = { keyframes: { x: [kf(0, 0), kf(4, 0.4)] }, animIn: { preset: 'fade' as const, duration: 1 }, animOut: { preset: 'zoom' as const, duration: 1 } };
    expect(motionAt(layer, 2, 4)).toMatchObject({ dx: 0.2, opacity: 1, scale: 1 });
    expect(motionAt(layer, 0, 4).opacity).toBeCloseTo(0, 6);
    expect(motionAt(layer, 0.5, 4).opacity).toBeGreaterThan(0.5);
    expect(motionAt(layer, 4, 4).scale).toBeCloseTo(0.5, 6);
    expect(motionAt({}, 1, 4)).toEqual(NO_MOTION);
  });
});

describe('how a video layer plays', () => {
  it('plays a cut of the file at its own speed, and takes cut-outs out of it', () => {
    const p = buildPlayback({ cutFrom: 10, cutTo: 20, speed: 1 });
    expect([p.content, p.length, p.sourceAt(0), p.sourceAt(3), p.sourceAt(10)]).toEqual([10, 10, 10, 13, 20]);
    const cut = buildPlayback({ cutFrom: 10, cutTo: 20, speed: 1, cuts: [{ start: 12, end: 14 }, { start: 18, end: 25 }] });
    expect(cut.segments).toEqual([{ start: 10, end: 12 }, { start: 14, end: 18 }]);
    expect(cut.content).toBe(6);
    expect(cut.sourceAt(1)).toBe(11);
    expect(cut.sourceAt(2)).toBe(12); // the end of the first piece; the next picture is from the second
    expect(cut.sourceAt(2.5)).toBe(14.5);
    expect(cut.pieces).toEqual([{ from: 10, to: 12, reversed: false, at: 0, factor: 1 }, { from: 14, to: 18, reversed: false, at: 2, factor: 1 }]);
  });

  it('runs faster or slower and says how long the layer then lasts', () => {
    const fast = buildPlayback({ cutFrom: 0, cutTo: 8, speed: 2 });
    expect([fast.length, fast.sourceAt(2)]).toEqual([4, 4]);
    expect(buildPlayback({ cutFrom: 0, cutTo: 4, speed: 0.5 }).length).toBe(8);
  });

  it('runs backwards, and in reverse the cut-outs and the audio pieces are reversed with it', () => {
    const r = buildPlayback({ cutFrom: 0, cutTo: 10, speed: 1, reverse: true });
    expect([r.sourceAt(0), r.sourceAt(2), r.sourceAt(10)]).toEqual([10, 8, 0]);
    const rc = buildPlayback({ cutFrom: 0, cutTo: 10, speed: 1, reverse: true, cuts: [{ start: 4, end: 6 }] });
    expect(rc.pieces.map(p => [p.from, p.to, p.reversed])).toEqual([[6, 10, true], [0, 4, true]]);
    expect(rc.sourceAt(1)).toBe(9);
    expect(rc.sourceAt(5)).toBeCloseTo(3, 6); // 4 s of the later piece, then 1 s into the earlier one from its end
  });

  it('holds one picture still for a while and carries on after it', () => {
    const f = buildPlayback({ cutFrom: 0, cutTo: 10, speed: 1, freeze: { at: 4, hold: 3 } });
    expect(f.length).toBe(13);
    expect([f.sourceAt(3), f.sourceAt(4), f.sourceAt(6.9), f.sourceAt(7), f.sourceAt(8)]).toEqual([3, 4, 4, 4, 5]);
    expect(f.silence).toEqual({ at: 4, content: 3 });
    // at double speed the held picture still lasts the asked time of the finished video
    const fast = buildPlayback({ cutFrom: 0, cutTo: 10, speed: 2, freeze: { at: 4, hold: 1 } });
    expect(fast.length).toBe(5 + 1);
    expect(buildPlayback({ cutFrom: 0, cutTo: 10, speed: 1, freeze: { at: 4, hold: 0 } }).silence).toBeUndefined();
  });

  it('keeps something of the file even when every part is cut', () => {
    const all = buildPlayback({ cutFrom: 0, cutTo: 5, speed: 1, cuts: [{ start: 0, end: 5 }] });
    expect(all.segments).toHaveLength(1);
    expect(all.content).toBeGreaterThan(0);
  });
});

describe('where a moment of the file falls on the layer', () => {
  it('follows the cuts, the speed and a freeze, and is null for what was cut or played backwards', async () => {
    const { layerTimeOf } = await import('../compose-playback');
    const pb = buildPlayback({ cutFrom: 10, cutTo: 20, speed: 1, cuts: [{ start: 12, end: 14 }] });
    expect(layerTimeOf(pb, 11, 1, false)).toBe(1);
    expect(layerTimeOf(pb, 13, 1, false)).toBeNull();
    expect(layerTimeOf(pb, 15, 1, false)).toBe(3); // 2 s of the first piece, 1 s into the second
    const fast = buildPlayback({ cutFrom: 0, cutTo: 10, speed: 2 });
    expect(layerTimeOf(fast, 6, 2, false)).toBe(3);
    const frozen = buildPlayback({ cutFrom: 0, cutTo: 10, speed: 1, freeze: { at: 4, hold: 3 } });
    expect(layerTimeOf(frozen, 3, 1, false, { at: 4, hold: 3 })).toBe(3);
    expect(layerTimeOf(frozen, 6, 1, false, { at: 4, hold: 3 })).toBe(9);
    expect(layerTimeOf(buildPlayback({ cutFrom: 0, cutTo: 5, speed: 1, reverse: true }), 2, 1, true)).toBeNull();
    expect(layerTimeOf(pb, 25, 1, false)).toBeNull();
  });
});

describe('zoom on clicks', () => {
  it('zooms in before a click, holds, and goes back out; the clicked point moves toward the middle', async () => {
    const { zoomKeyframes } = await import('../compose-motion');
    const k = zoomKeyframes([{ t: 5, x: 0.8, y: 0.3 }], { scale: 2, lead: 0.5, hold: 1, out: 0.5 })!;
    expect(evaluateKeyframes(k.scale!, 0)).toBe(1);
    expect(evaluateKeyframes(k.scale!, 4.5)).toBeCloseTo(1, 6);
    expect(evaluateKeyframes(k.scale!, 5)).toBe(2);
    expect(evaluateKeyframes(k.scale!, 5.9)).toBe(2);
    expect(evaluateKeyframes(k.scale!, 6.5)).toBeCloseTo(1, 6);
    expect(evaluateKeyframes(k.scale!, 10)).toBe(1);
    // a point right of centre moves the picture left (negative shift), one above centre moves it down
    expect(evaluateKeyframes(k.x!, 5)).toBeLessThan(0);
    expect(evaluateKeyframes(k.y!, 5)).toBeGreaterThan(0);
    // never past the edge the zoom allows: (scale - 1) / 2
    expect(Math.abs(evaluateKeyframes(k.x!, 5))).toBeLessThanOrEqual(0.5 + 1e-9);
    const motion = motionAt({ keyframes: k }, 5, 20);
    expect(motion.scale).toBe(2);
  });

  it('shares one zoom between clicks close together, and starts a new one for a later click', async () => {
    const { zoomKeyframes } = await import('../compose-motion');
    const k = zoomKeyframes([{ t: 3, x: 0.2, y: 0.5 }, { t: 4, x: 0.7, y: 0.5 }, { t: 12, x: 0.5, y: 0.5 }], { scale: 2, lead: 0.5, hold: 1, out: 0.5, merge: 1.5 })!;
    expect(evaluateKeyframes(k.scale!, 3.5)).toBe(2);
    expect(evaluateKeyframes(k.scale!, 4)).toBe(2);
    expect(evaluateKeyframes(k.scale!, 8)).toBe(1); // back out between the two groups
    expect(evaluateKeyframes(k.scale!, 12)).toBe(2);
    // the zoom moves from the first point (left: picture shifts right) to the second (right: shifts left)
    expect(evaluateKeyframes(k.x!, 3)).toBeGreaterThan(0);
    expect(evaluateKeyframes(k.x!, 4)).toBeLessThan(0);
    expect(zoomKeyframes([])).toBeUndefined();
    expect(zoomKeyframes([{ t: -1, x: 0.5, y: 0.5 }])).toBeUndefined();
  });
});

describe('zoom over stated stretches', () => {
  it('zooms in over the ramp, holds to the end of the stretch, and goes back out', async () => {
    const { zoomRangeKeyframes } = await import('../compose-motion');
    const k = zoomRangeKeyframes([{ from: 10, to: 16, x: 0.3, y: 0.5, scale: 1.8 }], { ramp: 0.6 })!;
    expect(evaluateKeyframes(k.scale!, 9)).toBe(1);
    expect(evaluateKeyframes(k.scale!, 10.6)).toBeCloseTo(1.8, 6);
    expect(evaluateKeyframes(k.scale!, 15)).toBeCloseTo(1.8, 6);
    expect(evaluateKeyframes(k.scale!, 16.6)).toBeCloseTo(1, 6);
    expect(evaluateKeyframes(k.x!, 12)).toBeGreaterThan(0); // a point left of the middle brings the picture to the right
  });

  it('moves from one focal point to the next without zooming out between, and zooms out between stretches that are far apart', async () => {
    const { zoomRangeKeyframes } = await import('../compose-motion');
    const near = zoomRangeKeyframes([{ from: 2, to: 8, x: 0.28, y: 0.48 }, { from: 8.2, to: 14, x: 0.3, y: 0.68 }], { scale: 1.8, ramp: 0.6, join: 0.4 })!;
    expect(evaluateKeyframes(near.scale!, 8.1)).toBeCloseTo(1.8, 6); // still zoomed between them
    expect(evaluateKeyframes(near.y!, 7)).toBeGreaterThan(evaluateKeyframes(near.y!, 13)); // the view has moved down to the second point (the picture shifts up)
    const far = zoomRangeKeyframes([{ from: 2, to: 6, x: 0.5, y: 0.5 }, { from: 20, to: 24, x: 0.5, y: 0.5 }], { ramp: 0.6 })!;
    expect(evaluateKeyframes(far.scale!, 12)).toBe(1);
    expect(zoomRangeKeyframes([{ from: 5, to: 4, x: 0.5, y: 0.5 }])).toBeUndefined();
    expect(zoomRangeKeyframes([])).toBeUndefined();
  });
});

describe('speed ranges on a playback', () => {
  it('plays a stretch of the file at its own speed and the length follows', () => {
    // 10 s file: 0-4 normal, 4-6 at half speed, 6-10 normal -> 4 + 4 + 4 = 12 s
    const pb = buildPlayback({ cutFrom: 0, cutTo: 10, speed: 1, speedRanges: [{ start: 4, end: 6, speed: 0.5 }] });
    expect(pb.ramped).toBe(true);
    expect(pb.length).toBeCloseTo(12, 6);
    expect(pb.sourceAt(2)).toBeCloseTo(2, 6);
    expect(pb.sourceAt(6)).toBeCloseTo(5, 6); // 2 s into the slow stretch = 1 s of file
    expect(pb.sourceAt(8)).toBeCloseTo(6, 6);
    expect(pb.sourceAt(11)).toBeCloseTo(9, 6);
    expect(pb.finishedAt(5)).toBeCloseTo(6, 6);
    expect(pb.pieces.map(p => p.factor)).toEqual([1, 0.5, 1]);
  });
  it('multiplies with the layer speed, runs backwards and holds a freeze', () => {
    const fast = buildPlayback({ cutFrom: 0, cutTo: 8, speed: 2, speedRanges: [{ start: 0, end: 4, speed: 2 }] });
    expect(fast.length).toBeCloseTo(1 + 2, 6); // 4 s at x4, 4 s at x2
    const back = buildPlayback({ cutFrom: 0, cutTo: 6, speed: 1, reverse: true, speedRanges: [{ start: 0, end: 2, speed: 2 }] });
    expect(back.length).toBeCloseTo(5, 6);
    expect(back.sourceAt(0)).toBeCloseTo(6, 6);
    const held = buildPlayback({ cutFrom: 0, cutTo: 10, speed: 1, freeze: { at: 5, hold: 2 }, speedRanges: [{ start: 6, end: 10, speed: 2 }] });
    expect(held.length).toBeCloseTo(5 + 2 + 1 + 2, 6);
    expect(held.sourceAt(6)).toBeCloseTo(5, 6);
    expect(held.sourceAt(7)).toBeCloseTo(5, 6);
    expect(held.sourceAt(8)).toBeCloseTo(6, 6);
    expect(held.sourceAt(9)).toBeCloseTo(8, 6);
  });
  it('keeps the old maths when there are no ranges', () => {
    const pb = buildPlayback({ cutFrom: 0, cutTo: 10, speed: 2, cuts: [{ start: 2, end: 4 }], freeze: { at: 3, hold: 1 } });
    expect(pb.ramped).toBe(false);
    expect(pb.length).toBeCloseTo(4 + 1, 6);
    expect(pb.sourceAt(0.5)).toBeCloseTo(1, 6);
  });
});
