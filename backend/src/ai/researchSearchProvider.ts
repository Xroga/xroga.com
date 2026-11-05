import {getSecret} from '../config/envSecrets.js';

/**
 * Which retrieval provider answers a governed public-web search, and its fixed per-request price.
 *
 * Official DeepSeek Search (POST https://api.deepseek.com/v1/tools/search) is a retrieval tool only. Its credential is
 * never used for chat, coding or presentation; Zurelay DeepSeek still writes every answer. DeepSeek is selected only
 * when the operator turned it on AND its dedicated credential is present, so a missing secret falls back to the
 * existing Parallel provider instead of failing research. Approval and dispatch both read this one function, so the
 * approved maximum and the charged amount can never disagree.
 *
 * Prices (micro-USD per successful request): DeepSeek $0.75 / 1,000 (docs: api-docs.deepseek.com/guides/search,
 * checked 2026-11-05; failed, empty and timed-out requests are not billed). Parallel Turbo $0.001.
 */
export type ResearchSearchProvider = 'deepseek' | 'parallel';
export const DEEPSEEK_SEARCH_URL = 'https://api.deepseek.com/v1/tools/search';
export const DEEPSEEK_SEARCH_MICRO_USD = 750;
export const PARALLEL_SEARCH_MICRO_USD = 1000;
/** DeepSeek accepts 1-128 characters for `query` and `ori_question`. */
export const DEEPSEEK_QUERY_MAX = 128;
export const DEEPSEEK_SEARCH_RESULTS = 10;

export function researchSearchProvider(env: NodeJS.ProcessEnv = process.env): ResearchSearchProvider {
  return env.XROGA_RESEARCH_SEARCH_PROVIDER === 'deepseek' && Boolean(getSecret('DEEPSEEK_WEBSEARCH_FETCH_API')) ? 'deepseek' : 'parallel';
}

export function researchSearchMicroUsd(provider: ResearchSearchProvider = researchSearchProvider()): number {
  return provider === 'deepseek' ? DEEPSEEK_SEARCH_MICRO_USD : PARALLEL_SEARCH_MICRO_USD;
}

/** One bounded DeepSeek request built from the already validated Parallel-shaped body. */
export function deepseekSearchBody(body: { objective: string; search_queries: string[] }): { query: string; count: number; ori_question?: string } {
  const query = body.search_queries[0].trim().slice(0, DEEPSEEK_QUERY_MAX);
  const question = body.objective.trim().slice(0, DEEPSEEK_QUERY_MAX);
  return { query, count: DEEPSEEK_SEARCH_RESULTS, ...(question ? { ori_question: question } : {}) };
}

interface DeepseekResult { url?: unknown; title?: unknown; summary?: unknown; snippet?: unknown; date?: unknown; site_name?: unknown }

/**
 * Normalise a DeepSeek response into the existing Parallel result shape, so normalisation, trust ranking, citations and
 * persistence downstream stay unchanged. Retrieved text is untrusted data: it is carried as an excerpt, never as
 * instructions. Anything malformed is rejected rather than guessed.
 */
export function normaliseDeepseekSearch(raw: unknown, traceId: string | null): { search_id: string; provider: 'deepseek'; results: Array<{ url: string; title?: string; publish_date: string | null; excerpts: string[] }> } {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { results?: unknown }).results)) throw new Error('Malformed provider result');
  const results = ((raw as { results: unknown[] }).results).map(item => {
    if (!item || typeof item !== 'object') throw new Error('Malformed provider result');
    const r = item as DeepseekResult;
    if (typeof r.url !== 'string' || (r.title !== undefined && typeof r.title !== 'string')) throw new Error('Malformed provider result');
    const excerpt = typeof r.summary === 'string' && r.summary.trim() ? r.summary : typeof r.snippet === 'string' ? r.snippet : '';
    const date = typeof r.date === 'string' && !Number.isNaN(Date.parse(r.date)) ? r.date : null;
    return { url: r.url, ...(typeof r.title === 'string' ? { title: r.title } : {}), publish_date: date, excerpts: excerpt ? [excerpt.slice(0, 2_000)] : [] };
  });
  if (typeof traceId !== 'string' || !/^[A-Za-z0-9-]{8,200}$/.test(traceId)) throw new Error('Missing or unsafe provider request identity');
  return { search_id: traceId, provider: 'deepseek', results };
}
