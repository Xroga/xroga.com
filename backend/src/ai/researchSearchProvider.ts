import {getSecret} from '../config/envSecrets.js';

/**
 * The only public-web search provider: official DeepSeek Search (POST https://api.deepseek.com/v1/tools/search).
 *
 * It is a retrieval tool only. Its dedicated credential is never used for chat, coding or presentation; Zurelay
 * DeepSeek still writes every answer. Parallel is no longer used. Without the DeepSeek credential, search is refused
 * (truthful failure), never silently routed elsewhere. Approval and dispatch read the same price, so the approved
 * maximum and the charged amount cannot disagree.
 *
 * Price: $0.75 per 1,000 successful requests (api-docs.deepseek.com/guides/search, checked 2026-11-05; failed, empty and
 * timed-out requests are not billed).
 */
export const DEEPSEEK_SEARCH_URL = 'https://api.deepseek.com/v1/tools/search';
export const DEEPSEEK_SEARCH_MICRO_USD = 750;
/** DeepSeek accepts 1-128 characters for `query` and `ori_question`. */
export const DEEPSEEK_QUERY_MAX = 128;
export const DEEPSEEK_SEARCH_RESULTS = 10;

/** The dedicated server-side search credential, or undefined when research search is unavailable. */
export function deepseekSearchCredential(): string | undefined {
  return getSecret('DEEPSEEK_WEBSEARCH_FETCH_API') || undefined;
}

export function researchSearchMicroUsd(): number {
  return DEEPSEEK_SEARCH_MICRO_USD;
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
