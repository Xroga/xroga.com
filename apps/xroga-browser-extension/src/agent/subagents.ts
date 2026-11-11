// Sub-agents: read-only page readers the main agent starts in parallel with one `delegate` call, each in its own background
// tab. They are a tool of the one canonical loop, not a second orchestrator: they read, they never click, type, submit,
// approve or call a connected app, so no consequential authority is delegated.
//
// A reader makes NO model call. That is deliberate: every model request of a Xroga run is accounted by the server turn by turn,
// in order, against the run's turn budget, so helpers that called the model at the same time would collide with that accounting
// (this was tried first and broke the run). A reader is the page text, fetched in parallel, for the main agent to reason over.
//
// `follow` turns one web search into the whole research step: the search page is read, the links of its top results are taken
// (one per site), and those pages are read at the same time, all inside the one call, so a "compare / research / open N sites"
// task is one model turn of planning and one of answering.
import type { LayerPort } from './ports';
import type { AgentTool } from './tools';
import { challengeNote, detectChallenge } from './challenge';

export const MAX_JOBS = 10;
export const MAX_FOLLOW = 10;
const PAGE_TIMEOUT_MS = 40_000;
const TOTAL_CHARS = 28_000;

export interface SubagentJob {
  url?: string;
  query?: string;
  /** Also read the top N pages the page links to (one per site): for a search page or a list. */
  follow?: number;
}

export const DELEGATE_TOOL: AgentTool = {
  name: 'delegate',
  source: 'agent',
  group: 'working',
  description:
    'Read several web pages at the same time, in background tabs, and get all their text in one result. Instant and read-only: nothing is clicked or changed. ' +
    'Use it FIRST for research, comparisons, "open N sites", or whenever the answer is on pages you do not have open. ' +
    'Each job is a url to read, or a query to search the web. Add follow:N to a query to also read the top N result pages (different sites) in the same call: ' +
    'one call with {query, follow:5} replaces searching, choosing and opening five sites yourself. Up to 10 jobs. ' +
    'Answer from the text you get back; open a page yourself only if a fact you need is missing.',
  parameters: {
    type: 'object',
    properties: {
      jobs: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_JOBS,
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The https address to read' },
            query: { type: 'string', description: 'A web search to run when you have no address' },
            follow: { type: 'integer', minimum: 1, maximum: MAX_FOLLOW, description: 'Also read the top N pages this search or page links to' },
          },
          additionalProperties: false,
        },
      },
    },
    required: ['jobs'],
    additionalProperties: false,
  },
};

/** Reads the jobs from a model's arguments; only well-formed ones, at most MAX_JOBS. */
export function parseJobs(input: unknown): { jobs: SubagentJob[]; problems: string[] } {
  const raw = (input as { jobs?: unknown } | null)?.jobs;
  const problems: string[] = [];
  const jobs: SubagentJob[] = [];
  if (!Array.isArray(raw) || !raw.length) return { jobs, problems: ['jobs must be a list of 1 to 10 reads'] };
  raw.slice(0, MAX_JOBS).forEach((item, i) => {
    const j = (item ?? {}) as Record<string, unknown>;
    const url = typeof j.url === 'string' ? j.url.trim() : '';
    const query = typeof j.query === 'string' ? j.query.trim().slice(0, 200) : '';
    const follow = Number.isInteger(j.follow) ? Math.max(1, Math.min(MAX_FOLLOW, Number(j.follow))) : undefined;
    if (!url && !query) return void problems.push(`job ${i + 1}: give a url or a query`);
    if (url && !/^https?:\/\//i.test(url)) return void problems.push(`job ${i + 1}: the url must start with http:// or https://`);
    jobs.push(url ? { url, ...(follow ? { follow } : {}) } : { query, ...(follow ? { follow } : {}) });
  });
  if (raw.length > MAX_JOBS) problems.push(`only the first ${MAX_JOBS} jobs were run`);
  return { jobs, problems };
}

export function addressOf(job: SubagentJob): string {
  return job.url ?? `https://www.google.com/search?q=${encodeURIComponent(job.query ?? '')}`;
}

const SEARCH_HOSTS = /(^|\.)(google|googleusercontent|gstatic|bing|duckduckgo|yahoo|baidu|youtube|facebook|instagram|twitter|x|tiktok|pinterest|linkedin|reddit)\.[a-z.]+$|^(webcache|translate|accounts|support|maps|policies)\./i;

/**
 * The links of a search page's top results: one per site, in order, with the search engine's own links, redirects, anchors,
 * social sites and video pages left out. Reads Markdown links, which is what `read` returns.
 */
export function resultLinks(markdown: string, n: number): Array<{ url: string; title: string }> {
  const seen = new Set<string>();
  const out: Array<{ url: string; title: string }> = [];
  const link = /\[([^\]\n]{3,200})\]\((https?:\/\/[^)\s]+)\)/g;
  for (let m = link.exec(markdown); m && out.length < n; m = link.exec(markdown)) {
    let target = m[2];
    try {
      let u = new URL(target);
      // A search engine's redirect carries the real address.
      if (/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && u.pathname === '/url') {
        const real = u.searchParams.get('q') ?? u.searchParams.get('url');
        if (!real) continue;
        u = new URL(real);
      }
      if (SEARCH_HOSTS.test(u.hostname.replace(/^www\./, '')) || !/^https?:$/.test(u.protocol)) continue;
      if (u.pathname === '/' && !u.search && out.length) continue; // a bare home page tells little
      const site = u.hostname.replace(/^www\./, '');
      if (seen.has(site)) continue;
      seen.add(site);
      target = u.toString();
    } catch {
      continue;
    }
    out.push({ url: target, title: m[1].replace(/\s+/g, ' ').trim() });
  }
  return out;
}

