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
/** Primary-source and official-link discovery need broader results. DeepSeek bills per
 * successful request, independently of the requested result count. */
export const DEEPSEEK_DISCOVERY_RESULTS = 25;
// Only explicit, scoped primary-source lookups request page bodies. Their
// smaller result set avoids pulling full text from incidental results.
export const DEEPSEEK_PRIMARY_PAGE_RESULTS = 12;
export const DEEPSEEK_PRIMARY_PAGE_EXCERPT = 3_200;

/** Fit the provider request without dropping trailing domain, language or date filters. */
export function fitDeepseekSearchQuery(query: string): string | undefined {
  const text = query.trim();
  if (!text) return;
  if ([...text].length <= DEEPSEEK_QUERY_MAX) return text;
  const tokens = text.match(/-?"[^"]*"|\S+/gu) ?? [];
  const filter = /^-?(?:site|lang|after|before):\S+$/iu;
  const filters = tokens.filter(token => filter.test(token));
  const sites = filters.filter(token => /^site:/iu.test(token));
  const qualifiers = [...filters.filter(token => !/^site:/iu.test(token)), sites.join(' OR ')].filter(Boolean).join(' ');
  const capacity = DEEPSEEK_QUERY_MAX - (qualifiers ? [...qualifiers].length + 1 : 0);
  if (capacity < 1) return;
  const terms = tokens.filter((token, index) => !filter.test(token)
    && !(token === 'OR' && /^site:/iu.test(tokens[index - 1] ?? '') && /^site:/iu.test(tokens[index + 1] ?? '')));
  const result: string[] = [];
  let available = capacity;
  for (const term of terms) {
    const size = [...term].length;
    if (size > available) break;
    result.push(term);
    available -= size + 1;
  }
  if (result.at(-1) === 'OR') result.pop();
  // Unsegmented writing has no word boundary to cut at.
  const unsegmented = terms.length === 1 && !terms[0].includes('"') && !qualifiers
    ? [...terms[0]].slice(0, capacity).join('') : '';
  const topic = result.join(' ') || unsegmented;
  return topic ? [topic, qualifiers].filter(Boolean).join(' ') : undefined;
}

export function officialResearchDomains(domains: readonly string[]): string[] {
  return [...new Set(domains.map(domain => domain.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, ''))
    .filter(domain => /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62}$/.test(domain)))];
}

export function matchesOfficialResearchDomain(url: string, domains: readonly string[]): boolean {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  return domains.some(domain => host === domain || host.endsWith('.' + domain));
}

/** The bounded Search request has no domain field. Its documented site operator
 * goes in the reviewed query, before the canonical approval is created. */
export function scopeOfficialSearchQuery(query: string, domains: readonly string[]): string | undefined {
  const limit = DEEPSEEK_QUERY_MAX;
  const sites: string[] = [];
  for (const domain of officialResearchDomains(domains)) {
    const next = [...sites, 'site:' + domain].join(' OR ');
    if (next.length + 2 < limit) sites.push('site:' + domain);
  }
  if (!sites.length) return;
  const operators = sites.join(' OR ');
  const terms = query.replace(/-?site:\S+/gi, '').replace(/\bOR\b/gi, ' ').replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim();
  const scopedTerms = [...terms].slice(0, limit - operators.length - 1).join('').trimEnd();
  return scopedTerms ? `${scopedTerms} ${operators}` : operators;
}

/** The dedicated server-side search credential, or undefined when research search is unavailable. */
export function deepseekSearchCredential(): string | undefined {
  return getSecret('DEEPSEEK_WEBSEARCH_FETCH_API') || undefined;
}

export function researchSearchMicroUsd(): number {
  return DEEPSEEK_SEARCH_MICRO_USD;
}

/** One bounded DeepSeek request built from the already validated Parallel-shaped body. */
export function deepseekSearchBody(body: { objective: string; search_queries: string[] }, count = DEEPSEEK_SEARCH_RESULTS,
  includePageContent = false): { query: string; count: number; ori_question?: string; need_content?: true } {
  const query = [...body.search_queries[0].trim()].slice(0, DEEPSEEK_QUERY_MAX).join('');
  const question = [...body.objective.trim()].slice(0, DEEPSEEK_QUERY_MAX).join('');
  return { query, count, ...(question ? { ori_question: question } : {}), ...(includePageContent ? { need_content: true } : {}) };
}

