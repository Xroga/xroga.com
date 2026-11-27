import { describe, expect, it } from 'vitest';
import { DEFAULT_ACCENT, TEMPLATES, activeWordAt, dbToGain, duckCurve, expandTemplate, layoutWords, speechRanges, templateColors, wordsOnClipTime, type Brand } from '../compose-extras';

describe('caption layout', () => {
  const measure = (s: string) => s.length * 10;

  it('wraps words greedily and keeps each word where it falls in the line', () => {
    const lines = layoutWords(['one', 'two', 'three', 'four'], measure, 100);
    expect(lines.map(l => l.words.map(w => w.text))).toEqual([['one', 'two'], ['three', 'four']]);
    expect(lines[0]!.words.map(w => [w.index, w.x])).toEqual([[0, 0], [1, 40]]);
    expect(lines[0]!.width).toBe(70);
    expect(layoutWords([], measure, 100)).toEqual([]);
    expect(layoutWords(['enormousword'], measure, 50).map(l => l.words.length)).toEqual([1]);
  });

  it('lights the word being said, holds it over a short gap, and none in a long silence', () => {
    const words = [{ start: 0, end: 0.4 }, { start: 0.45, end: 0.9 }, { start: 3, end: 3.4 }];
    expect(activeWordAt(words, 0.2)).toBe(0);
    expect(activeWordAt(words, 0.42)).toBe(0); // the gap is shorter than the hold
    expect(activeWordAt(words, 0.6)).toBe(1);
    expect(activeWordAt(words, 1.0)).toBe(1);
    expect(activeWordAt(words, 2)).toBe(-1);
    expect(activeWordAt(words, 3.1)).toBe(2);
    expect(activeWordAt([], 1)).toBe(-1);
  });

  it('puts the words of a source on the time of a clip: offset, speed, and only the part used', () => {
    const words = [{ text: 'a', start: 1, end: 1.5 }, { text: 'b', start: 5, end: 5.5 }, { text: 'c', start: 20, end: 20.5 }];
    expect(wordsOnClipTime(words, { from: 4, to: 10, offset: 2, speed: 1 })).toEqual([{ text: 'b', start: 3, end: 3.5 }]);
    expect(wordsOnClipTime(words, { from: 0, to: 10, offset: 0, speed: 2 }).map(w => [w.text, w.start])).toEqual([['a', 0.5], ['b', 2.5]]);
  });
});

describe('ducking', () => {
  it('finds speech above the threshold and closes short pauses', () => {
    const quiet = 0.0005; // -66 dB
    const loud = 0.1; // -20 dB
    const rms = [quiet, loud, loud, quiet, loud, quiet, quiet, quiet, quiet, quiet, quiet, loud];
    const ranges = speechRanges(rms, 0.5, { gap: 0.6 });
    expect(ranges).toEqual([{ start: 0.5, end: 2.5 }, { start: 5.5, end: 6 }]);
    expect(speechRanges([quiet, quiet], 0.5)).toEqual([]);
  });

  it('lowers the music in speech by the amount, with a ramp before and after', () => {
    const curve = duckCurve([{ start: 4, end: 6 }], 10, 101, { amountDb: -12, attack: 0.5, release: 1 });
    expect(curve[0]).toBe(1);
    expect(curve[50]).toBeCloseTo(dbToGain(-12), 5);
    expect(curve[100]).toBe(1);
    expect(curve[34]).toBe(1); // 3.4 s: the attack of 0.5 s has not started
    expect(curve[38]).toBeGreaterThan(dbToGain(-12) + 0.1); // 3.8 s: part way down
    expect(curve[38]).toBeLessThan(0.9);
    expect(curve[37]).toBeGreaterThan(curve[38]!);
    // coming back takes the release time
    expect(curve[65]).toBeGreaterThan(dbToGain(-12));
    expect(curve[65]).toBeLessThan(1);
    expect(curve[72]).toBe(1);
    expect(duckCurve([], 10, 5)).toEqual(new Float32Array(5).fill(1));
  });
});

