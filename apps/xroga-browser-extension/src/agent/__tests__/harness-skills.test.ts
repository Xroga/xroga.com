import { describe, expect, it } from 'vitest';
import { describeHarnessHit, guidesForUrl, harnessCandidate, searchHarness } from '../harness-skills';
import { loadCandidate } from '../online-skills';

describe('Browser Harness skills', () => {
  it('finds a field-tested guide by the words of a task', async () => {
    const hits = await searchHarness('scrape product listings and prices from home depot', 4);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.id).toMatch(/^home-depot--/);
    expect(hits[0]!.kind).toBe('site');
    const how = await searchHarness('handle a dropdown select inside an iframe', 4);
    expect(how.some(h => h.kind === 'how-to')).toBe(true);
  });
  it('finds the guides for the site a page is on, by host or folder name', async () => {
    const homeDepot = await guidesForUrl('https://www.homedepot.com/b/Tools/N-5yc1vZc2a', 3);
    expect(homeDepot.map(h => h.id).join(' ')).toMatch(/home-depot/);
    expect(await guidesForUrl('https://example.org/', 3)).toEqual([]);
    expect(await guidesForUrl('http://localhost:8787/page', 3)).toEqual([]);
    expect(await guidesForUrl('not an address', 3)).toEqual([]);
  });
  it('points a candidate at the pinned commit of its own repository and nowhere else', async () => {
    const c = await harnessCandidate('how--shadow-dom');
    expect(c?.fetchUrl).toMatch(/^https:\/\/raw\.githubusercontent\.com\/browser-use\/browser-harness\/[a-f0-9]{40}\/interaction-skills\/shadow-dom\.md$/);
    expect(await harnessCandidate('../../etc/passwd')).toBeUndefined();
    expect(await harnessCandidate('no-such-guide')).toBeUndefined();
    const f = async () => ({ ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('# Shadow DOM\nUse piercing queries.').buffer, headers: { get: () => 'text/markdown' } }) as never;
    const loaded = await loadCandidate(c!, f);
    expect(loaded?.text).toContain('Use piercing queries');
    // A candidate whose address leaves the pinned path is refused.
    expect(await loadCandidate({ ...c!, fetchUrl: 'https://raw.githubusercontent.com/someone-else/repo/main/x.md' }, f)).toBeNull();
    expect(await loadCandidate({ ...c!, fetchUrl: 'https://evil.test/browser-use/browser-harness/' + 'a'.repeat(40) + '/interaction-skills/x.md' }, f)).toBeNull();
  });
  it('describes a hit as third-party, unverified text', async () => {
    const [h] = await searchHarness('bluesky', 1);
    expect(describeHarnessHit(h!)).toMatch(/online:harness:.*third-party, unverified/);
  });
});
