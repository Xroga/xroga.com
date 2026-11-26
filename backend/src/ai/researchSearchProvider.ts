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

const searchQueryTerms = (query: string) => query.match(/(?:[^\s"]|"[^"]*"|"[^"]*$)+/gu) ?? [];
const positiveSiteFilter = /^\(*site:[^\s)]+\)*$/iu;

/** Fit the provider request without dropping trailing domain, language or date filters. */
export function fitDeepseekSearchQuery(query: string): string | undefined {
  const text = query.trim();
  if (!text) return;
  if ([...text].length <= DEEPSEEK_QUERY_MAX) return text;
  const tokens = searchQueryTerms(text);
  const filter = /^-?(?:site|lang|after|before):\S+$/iu;
  const filters = tokens.filter(token => filter.test(token));
  const sites = filters.filter(token => /^site:/iu.test(token));
  const qualifiers = [...filters.filter(token => !/^site:/iu.test(token)), sites.join(' OR ')].filter(Boolean).join(' ');
  const capacity = DEEPSEEK_QUERY_MAX - (qualifiers ? [...qualifiers].length + 1 : 0);
  if (capacity < 1) return;
  const terms = tokens.filter((token, index) => !filter.test(token)
    && !(token === 'OR' && /^site:/iu.test(tokens[index - 1] ?? '') && /^site:/iu.test(tokens[index + 1] ?? '')));
  // Preserve complete quoted phrases, exclusions and their explicit alternatives
  // before filling the remaining space with ordinary topic words.
  const selected = terms.map((term, index) => term.includes('"') || term.startsWith('-')
    || term === 'OR' || terms[index - 1] === 'OR' || terms[index + 1] === 'OR');
  const sizes = terms.map(term => [...term].length + 1);
  let available = capacity + 1 - sizes.reduce((sum, size, index) => sum + (selected[index] ? size : 0), 0);
  if (available < 0) return;
  for (const [index, size] of sizes.entries()) {
    if (selected[index]) continue;
    if (size > available) break;
    selected[index] = true;
    available -= size;
  }
  const result = terms.filter((_, index) => selected[index]);
  if (result.at(-1) === 'OR') result.pop();
  // Unsegmented writing has no word boundary to cut at.
  const unsegmented = terms.length === 1 && !selected[0]
    ? [...terms[0]].slice(0, capacity).join('') : '';
  const topic = result.some(term => term !== 'OR' && !term.startsWith('-')) ? result.join(' ') : unsegmented;
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
  const tokens = searchQueryTerms(query);
  const topic = tokens.filter((term, index) => !positiveSiteFilter.test(term)
    && !(term === 'OR' && (positiveSiteFilter.test(tokens[index - 1] ?? '')
      || positiveSiteFilter.test(tokens[index + 1] ?? '')))).join(' ');
  return topic ? fitDeepseekSearchQuery(`${topic} ${operators}`) : operators;
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
const numberedReference = /^(?:(?:understanding[ \t]+)?(?:success criteri(?:on|a)|sc|criterion|clause|section|rule)[ \t]+)?(\d+(?:\.\d+)+)[.:)]?\s+/iu;
const normativeHeading = /^ {0,3}(?:#{1,6}[ \t]+)?(?:(?:[\p{L}\p{N}-]+[ \t]+){0,2}success criteri(?:on|a)|normative (?:text|requirements?))(?:[ \t]+\([^\r\n)]{1,18}\))?:?[ \t]*\r?$/imu;
const ruleScopeNote = /\b(?:this|the) (?:criterion|clause|requirement|rule|test)\b[^.!?]{0,150}\b(?:rather than|does not (?:apply|include|require|count)|applies only|excludes)\b/iu;

function pageReferenceSections(content: string, identifiers: readonly string[]) {
  // A publisher index often repeats all its reference numbers in a table of
  // contents. Prefer the actual headings and their bodies over that index.
  const headings = [...content.matchAll(/^ {0,3}(?:(#{1,6})[ \t]+|(?=\d+(?:\.\d+){2,}[.:)]?\s+\p{L}))(.*)$/gmu)];
  const sections = new Map<string, { prose: string; explicitHeading: boolean }>();
  headings.forEach((heading, index) => {
    const reference = numberedReference.exec(heading[2])?.[1];
    if (!reference || !identifiers.includes(reference)) return;
    const level = heading[1]?.length ?? 1;
    const nextHeading = headings.find((next, offset) => offset > index && (next[1]?.length ?? 1) <= level);
    const contentEnd = nextHeading?.index ?? content.length;
    const start = (heading.index ?? 0) + heading[0].length;
    const body = content.slice(start, contentEnd).trim();
    if (!body) return;
    const rule = normativeHeading.exec(body);
    const prose = heading[2] + '\n' + (rule ? body.slice(rule.index + rule[0].length).trim() : body);
    const previous = sections.get(reference);
    const explicitHeading = Boolean(heading[1]);
    if (!previous || (explicitHeading && !previous.explicitHeading)
      || (explicitHeading === previous.explicitHeading && prose.length > previous.prose.length)) {
      sections.set(reference, { prose, explicitHeading });
    }
  });
  return identifiers.flatMap(reference => sections.get(reference) ?? []);
}

function referenceExcerpt(section: string, limit: number): string {
  const compact = (prose: string) => prose.replace(/\s+/gu, ' ');
  const clip = (prose: string, size: number) => prose.slice(0, size).replace(/\s+\S*$/u, '');
  const full = compact(section);
  if (full.length <= limit) return full;

  // A rule's scope note can follow lengthy examples. Keep one short note
  // from that same section with the main rule within the existing budget.
  const lead = clip(full, limit);
  const maximumNote = Math.min(480, Math.floor(limit / 3));
  const note = section.split(/\r?\n[ \t]*\r?\n/u).map(compact)
    .find(paragraph => paragraph.length <= maximumNote && ruleScopeNote.test(paragraph) && !lead.includes(paragraph));
  return note ? clip(full, limit - note.length - 2) + '\n\n' + note : lead;
}

export function matchingPageParagraphs(content: string, question: string): string {
  const words = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])
    .map(word => word.length > 4 ? word.replace(/s$/u, '') : word);
  const terms = [...new Set(words(question).filter(word => !retrievalWords.test(word)))];
  const identifiers = [...new Set(question.match(/\b\d+(?:\.\d+)+\b/g) ?? [])];
  if (!terms.length && !identifiers.length) return '';
  let best = '', score = 0;
  const text = content.trim().replace(/[^\S\r\n]+/gu, ' ');
  const sections = pageReferenceSections(text, identifiers);
  if (sections.length >= 2 || (sections.length === 1 && (identifiers.length === 1 || sections[0].explicitHeading))) {
    const separators = (sections.length - 1) * 2;
    const lengths = sections.map(({ prose }) => prose.replace(/\s+/gu, ' ').length);
    const minimumShare = Math.floor((DEEPSEEK_PRIMARY_PAGE_EXCERPT - separators) / lengths.length);
    const spare = lengths.reduce((available, length) => available + Math.max(0, minimumShare - length), 0);
    const longSections = lengths.filter(length => length > minimumShare).length;
    const share = minimumShare + (longSections ? Math.floor(spare / longSections) : 0);
    return sections.map(({ prose }) => referenceExcerpt(prose, share)).join('\n\n');
  }
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