describe('brand and graphics', () => {
  const brand: Brand = { colors: { primary: '#aa0000', accent: '#00aa00', text: '#eeeeee' }, font: 'serif', logo: { url: 'https://x.test/logo.png', position: 'bottom-right', width: 0.1, opacity: 0.8, everywhere: true } };

  it('takes colours from the call, then the brand, then the defaults, a bar from the primary and an outline from the accent', () => {
    expect(templateColors('banner', brand, {})).toEqual({ accent: '#aa0000', text: '#eeeeee' });
    expect(templateColors('callout', brand, {})).toEqual({ accent: '#00aa00', text: '#eeeeee' });
    expect(templateColors('banner', undefined, {})).toEqual({ accent: DEFAULT_ACCENT, text: '#ffffff' });
    expect(templateColors('banner', brand, { accentColor: '#123456', textColor: '#000' })).toEqual({ accent: '#123456', text: '#000' });
  });

  it('expands every template into layers: shapes first, text on top, timed from the template', () => {
    for (const template of TEMPLATES.filter(t => t !== 'logo')) {
      const out = expandTemplate({ template, text: 'Hello', subtitle: 'World', start: 2, duration: 5 }, brand);
      expect(Array.isArray(out), template).toBe(true);
      const layers = out as Array<Record<string, unknown>>;
      expect(layers.length).toBeGreaterThanOrEqual(2);
      expect(layers[0]!.type, template).toBe('shape');
      for (const l of layers) {
        expect([l.start, l.stop], template).toEqual([2, 7]);
        expect(l.animationIn, template).toBeDefined();
      }
      expect(layers.some(l => l.type === 'title' || l.type === 'news-title'), template).toBe(true);
    }
    const lower = expandTemplate({ template: 'lower-third', text: 'Ada', subtitle: 'Engineer' }, brand) as Array<Record<string, unknown>>;
    expect(lower[0]).toMatchObject({ color: '#aa0000e6', originX: 'left', originY: 'bottom' });
    expect(lower.map(l => l.text).filter(Boolean)).toEqual(['Ada', 'Engineer']);
    expect(lower[1]!.font).toBe('serif');
    expect((expandTemplate({ template: 'banner', text: 'News', subtitle: 'Today' }, undefined) as Array<Record<string, unknown>>)[1]!.text).toBe('News · Today');
  });

  it('places the logo from the brand, and says what is missing or unknown', () => {
    const logo = expandTemplate({ template: 'logo', start: 0 }, brand) as Array<Record<string, unknown>>;
    expect(logo[0]).toMatchObject({ type: 'image-overlay', url: 'https://x.test/logo.png', position: 'bottom-right', opacity: 0.8 });
    expect(expandTemplate({ template: 'logo' }, undefined)).toEqual({ error: 'the logo template needs a logo: give url, or set brand.logo.' });
    expect(expandTemplate({ template: 'title' }, brand)).toEqual({ error: 'the title template needs text.' });
    expect(expandTemplate({ template: 'carousel', text: 'x' }, brand)).toMatchObject({ error: expect.stringContaining('is not one of') });
  });
});

describe('grounding grid', () => {
  it('names cells like a spreadsheet and finds their middle', async () => {
    const { cellName, cellCenter } = await import('../compose-extras');
    expect(cellName(0, 0)).toBe('A1');
    expect(cellName(2, 2)).toBe('C3');
    expect(cellCenter('A1')).toEqual({ x: 0.167, y: 0.167 });
    expect(cellCenter('b2')).toEqual({ x: 0.5, y: 0.5 });
    expect(cellCenter('C3')).toEqual({ x: 0.833, y: 0.833 });
    expect(cellCenter('D1')).toBeNull();
    expect(cellCenter('A4')).toBeNull();
    expect(cellCenter('x')).toBeNull();
    expect(cellCenter('D4', 4)).toEqual({ x: 0.875, y: 0.875 });
  });
});

describe('zooms and cells on a video layer', () => {
  it('turns zooms with a named cell into keyframes, and clicks with a cell into a zoom', async () => {
    const { normalizeSpec } = await import('../compose-spec');
    const spec = {
      clips: [{ duration: 10, layers: [{ type: 'video', url: 'https://example.com/a.mp4', zooms: [{ from: 1, to: 3, cell: 'C1', scale: 2 }, { from: 3.2, to: 5, cell: 'A3', scale: 2 }] }, { type: 'video', url: 'https://example.com/b.mp4', zoomOnClicks: { clicks: [{ t: 2, cell: 'B2' }] } }] }],
    };
    const r = normalizeSpec(spec);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [a, b] = r.spec.clips[0]!.layers as Array<{ keyframes?: { scale?: unknown } }>;
    expect(a!.keyframes?.scale).toBeTruthy();
    expect(b!.keyframes?.scale).toBeTruthy();
  });
  it('refuses zooms that make no sense', async () => {
    const { normalizeSpec } = await import('../compose-spec');
    const r = normalizeSpec({ clips: [{ duration: 4, layers: [{ type: 'video', url: 'https://example.com/a.mp4', zooms: [{ from: 3, to: 1, cell: 'B2' }] }] }] });
    expect(r.ok).toBe(false);
  });
});

