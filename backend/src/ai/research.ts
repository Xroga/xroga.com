import { getSecret } from '../config/envSecrets.js';
import { MODELS } from './models.js';

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
  provider: 'grok_live' | 'tavily' | 'searxng' | 'none';
  /** True when live X (Twitter) search was requested via Grok. */
  includedXSearch?: boolean;
}

/**
 * Live research for builds/chat.
 * Preferred: Grok (xAI) native live search — web + X — no separate X API key.
 * Fallback: Tavily → SearXNG.
 * Returns provider 'none' only when every source fails (caller must NOT fake a research step).
 */
export async function gatherResearch(query: string): Promise<ResearchBundle> {
  const q = query.trim();
  if (!q) return { query: q, summary: '', sources: [], provider: 'none' };

  const wantsX =
    /\b(x\.com|twitter|#\w+|trending|hackathon|okx|#okxai|crypto\s*news|breaking)\b/i.test(q);

  const grokKey = getSecret('GROK_API_KEY') || getSecret('XAI_API_KEY');
  if (grokKey) {
    try {
      const bundle = await grokLiveSearch(q, grokKey, { includeX: true, forceX: wantsX });
      if (bundle.summary.trim() || bundle.sources.length) return bundle;
    } catch (err) {
      console.warn('[research] Grok live search failed:', (err as Error).message);
    }
  }

  const tavily = getSecret('TAVILY_API_KEY');
  if (tavily) {
    try {
      const bundle = await tavilySearch(q, tavily);
      if (bundle.sources.length) return bundle;
    } catch (err) {
      console.warn('[research] Tavily failed:', (err as Error).message);
    }
  }

  try {
    const bundle = await searxngSearch(q);
    if (bundle.sources.length) return bundle;
  } catch (err) {
    console.warn('[research] SearXNG failed:', (err as Error).message);
  }

  return { query: q, summary: '', sources: [], provider: 'none' };
}

/**
 * Grok chat completions + search_parameters.
 * Default sources = web + X (native). No X developer API required.
 */
async function grokLiveSearch(
  query: string,
  apiKey: string,
  opts: { includeX: boolean; forceX: boolean },
): Promise<ResearchBundle> {
  const apiModel = MODELS.grok_4_5.apiModel;
  const sources: Array<Record<string, unknown>> = [{ type: 'web' }, { type: 'news' }];
  if (opts.includeX) sources.push({ type: 'x' });

  const body = {
    model: apiModel,
    temperature: 0.2,
    max_tokens: 2048,
    messages: [
      {
        role: 'system',
        content:
          'You are Xroga Live research. Summarize current facts with concrete details. Prefer primary sources. If X/Twitter posts matter, cite them. Return plain text; list URLs you relied on.',
      },
      {
        role: 'user',
        content: opts.forceX
          ? `Research with live web + X (Twitter) sources:\n\n${query}\n\nInclude recent posts and official pages when relevant.`
          : `Research with live web (and X when useful):\n\n${query}`,
      },
    ],
    search_parameters: {
      mode: 'on',
      return_citations: true,
      max_search_results: 12,
      sources,
    },
  };

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Grok search HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
    usage?: { num_sources_used?: number };
  };

  const summary = (data.choices?.[0]?.message?.content ?? '').trim();
  const citationUrls = Array.isArray(data.citations)
    ? data.citations.filter((u) => typeof u === 'string' && /^https?:\/\//i.test(u))
    : [];

  const urlSources: ResearchSource[] = citationUrls.slice(0, 12).map((url) => ({
    title: hostTitle(url),
    url,
    snippet: summary.slice(0, 280),
    source: /x\.com|twitter\.com/i.test(url) ? 'x' : 'web',
  }));

  // If citations missing, still keep summary as research (Grok searched live)
  if (!summary && !urlSources.length) {
    return { query, summary: '', sources: [], provider: 'none' };
  }

  return {
    query,
    summary: summary.slice(0, 4000),
    sources: urlSources.length
      ? urlSources
      : [
          {
            title: 'Grok live research',
            url: 'https://x.ai',
            snippet: summary.slice(0, 280),
            source: 'grok_live',
          },
        ],
    provider: 'grok_live',
    includedXSearch: opts.includeX,
  };
}

function hostTitle(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return host;
  } catch {
    return url.slice(0, 48);
  }
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
    signal: AbortSignal.timeout(8_000),
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
  const xNote = bundle.includedXSearch ? ' · includes live X search' : '';
  return `RESEARCH DATA (${bundle.provider}${xNote}):\n${bundle.summary}\n\nSOURCES:\n${cites}`;
}
