import { getSecret } from '../config/envSecrets.js';

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export interface ResearchBundle {
  query: string;
  summary: string;
  sources: ResearchSource[];
  provider: 'tavily' | 'searxng' | 'none';
}

/**
 * Gather raw research: Tavily (preferred) → SearXNG (free fallback).
 * LLMs (Kimi/Grok) synthesize — search engines only collect.
 */
export async function gatherResearch(query: string): Promise<ResearchBundle> {
  const tavily = getSecret('TAVILY_API_KEY');
  if (tavily) {
    try {
      const bundle = await tavilySearch(query, tavily);
      if (bundle.sources.length) return bundle;
    } catch (err) {
      console.warn('[research] Tavily failed:', (err as Error).message);
    }
  }

  try {
    const bundle = await searxngSearch(query);
    if (bundle.sources.length) return bundle;
  } catch (err) {
    console.warn('[research] SearXNG failed:', (err as Error).message);
  }

  return { query, summary: '', sources: [], provider: 'none' };
}

async function tavilySearch(query: string, apiKey: string): Promise<ResearchBundle> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      include_answer: true,
      max_results: 8,
    }),
  });
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
  const data = (await res.json()) as {
    answer?: string;
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const sources: ResearchSource[] = (data.results ?? [])
    .filter((r) => r.url)
    .map((r) => ({
      title: r.title || r.url || 'Source',
      url: r.url!,
      snippet: (r.content || '').slice(0, 400),
      source: 'tavily',
    }));
  return {
    query,
    summary: data.answer || sources.map((s) => s.snippet).join('\n\n').slice(0, 3000),
    sources,
    provider: 'tavily',
  };
}

async function searxngSearch(query: string): Promise<ResearchBundle> {
  const base = (process.env.SEARXNG_URL || 'https://searx.be').replace(/\/$/, '');
  const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`;
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'XrogaResearch/2.0' },
  });
  if (!res.ok) throw new Error(`SearXNG HTTP ${res.status}`);
  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const sources: ResearchSource[] = (data.results ?? [])
    .slice(0, 8)
    .filter((r) => r.url)
    .map((r) => ({
      title: r.title || r.url || 'Source',
      url: r.url!,
      snippet: (r.content || '').slice(0, 400),
      source: 'searxng',
    }));
  return {
    query,
    summary: sources.map((s) => `- ${s.title}: ${s.snippet}`).join('\n').slice(0, 3000),
    sources,
    provider: 'searxng',
  };
}

export function formatResearchForPrompt(bundle: ResearchBundle): string {
  if (!bundle.sources.length && !bundle.summary) return '';
  const cites = bundle.sources
    .slice(0, 8)
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.snippet}`)
    .join('\n\n');
  return `RESEARCH DATA (${bundle.provider}):\n${bundle.summary}\n\nSOURCES:\n${cites}`;
}
