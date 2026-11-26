import { describe, expect, it } from 'vitest';
import { COMPOSE_TOOL, LIMITS, composeFilename, describeSpec, ease, layerActive, layoutAt, normalizeSpec, resolveDurations, timeline, totalSeconds, type ComposeSpec } from '../compose-spec';

const ok = (raw: unknown): ComposeSpec => {
  const n = normalizeSpec(raw);
  if (!n.ok) throw new Error(n.errors.join(' | '));
  return n.spec;
};
const title = (text: string) => ({ type: 'title', text });

describe('normalizeSpec', () => {
  it('fills in the size, the rate, the transition and the colours', () => {
    const spec = ok({ clips: [{ duration: 3, layers: [{ type: 'fill-color' }, title('Hello')] }, { duration: 2, layers: [{ type: 'linear-gradient', colors: ['#fff', 'tomato'] }] }] });
    expect([spec.width, spec.height, spec.fps]).toEqual([1280, 720, 30]);
    expect(spec.clips[0]!.transition).toEqual({ name: 'fade', duration: 0.5, easing: 'ease-in-out' });
    expect(spec.clips[0]!.layers[0]).toMatchObject({ type: 'fill-color', color: '#000000' });
    expect(spec.clips[0]!.layers[1]).toMatchObject({ type: 'text', style: 'title', color: '#ffffff', position: { x: 0.5, y: 0.5 } });
    expect(spec.clips[1]!.layers[0]).toMatchObject({ type: 'gradient', kind: 'linear', colors: ['#fff', 'tomato'] });
    expect(spec.keepSourceAudio).toBe(true);
  });

  it('keeps the size even, within 1920 by 1080, and the rate within 30', () => {
    expect(ok({ width: 641, height: 361, fps: 60, clips: [{ duration: 1, layers: [{ type: 'fill-color' }] }] })).toMatchObject({ width: 642, height: 362, fps: 30 });
    const big = normalizeSpec({ width: 1920, height: 1920, clips: [{ duration: 1, layers: [{ type: 'fill-color' }] }] });
    expect(big.ok).toBe(false);
    expect(big.ok ? [] : big.errors[0]).toContain('larger than 1920×1080');
  });

  it('says what is wrong, part by part', () => {
    const n = normalizeSpec({ clips: [{ duration: 2, layers: [{ type: 'title' }, { type: 'image', url: 'http://x.test/a.png' }, { type: 'sparkle' }], transition: { name: 'spin' } }, { layers: [] }], audioTracks: [{ url: 'file:///c:/a.mp3' }] });
    expect(n.ok).toBe(false);
    const text = n.ok ? '' : n.errors.join('\n');
    expect(text).toContain('clip 1 layer 1 (title) needs text');
    expect(text).toContain('clip 1 layer 2 (image) needs an https address');
    expect(text).toContain('layer 3 has the type "sparkle"');
    expect(text).toContain('transition "spin"');
    expect(text).toContain('clip 2 needs layers');
    expect(text).toContain('audio track 1 needs an https address');
    expect(normalizeSpec(null).ok).toBe(false);
    expect(normalizeSpec({ clips: [] }).ok).toBe(false);
  });

  it('refuses a video longer than three minutes, more than 60 clips, and too much text', () => {
    const long = normalizeSpec({ clips: Array.from({ length: 5 }, () => ({ duration: 60, transition: { name: 'none' }, layers: [{ type: 'fill-color' }] })) });
    expect(long.ok).toBe(false);
    expect(long.ok ? '' : long.errors[0]).toContain('limit is 180 s');
    const many = normalizeSpec({ clips: Array.from({ length: 61 }, () => ({ duration: 1, layers: [{ type: 'fill-color' }] })) });
    expect(many.ok ? '' : many.errors.join()).toContain('at most 60 clips');
    const wordy = normalizeSpec({ clips: [{ duration: 1, layers: [title('x'.repeat(301))] }] });
    expect(wordy.ok ? '' : wordy.errors.join()).toContain('longer than 300');
    expect(LIMITS.maxSeconds).toBe(180);
  });

  it('lets a clip with a video take its length from it', () => {
    const spec = ok({ clips: [{ layers: [{ type: 'video', url: 'https://x.test/v.mp4', cutFrom: 2 }] }, { layers: [{ type: 'video', url: 'https://x.test/w.mp4', cutFrom: 1, cutTo: 4 }] }] });
    expect(spec.clips[0]!.duration).toBeUndefined();
    expect(timeline(spec)).toBeNull();
    const resolved = resolveDurations(spec, url => (url.endsWith('v.mp4') ? 10 : 99));
    expect(resolved.clips.map(c => c.duration)).toEqual([8, 3]);
    expect(totalSeconds(resolved)).toBeCloseTo(8 + 3 - 0.5, 5);
  });
});

