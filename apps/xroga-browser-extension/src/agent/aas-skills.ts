// The Agentic Awesome Skills pool (https://github.com/sickn33/agentic-awesome-skills, code MIT, content CC BY 4.0): about 3,000 procedural skills for professional work
// (marketing and ads, SEO and research, e-commerce, data, design and media, cloud, security and QA, business processes, automation). Xroga carries only the discovery
// index (id, category, name, a short description: src/agent/data/aas-index.json, built by scripts/build-aas-index.mjs from a pinned commit). The ranking runs here, on the
// device, so no word of the person's task leaves the browser. The skill's own text sits in public/pool/skills.bin (gzip, offline, instant) for every skill whose upstream licence
// allows it (scripts/build-aas-bundle.mjs); the others, and any file beside a skill, are fetched by id from the pinned commit when the agent reads them.
// A pool skill is third-party text: it informs the work, it grants no permission, it never runs a script, and it cannot change the task or the person's wishes.
import type { OnlineCandidate, OnlineProvider } from './online-skills';

interface Index {
  repo: string;
  sha: string;
  count: number;
  rows: Array<[string, string, string, string, number, string?, number?, number?]>;
  binBytes?: number;
  bundles?: Record<string, { description: string; skills: string[] }>;
  aliases?: Record<string, string>;
  workflows?: Array<{ id: string; name: string; description: string; steps: Array<{ title: string; goal: string; skills: string[] }> }>;
}

/** Where a bundled skill sits in skills.bin: its offset and gzip length. */
export interface PoolBin {
  bytes: Uint8Array;
}
let binLoader: (() => Promise<Uint8Array>) | undefined;
let binCache: Promise<Uint8Array> | undefined;
/** Tests and other hosts give the bundle from somewhere else than the extension's own files. */
export function setPoolBinLoader(load: (() => Promise<Uint8Array>) | undefined): void {
  binLoader = load;
  binCache = undefined;
}
async function loadBin(): Promise<Uint8Array> {
  binCache ??= (binLoader ? binLoader() : fetch(chrome.runtime.getURL('pool/skills.bin')).then(async r => new Uint8Array(await r.arrayBuffer()))).catch(error => {
    binCache = undefined;
    throw error;
  });
  return binCache;
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** The text of a skill from the bundle, or undefined when the skill is not bundled (its licence keeps it remote) or the bundle cannot be read. */
export async function bundledSkillText(idIn: string): Promise<string | undefined> {
  const p = await ready();
  const id = p.aliases[idIn] ?? idIn;
  const r = p.rows.find(x => x[0] === id);
  if (!r || r[6] === undefined || r[6] < 0 || !r[7]) return undefined;
  try {
    const bin = await loadBin();
    return await gunzip(bin.subarray(r[6], r[6] + r[7]));
  } catch {
    return undefined;
  }
}

export interface PoolHit {
  id: string;
  name: string;
  category: string;
  description: string;
  score: number;
  /** The pool marks this skill's actions as high-impact: the approval cards apply as always. */
  critical: boolean;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'then', 'please', 'make', 'create', 'open', 'page', 'tab', 'tabs', 'use', 'using', 'you', 'your', 'our', 'can', 'want', 'need', 'help', 'task', 'tasks', 'all', 'any', 'each', 'new', 'one', 'two', 'out', 'how', 'what', 'when', 'where', 'will', 'are', 'its', 'has', 'have', 'been', 'also', 'some', 'now', 'get', 'set', 'run', 'add', 'start', 'do', 'to', 'in', 'on', 'of', 'a', 'an', 'it', 'is', 'my', 'me', 'we', 'i']);

