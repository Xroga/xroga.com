import { describe, expect, it } from 'vitest';
import { loadCandidate } from '../online-skills';
import { poolCandidate, poolSuggestions, searchPool, tokens } from '../aas-skills';

const text = (h: { id: string; name: string; description: string; category: string }) => `${h.id} ${h.name} ${h.description} ${h.category}`.toLowerCase();

describe('the professional skill pool', () => {
  it('finds ad, seo and outreach skills for plain requests, ranked on the device', async () => {
    const ads = await searchPool('run a google ads campaign for my plumbing business', 5);
    expect(ads.length).toBeGreaterThan(0);
    expect(ads.some(h => /ad|campaign|ppc|search/.test(text(h)))).toBe(true);
    const meta = await searchPool('set up meta facebook ads audience targeting and budget', 5);
    expect(meta.some(h => /facebook|meta|ad/.test(text(h)))).toBe(true);
    const seo = await searchPool('find seo clients and prepare personalised outreach emails', 5);
    expect(seo.some(h => /seo|lead|prospect|outreach|email/.test(text(h)))).toBe(true);
  });

  it('leaves out the pool\'s own offensive skills and keeps ids safe to put in a URL', async () => {
    expect(await poolCandidate('active-directory-attacks')).toBeUndefined();
    expect(await poolCandidate('../../etc/passwd')).toBeUndefined();
    const hits = await searchPool('database schema migration postgres', 10);
    for (const h of hits) expect(h.id).toMatch(/^[A-Za-z0-9._-]+$/);
  });

  it('points a candidate at the pinned commit of its own repository, and nowhere else', async () => {
    const [hit] = await searchPool('google ads campaign', 1);
    const c = await poolCandidate(hit!.id);
    expect(c!.fetchUrl).toMatch(/^https:\/\/raw\.githubusercontent\.com\/sickn33\/agentic-awesome-skills\/[a-f0-9]{40}\/skills\/[A-Za-z0-9._-]+\/SKILL\.md$/);
    const fetched: string[] = [];
    const f = async (url: string) => { fetched.push(url); return { ok: true, status: 200, arrayBuffer: async () => new TextEncoder().encode('---\nname: x\ndescription: y\n---\nbody').buffer } as never; };
    expect(await loadCandidate({ ...c!, fetchUrl: 'https://evil.example/sickn33/agentic-awesome-skills/' + 'a'.repeat(40) + '/skills/x/SKILL.md' }, f as never)).toBeNull();
    expect(await loadCandidate({ ...c!, fetchUrl: c!.fetchUrl.replace('skills/', 'other/') }, f as never)).toBeNull();
    expect(fetched).toHaveLength(0);
    expect((await loadCandidate(c!, f as never))?.text).toContain('body');
  });

  it('suggests unasked only when a request plainly fits, and says nothing for a short or empty one', async () => {
    expect(await poolSuggestions('hi', 3)).toEqual([]);
    expect((await poolSuggestions('build google ads campaign keywords for a local dental clinic', 3)).length).toBeGreaterThan(0);
  });

  it('turns a request into plain words', () => {
    expect(tokens('Please open https://x.test and run the Google Ads campaigns')).toEqual(['google', 'ads', 'campaign']);
  });
});
