import { tavilySearch } from './tavily.js';

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  source: 'searxng' | 'tavily';
}

/** Public SearXNG instances — no API key required. Override with SEARXNG_URL for self-hosted. */
const DEFAULT_SEARXNG_INSTANCES = [
  'https://searx.be',
  'https://search.im-in.space',
  'https://opensearch.vnet.fi',
];

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

/**
 * Free-first web search: SearXNG (no API key) → Tavily (when key set / critical fallback).
 */
export async function webSearch(
  query: string,
  opts?: { critical?: boolean; maxResults?: number }
): Promise<WebSearchResult[]> {
  const maxResults = opts?.maxResults ?? 8;
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();

  const searxResults = await searchSearxngAll(query, maxResults);
  if (searxResults.length) return searxResults;

  if (tavilyKey) {
    try {
      const results = await tavilySearch(query, maxResults);
      return results.map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content.slice(0, 500),
        source: 'tavily' as const,
      }));
    } catch (err) {
      console.warn('[webSearch] Tavily:', (err as Error).message);
    }
  }

  return [];
}

export function formatWebSearchContext(results: WebSearchResult[]): string {
  if (!results.length) return '';
  const lines = results.slice(0, 5).map((r) => `- ${r.title} (${r.source}): ${r.content.slice(0, 160)}`);
  return `\n\nWeb research (${results[0]?.source ?? 'search'}):\n${lines.join('\n')}`;
}
