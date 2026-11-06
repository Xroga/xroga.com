import { getSecret } from '../config/envSecrets.js';
import type {TenantModelScope} from './tenantModelDispatch.js';
import {isTerminalModelFailure} from './providerRuntime.js';
import { normalizeProviderError } from './providerRuntime.js';
import { redactSecrets } from '../lib/truthfulExecution.js';
import { validateResearchUrl } from '../synthesis/research/researchEngine.js';
import { parallelSearch } from './parallelWeb.js';

export interface ResearchSource {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt?: string;
}

export interface ResearchBundle {
  query: string;
  summary: string;
  sources: ResearchSource[];
  provider: 'parallel' | 'native_fetch' | 'deepseek' | 'grok_x' | 'grok_live' | 'none';
  /** True when live X (Twitter) search was requested via Grok. */
  includedXSearch?: boolean;
}

/**
 * Live research for builds/chat.
 * General public-web retrieval uses Parallel. X/Twitter retrieval is isolated in
 * `grokLiveSearch` and is invoked only for an explicit X intent.
 */
export async function gatherResearch(query: string, userId?: string, dispatchScope?: TenantModelScope): Promise<ResearchBundle> {
  const q = redactSecrets(query).trim().slice(0, 2_000);
  if (!q) return { query: q, summary: '', sources: [], provider: 'none' };

  // Search is retrieval only. All synthesis uses the canonical Zurelay model path.

  if (userId && getSecret('DEEPSEEK_WEBSEARCH_FETCH_API')) {
    try {
      const result = await parallelSearch({ userId, dispatchScope, objective: q, queries: [q] });
      const sources = result.sources.map((source) => ({
        title: source.title,
        url: source.url,
        snippet: source.snippet,
        source: 'web',
      }));
      if (sources.length) {
        return {
          query: q,
          summary: sources.map((source) => source.snippet).join('\n\n').slice(0, 4_000),
          sources,
          provider: 'deepseek',
        };
      }
    } catch (err) {
      if(isTerminalModelFailure(err))throw err;
      console.warn('[research] DeepSeek Search failed:', normalizeProviderError(err).safeMessage);
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
  throw Object.assign(new Error('This historical generative research provider is retired.'), {code:'MODEL_DESTINATION_DENIED', status:400});
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