describe('timeline and transitions', () => {
  const spec = ok({ width: 1000, height: 500, clips: [{ duration: 4, transition: { name: 'directional-left', duration: 1 }, layers: [{ type: 'fill-color' }] }, { duration: 4, transition: { name: 'none' }, layers: [{ type: 'fill-color' }] }, { duration: 2, layers: [{ type: 'fill-color' }] }] });

  it('overlaps a clip with the next by its transition, and not at all for none', () => {
    const t = timeline(spec)!;
    expect(t.starts).toEqual([0, 3, 7]);
    expect(t.overlaps).toEqual([1, 0, 0]);
    expect(t.total).toBe(9);
  });

  it('never lets a transition take more than half of a clip', () => {
    const short = ok({ clips: [{ duration: 1, transition: { name: 'fade', duration: 5 }, layers: [{ type: 'fill-color' }] }, { duration: 1, layers: [{ type: 'fill-color' }] }] });
    expect(timeline(short)!.overlaps[0]).toBe(0.5);
  });

  it('shows one clip, then two sliding past each other, then one', () => {
    expect(layoutAt(spec, 1).map(p => p.clip)).toEqual([0]);
    const mid = layoutAt(spec, 3.5);
    expect(mid.map(p => p.clip)).toEqual([0, 1]);
    expect(mid[0]!.dx).toBeCloseTo(-500, 0); // outgoing: half way off to the left (eased 0.5 is 0.5)
    expect(mid[1]!.dx).toBeCloseTo(500, 0); // incoming: half way in from the right
    expect(layoutAt(spec, 5).map(p => p.clip)).toEqual([1]);
    expect(layoutAt(spec, 9.5)).toEqual([]);
  });

  it('crossfades, dips through black and zooms', () => {
    const make = (name: string) => ok({ clips: [{ duration: 4, transition: { name, duration: 2, easing: 'linear' }, layers: [{ type: 'fill-color' }] }, { duration: 4, layers: [{ type: 'fill-color' }] }] });
    const fade = layoutAt(make('fade'), 3);
    expect(fade.map(p => p.alpha)).toEqual([1, 0.5]);
    const dip = layoutAt(make('fadeblack'), 2.5);
    expect(dip[0]!.dim).toBeCloseTo(0.5, 5);
    expect(dip[1]!.alpha).toBe(0);
    const late = layoutAt(make('fadeblack'), 3.5);
    expect(late[0]!.dim).toBe(1);
    expect(late[1]!.alpha).toBeCloseTo(0.5, 5);
    const zoom = layoutAt(make('zoom-in'), 3);
    expect(zoom[1]!.scale).toBeCloseTo(1.15, 5);
  });

  it('shows a layer only inside its own time', () => {
    const layer = ok({ clips: [{ duration: 5, layers: [{ type: 'fill-color', start: 1, stop: 3 }] }] }).clips[0]!.layers[0]!;
    expect([0.5, 1, 2, 3, 3.5].map(t => layerActive(layer, t, 5))).toEqual([false, true, true, true, false]);
  });
});

describe('easing and text', () => {
  it('runs from 0 to 1 for every curve, and is monotone for the plain ones', () => {
    for (const name of ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'ease-out-back']) {
      expect(ease(name, 0)).toBeCloseTo(0, 5);
      expect(ease(name, 1)).toBeCloseTo(1, 5);
    }
    expect(ease('ease-in-out', 0.5)).toBeCloseTo(0.5, 5);
    expect(ease('ease-in', 0.5)).toBeLessThan(0.5);
    expect(ease('ease-out', 0.5)).toBeGreaterThan(0.5);
    expect(ease('ease-out-back', 0.8)).toBeGreaterThan(1);
    expect(ease('linear', 2)).toBe(1);
  });

  it('describes a spec for the approval card, and names the file', () => {
    const spec = ok({ audioTracks: [{ url: 'https://x.test/a.mp3' }], clips: [{ duration: 3, layers: [{ type: 'fill-color' }, title('Launch day')] }, { duration: 3, layers: [{ type: 'image', url: 'https://x.test/a.png' }] }] });
    expect(describeSpec(spec)).toBe('2 clips, 5.5 s, 1280×720 at 30 frames per second; layers: fill-color, text, image; 1 audio track; text: "Launch day"');
    expect(composeFilename('demo.webm')).toBe('demo.webm');
    expect(composeFilename('../x.mp4')).toBe('xroga-video.mp4');
    expect(composeFilename('movie.exe')).toBe('xroga-video.mp4');
    expect(composeFilename(undefined)).toBe('xroga-video.mp4');
    expect(COMPOSE_TOOL.group).toBe('files');
  });
});
