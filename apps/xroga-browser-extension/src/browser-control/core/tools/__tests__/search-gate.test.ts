import { describe, expect, it } from 'vitest';
import { COOLDOWN_MS, CACHE_MS, SPACING_MS, SearchGate } from '../search-gate';

const make = () => {
  let t = 1_000_000;
  return { g: new SearchGate<string>(() => t), tick: (ms: number) => (t += ms) };
};

describe('SearchGate', () => {
  it('answers the same question again from the first read, for a while', () => {
    const { g, tick } = make();
    g.record('bing', 'Seo Leeds', { hits: ['a'] });
    expect(g.cached('bing', 'seo leeds')?.hits).toEqual(['a']);
    expect(g.cached('duckduckgo', 'seo leeds')).toBeUndefined();
    tick(CACHE_MS + 1);
    expect(g.cached('bing', 'seo leeds')).toBeUndefined();
  });
  it('does not keep empty reads', () => {
    const { g } = make();
    g.record('bing', 'x', { hits: [] });
    expect(g.cached('bing', 'x')).toBeUndefined();
  });
  it('rests an engine that asked for a check and uses another, then comes back', () => {
    const { g, tick } = make();
    const all = ['duckduckgo', 'bing', 'google'];
    g.record('duckduckgo', 'q', { hits: [], blocked: 'check' });
    expect(g.pick('duckduckgo', all)).toBe('bing');
    g.record('bing', 'q', { hits: [], blocked: 'check' });
    expect(g.pick('duckduckgo', all)).toBe('google');
    g.record('google', 'q', { hits: [], blocked: 'check' });
    expect(g.pick('duckduckgo', all)).toBeNull();
    tick(COOLDOWN_MS + 1);
    expect(g.pick('duckduckgo', all)).toBe('duckduckgo');
  });
  it('spaces requests to one engine and not to different ones', () => {
    const { g, tick } = make();
    expect(g.wait('bing')).toBe(0);
    expect(g.wait('bing')).toBe(SPACING_MS);
    expect(g.wait('bing')).toBe(2 * SPACING_MS);
    expect(g.wait('google')).toBe(0);
    tick(10 * SPACING_MS);
    expect(g.wait('bing')).toBe(0);
  });
});
