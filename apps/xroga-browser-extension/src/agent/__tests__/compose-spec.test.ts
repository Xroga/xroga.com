import { describe, expect, it } from 'vitest';
import { COMPOSE_TOOL, LIMITS, composeFilename, filterOf, layerAlpha, describeSpec, ease, layerActive, layoutAt, normalizeSpec, resolveDurations, timeline, totalSeconds, type ComposeSpec } from '../compose-spec';

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
    expect(spec.clips[0]!.transition).toEqual({ name: 'fade', duration: 0.5, easing: 'linear', audioOutCurve: 'tri', audioInCurve: 'tri' });
    expect(spec.clips[0]!.layers[0]).toMatchObject({ type: 'fill-color', color: expect.stringMatching(/^#[0-9a-f]{6}$/i) }); // editly picks a colour when none is given
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
    const n = normalizeSpec({ clips: [{ duration: 2, layers: [{ type: 'title' }, { type: 'image', url: 'http://x.test/a.png' }, { type: 'sparkle' }], transition: { name: 'sparkle-wipe' } }, { layers: [] }], audioTracks: [{ url: 'file:///c:/a.mp3' }] });
    expect(n.ok).toBe(false);
    const text = n.ok ? '' : n.errors.join('\n');
    expect(text).toContain('clip 1 layer 1 (title) needs text');
    expect(text).toContain('clip 1 layer 2 (image) needs an https address');
    expect(text).toContain('layer 3 has the type "sparkle"');
    expect(text).toContain('transition "sparkle-wipe"');
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

  it('speeds a video layer up or down, within 0.25 to 4, and its clip follows', () => {
    const spec = ok({ clips: [{ layers: [{ type: 'video', url: 'https://x.test/v.mp4', cutFrom: 0, cutTo: 8, speed: 2 }] }, { layers: [{ type: 'video', url: 'https://x.test/v.mp4', cutFrom: 0, cutTo: 4, speed: 0.5 }] }, { layers: [{ type: 'video', url: 'https://x.test/v.mp4', cutFrom: 0, cutTo: 4, speed: 99 }] }, { layers: [{ type: 'video', url: 'https://x.test/v.mp4', cutFrom: 0, cutTo: 4 }] }] });
    expect(spec.clips.map(c => (c.layers[0] as { speed: number }).speed)).toEqual([2, 0.5, 4, undefined]); // 1 when resolved, below
    expect(resolveDurations(spec, () => 99).clips.map(c => c.duration)).toEqual([4, 8, 1, 4]);
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

  it('shows a layer only inside its own time', () => {
    const layer = ok({ clips: [{ duration: 5, layers: [{ type: 'fill-color', start: 1, stop: 3 }] }] }).clips[0]!.layers[0]!;
    expect([0.5, 1, 2, 3, 3.5].map(t => layerActive(layer, t, 5))).toEqual([false, true, true, true, false]);
  });
});

describe('layer look', () => {
  it('builds a filter from named numbers only, within range, and ignores everything else', () => {
    expect(filterOf({ brightness: 1.2, contrast: 9, saturation: 0, blur: 3, grayscale: 1, hue: 400 })).toBe('brightness(1.2) contrast(3) saturate(0) blur(3px) grayscale(1) hue-rotate(360deg)');
    expect(filterOf({ blur: 'url(javascript:1)', drop: 5, sepia: 0.5 })).toBe('sepia(0.5)');
    expect(filterOf('blur(5px)')).toBe('');
    expect(filterOf(undefined)).toBe('');
  });

  it('fades a layer in and out inside its own run, and scales it by its opacity', () => {
    const l = { opacity: 0.5, fadeIn: 1, fadeOut: 2 };
    expect(layerAlpha(l, 0, 10)).toBe(0);
    expect(layerAlpha(l, 0.5, 10)).toBeCloseTo(0.25, 5);
    expect(layerAlpha(l, 5, 10)).toBe(0.5);
    expect(layerAlpha(l, 9, 10)).toBeCloseTo(0.25, 5);
    expect(layerAlpha({ opacity: 1, fadeIn: 0, fadeOut: 0 }, 3, 5)).toBe(1);
  });

  it('carries opacity, fades, effects and the font from the description to every layer', () => {
    const spec = ok({ clips: [{ duration: 4, layers: [{ type: 'fill-color', opacity: 2, fadeIn: 0.5, effects: { blur: 4 } }, { type: 'title', text: 'Hi', font: 'serif', fadeOut: 1 }, { type: 'title', text: 'Hi', font: 'wingdings' }] }] });
    const [a, b, c] = spec.clips[0]!.layers as unknown as Array<{ opacity: number; fadeIn: number; fadeOut: number; filter: string; font?: string }>;
    expect([a!.opacity, a!.fadeIn, a!.filter]).toEqual([1, 0.5, 'blur(4px)']);
    expect([b!.font, b!.fadeOut]).toEqual(['serif', 1]);
    expect(c!.font).toBe('sans');
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