describe('frames around pictures', () => {
  it('reads mask, radius and shadow', async () => {
    const { frameOf } = await import('../compose-spec');
    expect(frameOf({})).toBeUndefined();
    expect(frameOf({ mask: 'circle' })).toEqual({ radius: 0.5 });
    expect(frameOf({ radius: 9 })).toEqual({ radius: 0.5 });
    expect(frameOf({ mask: 'rounded', shadow: true })?.shadow?.blur).toBe(24);
    expect(frameOf({ shadow: { blur: 500, opacity: 3 } })?.shadow).toEqual({ blur: 80, offsetY: 8, opacity: 1 });
  });
  it('keeps the frame on a normalized video layer', async () => {
    const { normalizeSpec } = await import('../compose-spec');
    const r = normalizeSpec({ clips: [{ duration: 3, layers: [{ type: 'video', url: 'https://example.com/a.mp4', mask: 'circle', width: 0.25, height: 0.25, x: 0.85, y: 0.8, shadow: true }] }] });
    expect(r.ok).toBe(true);
    if (r.ok) expect((r.spec.clips[0]!.layers[0] as { frame?: { radius: number } }).frame?.radius).toBe(0.5);
  });
});

describe('speed ranges in a spec', () => {
  it('reads them and fits the clip to the stretched length', async () => {
    const { normalizeSpec, resolveDurations } = await import('../compose-spec');
    const r = normalizeSpec({ clips: [{ layers: [{ type: 'video', url: 'https://example.com/a.mp4', cutTo: 10, speedRanges: [{ from: 4, to: 6, speed: 0.5 }, { from: 9, to: 3, speed: 2 }, { from: 0, to: 1, speed: -1 }] }] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.spec.clips[0]!.layers[0] as { speedRanges?: unknown[] };
    expect(v.speedRanges).toHaveLength(1);
    const done = resolveDurations(r.spec, () => 10);
    expect(done.clips[0]!.duration).toBeCloseTo(12, 5);
  });
});

describe('the look of a title', () => {
  it('reads weight, italic, stroke, box and typewriter', async () => {
    const { lookOf } = await import('../compose-spec');
    expect(lookOf({})).toBeUndefined();
    expect(lookOf({ bold: true, italic: true, typewriter: true })).toEqual({ weight: 800, italic: true, typewriter: true });
    expect(lookOf({ weight: 640, stroke: { color: '#fff', width: 5 } })).toEqual({ weight: 600, stroke: { color: '#fff', width: 0.2 } });
    expect(lookOf({ shadow: false, box: { color: '#123456', padding: 5 } })?.box).toEqual({ color: '#123456', padding: 1, radius: 0.25 });
  });
});

describe('fx on sounds in a spec', () => {
  it('keeps the treatment on tracks, audio layers and video layers', async () => {
    const { normalizeSpec } = await import('../compose-spec');
    const r = normalizeSpec({
      audioTracks: [{ url: 'https://example.com/m.mp3', fx: { eq: 'warm', reverb: true } }],
      clips: [{ duration: 4, layers: [{ type: 'video', url: 'https://example.com/a.mp4', fx: { denoise: { focus: 'hum' }, compressor: true } }, { type: 'detached-audio', url: 'https://example.com/s.mp3', fx: { gain: -6 } }] }],
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spec.audioTracks[0]!.fx?.reverb).toBeTruthy();
    const [v, a] = r.spec.clips[0]!.layers as Array<{ fx?: { denoise?: { focus: string }; gain?: number } }>;
    expect(v!.fx?.denoise?.focus).toBe('hum');
    expect(a!.fx?.gain).toBe(-6);
  });
});

describe('named speed curves', () => {
  it('turn into ranges over the cut, slow in the middle for a hero moment', async () => {
    const { presetRanges } = await import('../compose-playback');
    const r = presetRanges('hero-moment', 10, 20, 10);
    expect(r).toHaveLength(10);
    expect(r[0]!.start).toBe(10);
    expect(r[9]!.end).toBe(20);
    expect(Math.min(...r.map(x => x.speed))).toBeLessThanOrEqual(0.25);
    expect(r[0]!.speed).toBeGreaterThan(r[4]!.speed);
    expect(presetRanges('nonsense', 0, 10)).toEqual([]);
  });
  it('are expanded when the length of the file is known, and explicit ranges win', async () => {
    const { normalizeSpec, resolveDurations } = await import('../compose-spec');
    const r = normalizeSpec({ clips: [{ layers: [{ type: 'video', url: 'https://example.com/a.mp4', cutTo: 10, speedPreset: 'hero-moment' }, { type: 'video', url: 'https://example.com/b.mp4', cutTo: 10, speedPreset: 'montage', speedRanges: [{ from: 0, to: 5, speed: 2 }] }] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const done = resolveDurations(r.spec, () => 10);
    const [a, b] = done.clips[0]!.layers as Array<{ speedRanges?: unknown[] }>;
    expect(a!.speedRanges!.length).toBeGreaterThan(8);
    expect(b!.speedRanges).toHaveLength(1);
  });
});

describe('a counter', () => {
  it('counts with grouping, decimals, a prefix and a suffix, and in short form', async () => {
    const { formatCounter, normalizeCounter } = await import('../compose-extras');
    const c = normalizeCounter({ to: 1250000, prefix: '$', suffix: '+' });
    expect(typeof c).toBe('object');
    if (typeof c === 'string') return;
    expect(formatCounter(c, 0)).toBe('$0+');
    expect(formatCounter(c, 0.5)).toBe('$625,000+');
    expect(formatCounter(c, 1)).toBe('$1,250,000+');
    const d = normalizeCounter({ from: 0, to: 99.5 }) as never;
    expect(formatCounter(d, 1)).toBe('99.5');
    const k = normalizeCounter({ to: 3400000, compact: true }) as never;
    expect(formatCounter(k, 1)).toBe('3.4M');
    expect(formatCounter(k, 0.0002)).toBe('680');
    expect(formatCounter(normalizeCounter({ from: 100, to: 0, thousands: false }) as never, 0.25)).toBe('75');
    expect(normalizeCounter({ from: 1 })).toContain('needs to');
    expect(normalizeCounter({ to: '1,200' })).toMatchObject({ to: 1200 });
  });
  it('is a title in a spec whose first text is the start of the count', async () => {
    const { normalizeSpec } = await import('../compose-spec');
    const r = normalizeSpec({ clips: [{ duration: 4, layers: [{ type: 'fill-color' }, { type: 'counter', to: 5000, suffix: ' users', fontSize: 0.2, animationIn: 'pulse' }] }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const l = r.spec.clips[0]!.layers[1] as { type: string; text: string; counter?: { to: number }; style: string };
    expect(l).toMatchObject({ type: 'text', style: 'title', text: '0 users' });
    expect(l.counter?.to).toBe(5000);
    expect(normalizeSpec({ clips: [{ duration: 4, layers: [{ type: 'counter' }] }] }).ok).toBe(false);
  });
});

describe('the new entrance effects', () => {
  it('start and end at rest, and pulse never fades', async () => {
    const { presetPose, PRESETS } = await import('../compose-motion');
    for (const p of ['pulse', 'wiggle', 'flash', 'spin', 'drop'] as const) {
      expect(PRESETS).toContain(p);
      const end = presetPose(p, 1, 'in');
      expect(end.scale).toBeCloseTo(1, 6);
      expect(Math.abs(end.rotation % 360)).toBeLessThan(1e-6);
      expect(end.opacity).toBeCloseTo(1, 6);
      expect(Math.abs(end.dy)).toBeLessThan(1e-6);
    }
    expect(presetPose('pulse', 0.5, 'in').scale).toBeGreaterThan(1.2);
    expect(presetPose('pulse', 0.5, 'in').opacity).toBe(1);
    expect(presetPose('flash', 0.25, 'in').opacity).toBeLessThan(0.7);
    expect(presetPose('spin', 0.5, 'in').rotation).not.toBe(0);
  });
});