interface DeepseekResult { url?: unknown; title?: unknown; summary?: unknown; snippet?: unknown; content?: unknown; date?: unknown; site_name?: unknown; site_icon?: unknown }
export interface SearchResult {
  url: string; title?: string; publish_date: string | null; excerpts: string[]; site_name?: string; site_icon_domain?: string;
  publisherEvidence?: { linkedFrom: string; documentUrl: string };
}
const retrievalWords = /^(?:find|original|primary|final|source|publication|standard|dataset|paper|report|rule|official)$/iu;

export function matchingPageParagraphs(content: string, question: string): string {
  const words = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])
    .map(word => word.length > 4 ? word.replace(/s$/u, '') : word);
  const terms = [...new Set(words(question).filter(word => !retrievalWords.test(word)))];
  const identifiers = [...new Set(question.match(/\b\d+(?:\.\d+)+\b/g) ?? [])];
  if (!terms.length && !identifiers.length) return '';
  let best = '', score = 0;
  const text = content.trim().replace(/[^\S\r\n]+/gu, ' ');
  for (let start = 0; start < text.length; start += 400) {
    const end = start + DEEPSEEK_PRIMARY_PAGE_EXCERPT;
    const passage = text.slice(start, end)
      .replace(start ? /^\S*\s+/u : /^$/u, '').replace(end < text.length ? /\s+\S*$/u : /^$/u, '');
    const passageWords = words(passage);
    const matches = new Set(passageWords);
    const matchedTerms = terms.filter(word => matches.has(word)).length;
    const foundIdentifiers = new Set(passage.match(/\b\d+(?:\.\d+)+\b/g) ?? []);
    const matchedIdentifiers = identifiers.filter(id => foundIdentifiers.has(id)).length;
    if (matchedTerms === 0 && matchedIdentifiers === 0) continue;
    const definitions = passage.match(/(?:^|\s)[•▪◦]\s+\p{L}[\p{L}\p{N}\s()[\]_-]{0,55}?(?:\s[–—]\s|:\s)/gu)?.length ?? 0;
    const relevant = matchedTerms + 6 * matchedIdentifiers + Math.min(3, definitions);
    if (relevant > score || (relevant === score && passage.length < best.length)) {
      score = relevant;
      best = passage;
    }
  }
  return best.replace(/\s+/gu, ' ');
}

function iconDomain(value: unknown, source: string): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const domain = new URL(source).hostname.replace(/^www\./i, '').toLowerCase();
    if (value === 'https://cdn.deepseek.com/site-icons/' + domain) return domain;
  } catch { /* Unusable source URL is handled by evidence validation. */ }
}

/**
 * Normalise a DeepSeek response into the existing Parallel result shape, so normalisation, trust ranking, citations and
 * persistence downstream stay unchanged. Retrieved text is untrusted data: it is carried as an excerpt, never as
 * instructions. Anything malformed is rejected rather than guessed.
 */
export function normaliseDeepseekSearch(raw: unknown, traceId: string | null, primaryQuestion?: string): { search_id: string; provider: 'deepseek'; results: SearchResult[] } {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { results?: unknown }).results)) throw new Error('Malformed provider result');
  const results = ((raw as { results: unknown[] }).results).map(item => {
    if (!item || typeof item !== 'object') throw new Error('Malformed provider result');
    const r = item as DeepseekResult;
    if (typeof r.url !== 'string' || (r.title !== undefined && typeof r.title !== 'string')) throw new Error('Malformed provider result');
    const primaryText = primaryQuestion && typeof r.content === 'string' ? matchingPageParagraphs(r.content, primaryQuestion) : '';
    const summary = typeof r.summary === 'string' && r.summary.trim() ? r.summary : typeof r.snippet === 'string' ? r.snippet : '';
    const excerpt = primaryText || summary.slice(0, 2_000);
    const date = typeof r.date === 'string' && !Number.isNaN(Date.parse(r.date)) ? r.date : null;
    const siteName = typeof r.site_name === 'string' ? r.site_name.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120) : '';
    const domain = iconDomain(r.site_icon, r.url);
    return { url: r.url, ...(typeof r.title === 'string' ? { title: r.title } : {}),
      publish_date: date, excerpts: excerpt ? [excerpt] : [],
      ...(siteName ? { site_name: siteName } : {}), ...(domain ? { site_icon_domain: domain } : {}) };
  });
  if (typeof traceId !== 'string' || !/^[A-Za-z0-9-]{8,200}$/.test(traceId)) throw new Error('Missing or unsafe provider request identity');
  return { search_id: traceId, provider: 'deepseek', results };
}
