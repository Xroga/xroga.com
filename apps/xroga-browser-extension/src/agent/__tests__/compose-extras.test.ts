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