export interface SubagentDeps {
  layer: LayerPort;
  signal: AbortSignal;
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}\n… (cut at ${max} characters)` : text;
}

/** The text between the untrusted-content markers, which is the page itself. */
function pageBody(text: string): string {
  const open = text.indexOf('<<<page-content');
  if (open < 0) return text;
  const from = text.indexOf('\n', open) + 1;
  const end = text.indexOf('<<<end-page-content');
  return text.slice(from, end > from ? end : undefined).trim();
}

/** Opens one page in its own tab, reads it, and closes the tab. A failure is text, never a throw. */
async function readPage(deps: SubagentDeps, url: string, maxChars: number): Promise<{ ok: boolean; text: string }> {
  const controller = new AbortController();
  const stop = () => controller.abort();
  deps.signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(stop, PAGE_TIMEOUT_MS);
  let tabId: number | undefined;
  try {
    const opened = await deps.layer.call('tabs', { action: 'open', url }, controller.signal);
    tabId = (opened.data as { opened?: number } | undefined)?.opened;
    if (!opened.ok || tabId === undefined) return { ok: false, text: `could not open the page: ${opened.text.split('\n')[0] || 'refused'}` };
    const page = await deps.layer.call('read', { tabId, format: 'markdown', maxChars }, controller.signal);
    if (!page.ok) return { ok: false, text: `could not read the page: ${page.text.split('\n')[0]}` };
    // A page that is a bot check or a refusal is reported as one, not as content.
    const challenge = detectChallenge({ title: /«([^»]{0,120})»/.exec(page.text)?.[1], text: pageBody(page.text) });
    return challenge ? { ok: false, text: `${challengeNote(challenge)} (${url})` } : { ok: true, text: page.text };
  } catch (error) {
    return { ok: false, text: `stopped: ${controller.signal.aborted ? 'out of time' : error instanceof Error ? error.message : 'failed'}` };
  } finally {
    clearTimeout(timer);
    deps.signal.removeEventListener('abort', stop);
    if (tabId !== undefined) await deps.layer.call('tabs', { action: 'close', tabId }).catch(() => undefined);
  }
}

const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return 'the web';
  }
};

interface Section {
  heading: string;
  text: string;
}

async function runJob(deps: SubagentDeps, job: SubagentJob, budget: number): Promise<Section[]> {
  const url = addressOf(job);
  const first = await readPage(deps, url, job.follow ? 8_000 : budget);
  if (!job.follow) return [{ heading: job.url ? url : `search: ${job.query}`, text: first.text }];
  const links = first.ok ? resultLinks(pageBody(first.text), job.follow) : [];
  if (!links.length) {
    // Nothing to follow (a blocked or unusual results page): the search page itself goes back, and the agent decides.
    return [{ heading: `search: ${job.query} (no result links could be taken)`, text: first.text }];
  }
  const each = Math.max(2_500, Math.min(12_000, Math.floor(budget / links.length)));
  const pages = await Promise.all(links.map(link => readPage(deps, link.url, each)));
  return links.map((link, i) => ({ heading: `${link.title} · ${link.url}`, text: pages[i].text }));
}

/** Runs the jobs at the same time and returns one text for the main agent. The main agent's own tab is left as it was. */
export async function runSubagents(
  deps: SubagentDeps,
  jobs: SubagentJob[],
  problems: string[] = [],
): Promise<{ text: string; isError: boolean }> {
  const before = await deps.layer.tabs().catch(() => null);
  const pagesWanted = jobs.reduce((n, j) => n + (j.follow ?? 1), 0);
  const budget = Math.max(2_500, Math.min(12_000, Math.floor(TOTAL_CHARS / Math.max(1, pagesWanted))));
  const groups = await Promise.all(jobs.map(job => runJob(deps, job, budget)));
  // A page that failed to load can leave its tab open without telling us its id: close every tab the helpers left behind.
  if (before) {
    const known = new Set(before.tabs.map(t => t.tabId));
    const left = await deps.layer.tabs().catch(() => null);
    for (const tab of left?.tabs ?? []) {
      if (!known.has(tab.tabId)) await deps.layer.call('tabs', { action: 'close', tabId: tab.tabId }).catch(() => undefined);
    }
  }
  const back = before?.activeTabId;
  if (back !== null && back !== undefined) {
    const now = await deps.layer.tabs().catch(() => null);
    if (now && now.activeTabId !== back && now.tabs.some(t => t.tabId === back)) {
      await deps.layer.call('tabs', { action: 'select', tabId: back }).catch(() => undefined);
    }
  }
  const sections = groups.flat().map((s, i) => `## Page ${i + 1} · ${s.heading}\n${clip(s.text, budget + 600)}`);
  const notes = problems.length ? `\nNote: ${problems.join('; ')}.` : '';
  const footer = '\nThese are the pages as they were just read. Answer from them. Open a page yourself only if a fact you need is missing.';
  return { text: `${sections.join('\n\n')}${notes}${footer}`, isError: false };
}
