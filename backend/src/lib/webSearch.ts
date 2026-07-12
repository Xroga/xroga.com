/**
 * Free-first web search with Tavily escalation for high-stakes queries.
 * SearXNG default → Tavily supplement → Tavily+SearXNG parallel on critical research.
 */

import { tavilySearch } from './tavily.js';
import { cachedPromptResult } from './promptResponseCache.js';

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  source: 'searxng' | 'tavily';
}

const DEFAULT_SEARXNG_INSTANCES = [
  'https://searx.be',
  'https://search.im-in.space',
  'https://opensearch.vnet.fi',
  'https://searx.tiekoetter.com',
  'https://search.sapti.me',
];

const TAVILY_CRITICAL =
  /\b(hackathon|okx|asp\b|deadline|prize|requirements|pricing|net worth|current events|2026|regulation|competitor|market size)\b/i;

interface SearxResult {
  results?: Array<{ title?: string; url?: string; content?: string }>;
}

async function searxngSearch(baseUrl: string, query: string, maxResults: number): Promise<WebSearchResult[]> {
  const url = new URL('/search', baseUrl.replace(/\/$/, ''));
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'en');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json', 'User-Agent': 'XrogaAI/1.0' },
    signal: AbortSignal.timeout(14_000),
  });
  if (!res.ok) throw new Error(`SearXNG ${res.status}`);

  const data = (await res.json()) as SearxResult;
  return (data.results ?? [])
    .filter((r) => r.title && r.url)
    .slice(0, maxResults)
    .map((r) => ({
      title: r.title!,
      url: r.url!,
      content: (r.content ?? '').slice(0, 500),
      source: 'searxng' as const,
    }));
}

function searxngInstances(): string[] {
  const custom = process.env.SEARXNG_URL?.trim();
  if (custom) return [custom.replace(/\/$/, ''), ...DEFAULT_SEARXNG_INSTANCES.filter((u) => u !== custom)];
  return DEFAULT_SEARXNG_INSTANCES;
}

async function searchSearxngAll(query: string, maxResults: number): Promise<WebSearchResult[]> {
  for (const base of searxngInstances()) {
    try {
      const results = await searxngSearch(base, query, maxResults);
      if (results.length) return results;
    } catch (err) {
      console.warn(`[webSearch] SearXNG ${base}:`, (err as Error).message);
    }
  }
  return [];
}

function mergeDedupe(a: WebSearchResult[], b: WebSearchResult[], max: number): WebSearchResult[] {
  const seen = new Set<string>();
  const out: WebSearchResult[] = [];
  for (const r of [...a, ...b]) {
    if (seen.has(r.url)) continue;
    seen.add(r.url);
    out.push(r);
    if (out.length >= max) break;
  }
  return out;
}

export async function webSearch(
  query: string,
  opts?: { maxResults?: number; forceTavily?: boolean }
): Promise<WebSearchResult[]> {
  const maxResults = opts?.maxResults ?? 8;
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  const tavilyEnabled = process.env.TAVILY_FALLBACK !== 'false';
  const critical = opts?.forceTavily || TAVILY_CRITICAL.test(query);

  return cachedPromptResult('web-search', `${query}:${maxResults}:${critical}`, async () => {
    const searxResults = await searchSearxngAll(query, maxResults);

    if (critical && tavilyKey && tavilyEnabled) {
      try {
        const tavilyResults = await tavilySearch(query, maxResults);
        const tavilyMapped = tavilyResults.map((r) => ({
          title: r.title,
          url: r.url,
          content: r.content.slice(0, 500),
          source: 'tavily' as const,
        }));
        const merged = mergeDedupe(tavilyMapped, searxResults, maxResults);
        if (merged.length) {
          console.info(`[webSearch] Critical query — Tavily+SearXNG (${merged.length})`);
          return merged;
        }
      } catch (err) {
        console.warn('[webSearch] Tavily critical failed:', (err as Error).message);
      }
    }

    if (searxResults.length >= 3) {
      return searxResults;
    }

    if (tavilyKey && tavilyEnabled) {
      try {
        const tavilyResults = await tavilySearch(query, maxResults);
        const merged = mergeDedupe(
          searxResults,
          tavilyResults.map((r) => ({
            title: r.title,
            url: r.url,
            content: r.content.slice(0, 500),
            source: 'tavily' as const,
          })),
          maxResults
        );
        if (merged.length) return merged;
      } catch (err) {
        console.warn('[webSearch] Tavily supplement failed:', (err as Error).message);
      }
    }

    return searxResults;
  });
}

export function formatWebSearchContext(results: WebSearchResult[]): string {
  if (!results.length) return '';
  const lines = results.slice(0, 4).map((r) => `- ${r.title} (${r.url}): ${r.content.slice(0, 160)}`);
  return `\n\nWeb research:\n${lines.join('\n')}`;
}