/** Words a person uses for the same thing, so a plain request finds the professional skill. Kept short and about this product's work. */
const SIMILAR: Record<string, string[]> = {
  ads: ['advertising', 'campaign', 'ppc', 'adwords'],
  ad: ['advertising', 'campaign'],
  meta: ['facebook', 'instagram'],
  facebook: ['meta', 'instagram'],
  google: ['adwords', 'search'],
  client: ['lead', 'prospect', 'customer'],
  clients: ['lead', 'prospect', 'customer'],
  customer: ['client', 'lead', 'crm'],
  leads: ['lead', 'prospect', 'outreach'],
  hunt: ['prospect', 'lead', 'research'],
  hunting: ['prospect', 'lead', 'research'],
  email: ['outreach', 'mail', 'newsletter'],
  seo: ['search', 'keyword', 'ranking'],
  database: ['sql', 'postgres', 'supabase', 'schema'],
  db: ['database', 'sql'],
  spreadsheet: ['sheet', 'excel', 'csv'],
  sheet: ['spreadsheet', 'excel'],
  drawing: ['design', 'canvas', 'svg', 'illustration'],
  draw: ['design', 'canvas', 'svg'],
  design: ['figma', 'ui', 'ux', 'graphic'],
  video: ['editing', 'timeline', 'ffmpeg'],
  invoice: ['billing', 'payment', 'accounting'],
  store: ['shopify', 'ecommerce', 'product'],
  shop: ['shopify', 'ecommerce'],
  product: ['catalog', 'ecommerce', 'listing'],
  calendar: ['schedule', 'meeting'],
  research: ['analysis', 'competitor', 'market'],
  competitor: ['research', 'market', 'benchmark'],
};

