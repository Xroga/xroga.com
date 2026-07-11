import { tavilySearch } from './tavily.js';

export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  source: 'searxng' | 'brave' | 'tavily';
}

interface SearxResult {
  results?: Array<{ title?: string; url?: string; content?: string }>;
}

async function searxngSearch(baseUrl: string, query: string, maxResults: number): Promise<WebSearchResult[]> {
  const url = new URL('/search', baseUrl.replace(/\/$/, ''));
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('language', 'en');

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(12_000),
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

async function braveSearch(apiKey: string, query: string, maxResults: number): Promise<WebSearchResult[]> {
  const url = new URL('https://api.search.brave.com/res/v1/web/search');
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(Math.min(maxResults, 20)));

  const res = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': apiKey,
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) throw new Error(`Brave Search ${res.status}`);

  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  return (data.web?.results ?? [])
    .filter((r) => r.title && r.url)
    .slice(0, maxResults)
    .map((r) => ({
      title: r.title!,
      url: r.url!,
      content: (r.description ?? '').slice(0, 500),
      source: 'brave' as const,
    }));
}

/**
 * Free-first web search: SearXNG → Brave → Tavily (critical / fallback).
 */
export async function webSearch(
  query: string,
  opts?: { critical?: boolean; maxResults?: number }
): Promise<WebSearchResult[]> {
  const maxResults = opts?.maxResults ?? 8;
  const searxUrl = process.env.SEARXNG_URL?.trim();
  const braveKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  const tavilyKey = process.env.TAVILY_API_KEY?.trim();

  if (!opts?.critical && searxUrl) {
    try {
      const results = await searxngSearch(searxUrl, query, maxResults);
      if (results.length) return results;
    } catch (err) {
      console.warn('[webSearch] SearXNG:', (err as Error).message);
    }
  }

  if (braveKey) {
    try {
      const results = await braveSearch(braveKey, query, maxResults);
      if (results.length) return results;
    } catch (err) {
      console.warn('[webSearch] Brave:', (err as Error).message);
    }
  }

  if (searxUrl && opts?.critical) {
    try {
      const results = await searxngSearch(searxUrl, query, maxResults);
      if (results.length) return results;
    } catch (err) {
      console.warn('[webSearch] SearXNG retry:', (err as Error).message);
    }
  }

  if (tavilyKey && (opts?.critical || (!searxUrl && !braveKey))) {
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
