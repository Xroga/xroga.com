import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import index from '../data/aas-index.json';
import { bundledSkillText, poolCandidate, searchPool, setPoolBinLoader } from '../aas-skills';
import { loadBundledCandidate } from '../online-skills';
import { parseSkillMd } from '../skill-md';

// Every skill of the pool, one by one: it opens (from the bundle, or its pinned address when its licence keeps it remote), its file is valid, and asking for it in the words
// its own name and description use brings it up near the top of the ranking. Local only: no network.
const bin = readFileSync(resolve(__dirname, '../../../public/pool/skills.bin'));
const rows = (index as unknown as { rows: Array<[string, string, string, string, number, string?, number?, number?]> }).rows;

beforeAll(() => setPoolBinLoader(async () => new Uint8Array(bin)));

describe('the bundled pool', () => {
  it('the bundle is the file the index was built with', () => {
    expect(createHash('sha256').update(bin).digest('hex')).toBe((index as unknown as { binSha256: string }).binSha256);
    expect(rows.length).toBeGreaterThan(2500);
  });

  it('every skill is bundled or remote, and a remote one has a valid address at the pinned commit', async () => {
    const remote = rows.filter(r => (r[6] ?? -1) < 0);
    expect(remote.length).toBeLessThan(100);
    for (const r of remote) {
      const c = await poolCandidate(r[0]);
      expect(c?.fetchUrl, r[0]).toMatch(/^https:\/\/raw\.githubusercontent\.com\/sickn33\/agentic-awesome-skills\/[a-f0-9]{40}\/skills\/[A-Za-z0-9._-]+\/SKILL\.md$/);
    }
  });

  it('every bundled skill opens, has a name and a description, and a body that says something', async () => {
    const bad: string[] = [];
    for (const r of rows) {
      if ((r[6] ?? -1) < 0) continue;
      const text = await bundledSkillText(r[0]);
      const parsed = text ? parseSkillMd(text, { lenient: true }) : undefined;
      if (!text || !parsed?.ok || parsed.skill.body.trim().length < 80) bad.push(r[0]);
    }
    expect(bad.slice(0, 20), `${bad.length} skills do not open or are empty`).toEqual([]);
  });

  it('a skill opens through the same path the agent uses', async () => {
    const c = await poolCandidate(rows[10]![0]);
    const loaded = await loadBundledCandidate(c!);
    expect(loaded?.text?.length ?? 0).toBeGreaterThan(80);
  });

  it('asking in a skill\'s own words finds it in the first five, for nearly every skill', async () => {
    const miss: string[] = [];
    for (const r of rows) {
      const words = r[3].split(/\s+/).slice(0, 14).join(' ');
      const hits = await searchPool(`${r[2].replace(/[-_]/g, ' ')} ${words}`, 5);
      if (!hits.some(h => h.id === r[0])) miss.push(r[0]);
    }
    const rate = 1 - miss.length / rows.length;
    console.log(`self-retrieval: ${(rate * 100).toFixed(1)}% (${miss.length} missed of ${rows.length}); first misses: ${miss.slice(0, 15).join(', ')}`);
    expect(rate).toBeGreaterThan(0.98);
  }, 300_000);
});

describe('what else the pool knows', () => {
  const extra = index as unknown as { bundles: Record<string, { skills: string[] }>; aliases: Record<string, string>; workflows: Array<{ id: string; steps: Array<{ skills: string[] }> }> };
  it('an old id of a renamed skill still opens the skill it became', async () => {
    const [old, now] = Object.entries(extra.aliases)[0]!;
    const { resolvePoolId } = await import('../aas-skills');
    expect(await resolvePoolId(old)).toBe(now);
    const viaOld = await poolCandidate(old);
    expect(viaOld?.id).toBe(`online:aas:${now}`);
  });
  it('skills of the same role bundles are named as related, and a workflow fits a plain request', async () => {
    const { relatedSkills, searchWorkflows } = await import('../aas-skills');
    const first = Object.values(extra.bundles)[0]!.skills[0]!;
    expect((await relatedSkills(first)).length).toBeGreaterThan(0);
    const wf = await searchWorkflows('qa test a web app with browser automation');
    expect(wf[0]?.id).toBe('qa-browser-automation');
    for (const w of extra.workflows) for (const st of w.steps) for (const id of st.skills) expect(rows.some(r => r[0] === id), `${w.id}: ${id}`).toBe(true);
  });
});
