import { getSecret } from '../config/envSecrets.js';
import { configuredApiModel } from './openaiCompat.js';
import { normalizeProviderError, recordModelExecution } from './providerRuntime.js';
import { redactSecrets } from '../lib/truthfulExecution.js';
import { validateResearchUrl } from '../synthesis/research/researchEngine.js';
import { withProviderReservation } from './providerBudget.js';

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
export async function gatherResearch(query: string, userId?: string): Promise<ResearchBundle> {
  const q = redactSecrets(query).trim().slice(0, 2_000);
  if (!q) return { query: q, summary: '', sources: [], provider: 'none' };

  const wantsX =
    /\b(x\.com|twitter|#\w+|trending|hackathon|okx|#okxai|crypto\s*news|breaking)\b/i.test(q);

  const grokKey = getSecret('GROK_API_KEY') || getSecret('XAI_API_KEY');
  if (grokKey) {
    const started = Date.now();
    try {
      const execute = () => grokLiveSearch(q, grokKey, { includeX: true, forceX: wantsX });
      const result = userId
        ? await withProviderReservation({
            userId,
            modelId: 'grok_4_5',
            estimatedInputTokens: Math.max(1, Math.ceil(q.length / 4) + 180),
            maximumOutputTokens: 2048,
            purpose: 'daily_work',
            execute,
          })
        : await execute();
      const bundle = result.bundle;
      recordModelExecution('grok_4_5', { ok: true, latencyMs: Date.now() - started });
      if (bundle.summary.trim() || bundle.sources.length) return bundle;
    } catch (err) {
      recordModelExecution('grok_4_5', {
        ok: false,
        latencyMs: Date.now() - started,
        error: err,
      });
      console.warn('[research] Grok live search failed:', normalizeProviderError(err).safeMessage);
    }
  }

  const tavily = getSecret('TAVILY_API_KEY');
  // Shared paid search must not bypass the entitlement ledger. Until an exact,
  // versioned per-request price is configured, use the free metasearch fallback.
  if (tavily && !userId) {
    try {
      const bundle = await tavilySearch(q, tavily);
      if (bundle.sources.length) return bundle;
    } catch (err) {
      console.warn('[research] Tavily failed:', normalizeProviderError(err).safeMessage);
    }
  }

  try {
    const bundle = await searxngSearch(q);
    if (bundle.sources.length) return bundle;
  } catch (err) {
    console.warn('[research] SearXNG failed:', normalizeProviderError(err).safeMessage);
  }

  return { query: q, summary: '', sources: [], provider: 'none' };
}

/**
 * Grok Responses API with native web/X tools.
 * Default sources = web + X (native). No X developer API required.
 */
export async function grokLiveSearch(
  query: string,
  apiKey: string,
  opts: { includeX: boolean; forceX: boolean },
  request: typeof fetch = fetch,
): Promise<{
  bundle: ResearchBundle;
  inputTokens: number;
  outputTokens: number;
  providerRequestId?: string;
}> {
  const apiModel = configuredApiModel('grok_4_5');
  const tools: Array<Record<string, unknown>> = [{ type: 'web_search' }];
  if (opts.includeX) tools.push({ type: 'x_search' });

  const body = {
    model: apiModel,
    instructions:
      'You are Xroga Live research. Summarize current facts with concrete details. Prefer primary sources and preserve citations. Return plain text.',
    input: opts.forceX
      ? `Research with live web + X sources. Include recent posts and official pages when relevant.\n\n${query}`
      : `Research with live web sources, and use X when useful.\n\n${query}`,
    tools,
    temperature: 0.2,
    max_output_tokens: 2048,
  };

  const res = await request('https://api.x.ai/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw Object.assign(new Error('Grok search request failed'), { status: res.status });
  }

  const data = (await res.json()) as {
    id?: string;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
        annotations?: Array<{ type?: string; url?: string; title?: string }>;
      }>;
    }>;
    citations?: Array<string | { url?: string; title?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number; num_sources_used?: number };
  };

  const contentItems = (data.output ?? []).flatMap((item) => item.content ?? []);
  const summary = contentItems
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('\n')
    .trim();
  const citationCandidates = [
    ...(data.citations ?? []).map((citation) =>
      typeof citation === 'string' ? { url: citation } : citation,
    ),
    ...contentItems.flatMap((item) => item.annotations ?? []),
  ];
  const citationUrls = [...new Set(citationCandidates.map((citation) => citation.url))]
    .filter((value): value is string => {
      if (typeof value !== 'string') return false;
      try { validateResearchUrl(value); return true; } catch { return false; }
    });

  const urlSources: ResearchSource[] = citationUrls.slice(0, 12).map((url) => ({
    title: hostTitle(url),
    url,
    snippet: summary.slice(0, 280),
    source: /x\.com|twitter\.com/i.test(url) ? 'x' : 'web',
  }));

  // An uncited model summary is not durable research evidence.
  if (!urlSources.length) {
    return {
      bundle: { query, summary: '', sources: [], provider: 'none' },
      inputTokens: data.usage?.input_tokens ?? Math.max(1, Math.ceil(query.length / 4)),
      outputTokens: data.usage?.output_tokens ?? Math.max(1, Math.ceil(summary.length / 4)),
      providerRequestId: data.id,
    };
  }

  return {
    bundle: {
      query,
      summary: summary.slice(0, 4000),
      sources: urlSources,
      provider: 'grok_live',
      includedXSearch: opts.includeX,
    },
    inputTokens: data.usage?.input_tokens ?? Math.max(1, Math.ceil(query.length / 4)),
    outputTokens: data.usage?.output_tokens ?? Math.max(1, Math.ceil(summary.length / 4)),
    providerRequestId: data.id,
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
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      search_depth: 'basic',
      include_answer: true,
      max_results: 8,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw Object.assign(new Error('Tavily request failed'), { status: res.status });
  const data = (await res.json()) as {
    answer?: string;
    results?: Array<{ title?: string; url?: string; content?: string }>;
  };
  const sources: ResearchSource[] = (data.results ?? [])
    .filter((r) => { try { if (!r.url) return false; validateResearchUrl(r.url); return true; } catch { return false; } })
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
  validateResearchUrl(base);
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
    .filter((r) => { try { if (!r.url) return false; validateResearchUrl(r.url); return true; } catch { return false; } })
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
