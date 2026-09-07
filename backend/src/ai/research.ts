import { getSecret } from '../config/envSecrets.js';
import { normalizeProviderError } from './providerRuntime.js';
import { redactSecrets } from '../lib/truthfulExecution.js';
import { validateResearchUrl } from '../synthesis/research/researchEngine.js';
import { parallelSearch } from './parallelWeb.js';

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
  provider: 'parallel' | 'grok_x' | 'grok_live' | 'none';
  /** True when live X (Twitter) search was requested via Grok. */
  includedXSearch?: boolean;
}

/**
 * Live research for builds/chat.
 * General public-web retrieval uses Parallel. X/Twitter retrieval is isolated in
 * `grokLiveSearch` and is invoked only for an explicit X intent.
 */
export async function gatherResearch(query: string, userId?: string): Promise<ResearchBundle> {
  const q = redactSecrets(query).trim().slice(0, 2_000);
  if (!q) return { query: q, summary: '', sources: [], provider: 'none' };

  const wantsX =
    /\b(x\.com|twitter|#\w+|trending|hackathon|okx|#okxai|crypto\s*news|breaking)\b/i.test(q);

  const xaiKey = getSecret('XAI_API_KEY');
  if (wantsX && xaiKey) {
    try {
      const result = await grokLiveSearch(q, xaiKey, { includeX: true, forceX: true });
      const bundle = result.bundle;
      if (bundle.summary.trim() || bundle.sources.length) return bundle;
    } catch (err) {
      console.warn('[research] X search failed:', normalizeProviderError(err).safeMessage);
    }
  }

  if (userId && getSecret('PARALLEL_API_KEY')) {
    try {
      const result = await parallelSearch({ userId, objective: q, queries: [q] });
      const sources = result.sources.map((source) => ({
        title: source.title,
        url: source.url,
        snippet: source.snippet,
        source: 'parallel',
      }));
      if (sources.length) {
        return {
          query: q,
          summary: sources.map((source) => source.snippet).join('\n\n').slice(0, 4_000),
          sources,
          provider: 'parallel',
        };
      }
    } catch (err) {
      console.warn('[research] Parallel search failed:', normalizeProviderError(err).safeMessage);
    }
  }

  return { query: q, summary: '', sources: [], provider: 'none' };
}

/**
 * Private Grok 4.3 Responses API adapter for native X Search only.
 */
export async function grokLiveSearch(
  query: string,
  apiKey: string,
  _opts: { includeX: boolean; forceX: boolean },
  request: typeof fetch = fetch,
): Promise<{
  bundle: ResearchBundle;
  inputTokens: number;
  outputTokens: number;
  providerRequestId?: string;
}> {
  const apiModel = process.env.GROK_SEARCH_MODEL?.trim() || 'grok-4.3';
  const tools: Array<Record<string, unknown>> = [{ type: 'x_search' }];

  const body = {
    model: apiModel,
    instructions:
      'Return compact evidence from X posts and official X accounts. Preserve citations. Return plain text.',
    input: `Research with X Search only. Include recent relevant posts and official accounts.\n\n${query}`,
    tools,
    temperature: 0.2,
    max_output_tokens: 500,
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
      try {
        validateResearchUrl(value);
        const host = new URL(value).hostname.toLowerCase();
        return host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com');
      } catch { return false; }
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
      includedXSearch: true,
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

export function formatResearchForPrompt(bundle: ResearchBundle): string {
  if (!bundle.sources.length && !bundle.summary) return '';
  const cites = bundle.sources
    .slice(0, 8)
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${s.snippet}`)
    .join('\n\n');
  const xNote = bundle.includedXSearch ? ' · includes live X search' : '';
  return `RESEARCH DATA (${bundle.provider}${xNote}):\n${bundle.summary}\n\nSOURCES:\n${cites}`;
}
