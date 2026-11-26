// Browser Harness's field-tested skills (https://github.com/browser-use/browser-harness, MIT): about 190 guides to real sites (their own endpoints, rate limits, robots rules, what
// blocks plain HTTP, what the page loads for itself) and how-tos for shadow DOM, iframes, dropdowns, dialogs, uploads and downloads. Xroga carries only the discovery index
// (src/agent/data/harness-index.json, built by scripts/build-harness-index.mjs from a pinned commit); the ranking runs on the device, and a guide's text is fetched from the pinned
// commit only when the agent reads it. A guide is third-party text: it informs the work, it grants no permission, and its code is read as an example, never run.
import { tokens } from './aas-skills';
import type { OnlineCandidate } from './online-skills';

type Row = [id: string, kind: string, name: string, description: string, hosts: string, dir: string, stem: string];
interface Index {
  repo: string;
  sha: string;
  count: number;
  rows: Row[];
}

export interface HarnessHit {
  id: string;
  kind: 'site' | 'how-to';
  name: string;
  description: string;
  score: number;
}

let loaded: Promise<{ index: Index; postings: Map<string, Array<[number, number]>>; idf: Map<string, number> }> | undefined;

async function prepare() {
  const mod = (await import('./data/harness-index.json')) as unknown as { default: Index };
  const index = mod.default;
  const postings = new Map<string, Array<[number, number]>>();
  const add = (t: string, row: number, w: number) => {
    const list = postings.get(t) ?? [];
    const last = list[list.length - 1];
    if (last && last[0] === row) last[1] += w;
    else list.push([row, w]);
    postings.set(t, list);
  };
  index.rows.forEach((r, i) => {
    for (const t of tokens(r[2])) add(t, i, 3);
    for (const t of tokens(r[5].replace(/[-_]/g, ' '))) add(t, i, 3);
    for (const t of tokens(r[6].replace(/[-_]/g, ' '))) add(t, i, 2);
    for (const t of tokens(r[3])) add(t, i, 1);
    for (const t of tokens(r[4].replace(/\./g, ' '))) add(t, i, 1);
  });
  const idf = new Map<string, number>();
  for (const [t, list] of postings) idf.set(t, Math.log(1 + index.rows.length / list.length));
  return { index, postings, idf };
}
const ready = () => (loaded ??= prepare());

const hit = (r: Row, score: number): HarnessHit => ({ id: r[0], kind: r[1] === 'site' ? 'site' : 'how-to', name: r[2], description: r[3].length >= 15 ? r[3] : r[2], score });

/** Guides that fit a request, best first. Local only. */
export async function searchHarness(query: string, limit = 4): Promise<HarnessHit[]> {
  const { index, postings, idf } = await ready();
  const words = tokens(query);
  if (!words.length) return [];
  const scores = new Map<number, number>();
  const matched = new Map<number, Set<string>>();
  for (const w of new Set(words)) {
    const list = postings.get(w);
    if (!list) continue;
    for (const [row, weight] of list) {
      scores.set(row, (scores.get(row) ?? 0) + (idf.get(w) ?? 0) * Math.min(weight, 6));
      (matched.get(row) ?? matched.set(row, new Set()).get(row)!).add(w);
    }
  }
  const asked = new Set(words).size;
  const ranked = [...scores.entries()]
    .map(([row, s]) => [row, s * (0.6 + (0.4 * (matched.get(row)?.size ?? 0)) / Math.max(1, asked))] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, Math.min(limit, 8)));
  const top = ranked[0]?.[1] ?? 0;
  return ranked.filter(([, s]) => s >= top * 0.6).map(([row, s]) => hit(index.rows[row]!, Math.round(s * 100) / 100));
}

const labelOf = (host: string) => host.replace(/^www\./, '').split('.').slice(0, -1).join('').replace(/[^a-z0-9]/g, '');

/** The field-tested guides for the site of this address: those whose files name the host, or whose folder is the site's name. */
export async function guidesForUrl(url: string, limit = 3): Promise<HarnessHit[]> {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return [];
  }
  if (!host || host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return [];
  const { index } = await ready();
  const parts = host.split('.');
  const domains = new Set<string>();
  for (let i = 0; i < parts.length - 1; i++) domains.add(parts.slice(i).join('.'));
  const label = labelOf(host);
  const found: Row[] = [];
  for (const r of index.rows) {
    if (r[1] !== 'site') continue;
    // The file names this host, or a host of the same site (the page is www.example.com and the file names api.example.com, or the reverse).
    const named = r[4].split(' ').filter(Boolean).some(h => domains.has(h) || [...domains].some(d => d.includes('.') && h.endsWith(`.${d}`)));
    const folder = r[5].toLowerCase().replace(/[^a-z0-9]/g, '');
    if (named || (label.length >= 4 && (folder === label || folder === label.replace(/com$|org$|net$/, '')))) found.push(r);
  }
  return found.slice(0, limit).map(r => hit(r, 10));
}

export const HARNESS_HOST = 'raw.githubusercontent.com';
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/;

export async function harnessCandidate(id: string): Promise<OnlineCandidate | undefined> {
  if (!ID.test(id)) return undefined;
  const { index } = await ready();
  const r = index.rows.find(x => x[0] === id);
  if (!r) return undefined;
  const path = r[1] === 'site' ? `agent-workspace/domain-skills/${r[5]}/${r[6]}.md` : `interaction-skills/${r[6]}.md`;
  return {
    id: `online:harness:${id}`,
    provider: 'harness',
    name: r[2],
    description: r[3].length >= 15 ? r[3] : r[2],
    confidence: 0.6,
    fetchUrl: `https://${HARNESS_HOST}/browser-use/browser-harness/${index.sha}/${encodeURI(path)}`,
  };
}

export const describeHarnessHit = (h: HarnessHit) => `- online:harness:${h.id} (${h.kind === 'site' ? 'field-tested site guide' : 'how-to'}, third-party, unverified): ${h.name}: ${h.description}`;