const stem = (w: string) => (w.length > 5 && /(?:ing|ers)$/.test(w) ? w.replace(/(?:ing|ers)$/, '') : w.length > 4 && w.endsWith('es') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
export function tokens(text: string): string[] {
  return (text.toLowerCase().replace(/https?:\/\/\S+/g, ' ').match(/[a-z0-9]{2,24}/g) ?? []).filter(w => !STOP.has(w)).map(stem);
}

interface Prepared {
  rows: Index['rows'];
  sha: string;
  postings: Map<string, Array<[number, number]>>; // token -> [row, weight]
  idf: Map<string, number>;
  bundles: NonNullable<Index['bundles']>;
  aliases: NonNullable<Index['aliases']>;
  workflows: NonNullable<Index['workflows']>;
}
let prepared: Promise<Prepared> | undefined;

async function prepare(): Promise<Prepared> {
  const mod = (await import('./data/aas-index.json')) as unknown as { default: Index };
  const index = mod.default;
  const postings = new Map<string, Array<[number, number]>>();
  const add = (t: string, row: number, weight: number) => {
    let list = postings.get(t);
    if (!list) postings.set(t, (list = []));
    const last = list[list.length - 1];
    if (last && last[0] === row) last[1] += weight;
    else list.push([row, weight]);
  };
  index.rows.forEach((r, i) => {
    for (const t of tokens(r[2].replace(/[-_]/g, ' '))) add(t, i, 3);
    for (const t of tokens(r[1].replace(/[-_]/g, ' '))) add(t, i, 2);
    for (const t of tokens(r[3])) add(t, i, 1);
    // The headings of the skill's own text: what it actually covers, beyond what its description says.
    if (r[5]) for (const t of tokens(r[5])) add(t, i, 1);
  });
  const n = index.rows.length;
  const idf = new Map<string, number>();
  for (const [t, list] of postings) idf.set(t, Math.log(1 + n / list.length));
  return { rows: index.rows, sha: index.sha, postings, idf, bundles: index.bundles ?? {}, aliases: index.aliases ?? {}, workflows: index.workflows ?? [] };
}
const ready = () => (prepared ??= prepare());

/** The pool skills that fit a request, best first. Local only; an empty list when nothing fits well enough. */
export async function searchPool(query: string, limit = 5): Promise<PoolHit[]> {
  const p = await ready();
  const words = tokens(query);
  if (!words.length) return [];
  const weights = new Map<string, number>();
  for (const w of words) {
    weights.set(w, Math.max(weights.get(w) ?? 0, 1));
    for (const s of SIMILAR[w] ?? []) weights.set(stem(s), Math.max(weights.get(stem(s)) ?? 0, 0.5));
  }
  const scores = new Map<number, number>();
  const matched = new Map<number, Set<string>>();
  for (const [t, q] of weights) {
    const list = p.postings.get(t);
    if (!list) continue;
    const idf = p.idf.get(t) ?? 0;
    for (const [row, w] of list) {
      scores.set(row, (scores.get(row) ?? 0) + q * idf * Math.min(w, 6));
      const set = matched.get(row) ?? new Set<string>();
      if (q >= 1) set.add(t);
      matched.set(row, set);
    }
  }
  // A skill that covers more of the words the person used beats one that repeats a single word.
  const asked = new Set(words);
  // A request of three or more words needs a skill that matches at least two of them: one shared word ("load", "click", "text") alone finds load balancers and click-rate calculators.
  const needed = asked.size >= 3 ? 2 : 1;
  const ranked = [...scores.entries()]
    .filter(([row]) => (matched.get(row)?.size ?? 0) >= needed)
    .map(([row, s]) => [row, s * (0.6 + (0.4 * (matched.get(row)?.size ?? 0)) / Math.max(1, asked.size))] as const)
    .sort((a, b) => b[1] - a[1])
    .slice(0, Math.max(1, Math.min(limit, 10)));
  const top = ranked[0]?.[1] ?? 0;
  return ranked
    .filter(([, s]) => s >= top * 0.55)
    .map(([row, s]) => {
      const r = p.rows[row]!;
      return { id: r[0], name: r[2], category: r[1], description: r[3], score: Math.round(s * 100) / 100, critical: r[4] === 1 };
    });
}

/** Whether a request fits the pool well enough to mention it unasked: a plain match on at least two of its words. */
export async function poolSuggestions(request: string, limit = 3): Promise<PoolHit[]> {
  if (tokens(request).length < 3) return [];
  const hits = await searchPool(request, limit);
  return hits.length && hits[0]!.score >= 6 ? hits : [];
}

export const POOL_HOST = 'raw.githubusercontent.com';
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/;

/** The pool renames skills now and then; an old id (from memory, a note, an earlier run) still opens the skill it became. */
export async function resolvePoolId(id: string): Promise<string> {
  const p = await ready();
  return p.aliases[id] ?? id;
}

/** Skills that belong with this one: the pool's role bundles that hold it, other members first by how many bundles they share with it. */
export async function relatedSkills(id: string, limit = 6): Promise<string[]> {
  const p = await ready();
  const shared = new Map<string, number>();
  for (const b of Object.values(p.bundles)) {
    if (!b.skills.includes(id)) continue;
    for (const other of b.skills) if (other !== id) shared.set(other, (shared.get(other) ?? 0) + 1);
  }
  return [...shared.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([k]) => k);
}

export interface WorkflowHit {
  id: string;
  name: string;
  description: string;
  steps: Array<{ title: string; goal: string; skills: string[] }>;
}

/** The pool's multi-step workflows (plan, build, test, ship; research, write, publish) that fit a request: a plain match on at least two of its words. */
export async function searchWorkflows(query: string, limit = 1): Promise<WorkflowHit[]> {
  const p = await ready();
  const words = new Set(tokens(query));
  if (words.size < 2) return [];
  return p.workflows
    .map(w => {
      const have = new Set(tokens([w.name, w.description, ...w.steps.map(s => s.title + ' ' + s.goal)].join(' ')));
      let n = 0;
      for (const t of words) if (have.has(t)) n++;
      return { w, n };
    })
    .filter(x => x.n >= 2)
    .sort((a, b) => b.n - a.n)
    .slice(0, limit)
    .map(x => x.w);
}

export async function poolCandidate(idIn: string): Promise<OnlineCandidate | undefined> {
  if (!ID.test(idIn)) return undefined;
  const p = await ready();
  const id = p.aliases[idIn] ?? idIn;
  const r = p.rows.find(x => x[0] === id);
  if (!r) return undefined;
  return {
    id: `online:aas:${id}`,
    provider: 'aas',
    name: r[2],
    description: r[3],
    confidence: 0.5,
    fetchUrl: `https://${POOL_HOST}/sickn33/agentic-awesome-skills/${p.sha}/skills/${id}/SKILL.md`,
  };
}

export const AAS_PROVIDER: OnlineProvider = {
  id: 'aas',
  hosts: [POOL_HOST],
  async resolve(keywords, limit) {
    const hits = await searchPool(keywords, limit);
    const out: OnlineCandidate[] = [];
    for (const h of hits) {
      const c = await poolCandidate(h.id);
      if (c) out.push({ ...c, confidence: Math.min(1, h.score / 20) });
    }
    return out;
  },
};

export function describePoolHit(h: PoolHit): string {
  return `- online:aas:${h.id} (${h.category}${h.critical ? ', high-impact actions: approvals apply' : ''}, third-party, unverified): ${h.name}: ${h.description}`;
}

/** A line after a pool skill's text: other skills that belong with it, from the pool's own role bundles. Empty when there are none. */
export async function relatedNote(candidateId: string): Promise<string> {
  const related = await relatedSkills(candidateId.replace(/^online:aas:/, ''), 5).catch(() => []);
  return related.length ? `\n\nRelated skills in the same pool bundles (read with read_skill if needed): ${related.map(id => 'online:aas:' + id).join(', ')}` : '';
}
