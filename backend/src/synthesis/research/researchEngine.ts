import { createHash } from 'crypto';
import { redactSecrets } from '../../lib/truthfulExecution.js';

export type ResearchTrust = 'A_official' | 'B_primary' | 'C_secondary' | 'D_discovery';
export type ResearchProviderId = 'xai' | 'tavily' | 'direct';

export interface ResearchRequest {
  query: string;
  purpose: string;
  maximumProviderCalls: number;
  maximumSources: number;
  maximumBytesPerSource: number;
  officialDomains: string[];
  verifiedOfficialXHandles?: string[];
  requiredFreshnessDays?: number;
  allowXDiscovery?: boolean;
  startDate?: string;
  endDate?: string;
}

export interface ResearchCandidate { url: string; title: string; excerpt: string; publishedAt?: string; xHandle?: string; }
export interface ResearchProvider {
  id: ResearchProviderId;
  search(request: ResearchRequest, signal: AbortSignal): Promise<ResearchCandidate[]>;
}

export interface ResearchEvidence extends ResearchCandidate {
  id: string;
  canonicalUrl: string;
  contentHash: string;
  provider: ResearchProviderId;
  trust: ResearchTrust;
  fetchedAt: string;
  expiresAt: string;
  citationAllowed: boolean;
}

export function requireFreshAuthoritativeEvidence(evidence: ResearchEvidence[], now = new Date()): ResearchEvidence[] {
  const valid = evidence.filter((item) => item.trust === 'A_official' && item.citationAllowed && new Date(item.expiresAt) > now);
  if (!valid.length) throw new Error('current authoritative evidence is required');
  return valid;
}

export function validateImplementationIdentifier(value: string, evidence: ResearchEvidence[], now = new Date()): string {
  if (!/^(?:0x[a-fA-F0-9]{40}|[1-9A-HJ-NP-Za-km-z]{32,64}|[CG][A-Z2-7]{55})$/.test(value)) throw new Error('identifier has an invalid chain-specific shape');
  const authoritative = requireFreshAuthoritativeEvidence(evidence, now);
  if (!authoritative.some((item) => item.excerpt.toLowerCase().includes(value.toLowerCase()))) throw new Error('identifier is not supported by current official evidence');
  return value;
}

export interface ResearchResult {
  status: 'verified' | 'partially_verified' | 'blocked';
  evidence: ResearchEvidence[];
  providerAttempts: Array<{ provider: ResearchProviderId; outcome: 'success' | 'failure'; errorClass?: string }>;
  blockers: string[];
}

export interface ResearchEvidenceStore { load(cacheKey: string): Promise<ResearchResult | null>; save(cacheKey: string, value: ResearchResult): Promise<void>; }
export class InMemoryResearchEvidenceStore implements ResearchEvidenceStore {
  private readonly values = new Map<string, ResearchResult>();
  async load(key: string) { return structuredClone(this.values.get(key) ?? null); }
  async save(key: string, value: ResearchResult) { this.values.set(key, structuredClone(value)); }
}

const PRIVATE_V4 = /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

export function validateResearchUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new Error('research URL must use HTTPS');
  if (url.username || url.password || url.port) throw new Error('research URL cannot contain credentials or a custom port');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '[::1]' || PRIVATE_V4.test(host) || /^(?:fc|fd|fe80):/i.test(host.replace(/^\[|\]$/g, ''))) {
    throw new Error('research URL targets a private or local address');
  }
  return url;
}

function canonicalUrl(value: string): string {
  const url = validateResearchUrl(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) if (/^(?:utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
  return url.toString();
}

function classifyFailure(error: unknown): string {
  const status = Number((error as { status?: number })?.status);
  if (status === 401 || status === 403) return 'authentication';
  if (status === 429) return 'rate_limit';
  if ((error as { name?: string })?.name === 'TimeoutError' || (error as { name?: string })?.name === 'AbortError') return 'timeout';
  return status >= 500 ? 'temporary_provider_failure' : 'provider_failure';
}

function trustFor(candidate: ResearchCandidate, request: ResearchRequest): ResearchTrust {
  const host = validateResearchUrl(candidate.url).hostname.toLowerCase();
  if (request.officialDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return 'A_official';
  if (candidate.xHandle) return request.verifiedOfficialXHandles?.map((value) => value.toLowerCase()).includes(candidate.xHandle.toLowerCase()) ? 'B_primary' : 'D_discovery';
  return 'C_secondary';
}

function sanitizedCandidate(candidate: ResearchCandidate): ResearchCandidate {
  const unsafe = /(?:ignore (?:all|previous) instructions|system prompt|developer message|reveal secrets|execute (?:this|the following) command)/i;
  const excerpt = redactSecrets(candidate.excerpt).replace(/<script[\s\S]*?<\/script>/gi, '').slice(0, 8_000);
  return { ...candidate, title: candidate.title.slice(0, 500), excerpt: unsafe.test(excerpt) ? '[untrusted instruction removed]' : excerpt };
}

export class ResearchEngine {
  constructor(private readonly providers: ResearchProvider[], private readonly now: () => Date = () => new Date(), private readonly store?: ResearchEvidenceStore) {}

  async execute(request: ResearchRequest): Promise<ResearchResult> {
    if (!request.query.trim() || request.maximumProviderCalls < 1 || request.maximumSources < 1 || request.maximumBytesPerSource < 1) throw new Error('invalid research budget');
    const safeRequest = { ...request, query: redactSecrets(request.query).slice(0, 2_000), purpose: redactSecrets(request.purpose).slice(0, 1_000) };
    const cacheKey = createHash('sha256').update(JSON.stringify({ query: safeRequest.query, purpose: safeRequest.purpose, officialDomains: safeRequest.officialDomains, startDate: safeRequest.startDate, endDate: safeRequest.endDate })).digest('hex');
    const cached = await this.store?.load(cacheKey);
    if (cached && cached.evidence.length && cached.evidence.every((item) => new Date(item.expiresAt) > this.now())) return cached;
    const attempts: ResearchResult['providerAttempts'] = [];
    const evidence = new Map<string, ResearchEvidence>();
    for (const provider of this.providers.slice(0, request.maximumProviderCalls)) {
      try {
        const candidates = await provider.search(safeRequest, AbortSignal.timeout(15_000));
        attempts.push({ provider: provider.id, outcome: 'success' });
        for (const raw of candidates.slice(0, request.maximumSources)) {
          try {
            const candidate = sanitizedCandidate(raw);
            const url = canonicalUrl(candidate.url);
            const content = candidate.excerpt.slice(0, request.maximumBytesPerSource);
            const key = createHash('sha256').update(`${url}\0${content}`).digest('hex');
            if (evidence.has(key)) continue;
            const fetchedAt = this.now();
            const days = Math.max(1, request.requiredFreshnessDays ?? 30);
            evidence.set(key, { ...candidate, excerpt: content, id: `research-${key.slice(0, 16)}`, canonicalUrl: url, contentHash: key, provider: provider.id, trust: trustFor(candidate, request), fetchedAt: fetchedAt.toISOString(), expiresAt: new Date(fetchedAt.getTime() + days * 86_400_000).toISOString(), citationAllowed: content !== '[untrusted instruction removed]' });
          } catch { /* unsafe individual candidates are excluded */ }
        }
        if ([...evidence.values()].some((item) => item.trust === 'A_official')) break;
      } catch (error) {
        attempts.push({ provider: provider.id, outcome: 'failure', errorClass: classifyFailure(error) });
      }
    }
    const values = [...evidence.values()];
    const hasOfficial = values.some((item) => item.trust === 'A_official' && item.citationAllowed);
    const result: ResearchResult = {
      status: hasOfficial ? 'verified' : values.length ? 'partially_verified' : 'blocked',
      evidence: values,
      providerAttempts: attempts,
      blockers: hasOfficial ? [] : ['No current authoritative source was retrieved; consequential facts remain unverified'],
    };
    await this.store?.save(cacheKey, result);
    return result;
  }
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(`research provider failed (${response.status})`), { status: response.status });
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

export class TavilyResearchProvider implements ResearchProvider {
  readonly id = 'tavily' as const;
  constructor(private readonly apiKey: string, private readonly request: typeof fetch = fetch) { if (!apiKey) throw new Error('Tavily API key is required'); }
  async search(input: ResearchRequest, signal: AbortSignal): Promise<ResearchCandidate[]> {
    const response = await this.request('https://api.tavily.com/search', { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: input.query, search_depth: 'basic', max_results: Math.min(input.maximumSources, 20), include_domains: input.officialDomains, ...(input.startDate ? { start_date: input.startDate } : {}), ...(input.endDate ? { end_date: input.endDate } : {}) }), signal });
    const data = await parseJson(response);
    return (Array.isArray(data.results) ? data.results : []).map((value) => { const item = value as Record<string, unknown>; return { url: String(item.url ?? ''), title: String(item.title ?? ''), excerpt: String(item.content ?? ''), publishedAt: typeof item.published_date === 'string' ? item.published_date : undefined }; });
  }
  async extract(urls: string[], signal: AbortSignal): Promise<Record<string, unknown>> {
    const safeUrls = urls.slice(0, 20).map((url) => validateResearchUrl(url).toString());
    return parseJson(await this.request('https://api.tavily.com/extract', { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ urls: safeUrls, extract_depth: 'basic' }), signal }));
  }
  async map(url: string, signal: AbortSignal): Promise<Record<string, unknown>> {
    return parseJson(await this.request('https://api.tavily.com/map', { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: validateResearchUrl(url).toString(), max_depth: 2, max_breadth: 10, limit: 50 }), signal }));
  }
  async crawl(url: string, signal: AbortSignal): Promise<Record<string, unknown>> {
    return parseJson(await this.request('https://api.tavily.com/crawl', { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url: validateResearchUrl(url).toString(), max_depth: 2, max_breadth: 10, limit: 30, extract_depth: 'basic' }), signal }));
  }
}

export class XaiResearchProvider implements ResearchProvider {
  readonly id = 'xai' as const;
  constructor(private readonly apiKey: string, private readonly model: string, private readonly request: typeof fetch = fetch) { if (!apiKey || !model) throw new Error('xAI API key and current model are required'); }
  async search(input: ResearchRequest, signal: AbortSignal): Promise<ResearchCandidate[]> {
    const dateRange = { ...(input.startDate ? { from_date: input.startDate } : {}), ...(input.endDate ? { to_date: input.endDate } : {}) };
    const webDomains = input.officialDomains.slice(0, 5);
    const tools: Array<Record<string, unknown>> = [{
      type: 'web_search',
      ...(webDomains.length ? { filters: { allowed_domains: webDomains } } : {}),
    }];
    if (input.allowXDiscovery) tools.push({ type: 'x_search', allowed_x_handles: input.verifiedOfficialXHandles?.slice(0, 20) ?? [], ...dateRange });
    const response = await this.request('https://api.x.ai/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: this.model, input: input.query, tools }), signal });
    const data = await parseJson(response);
    const nested = Array.isArray(data.output) ? data.output.flatMap((output) => { const record = output as Record<string, unknown>; return Array.isArray(record.content) ? record.content.flatMap((content) => { const item = content as Record<string, unknown>; return Array.isArray(item.annotations) ? item.annotations : []; }) : []; }) : [];
    const citations = Array.isArray(data.citations) ? data.citations : nested;
    return citations.map((value) => { const item = value as Record<string, unknown>; return { url: String(item.url ?? ''), title: String(item.title ?? item.url ?? ''), excerpt: String(item.snippet ?? ''), xHandle: typeof item.handle === 'string' ? item.handle : undefined }; });
  }
}

export class DirectResearchProvider implements ResearchProvider {
  readonly id = 'direct' as const;
  constructor(private readonly urls: string[], private readonly request: typeof fetch = fetch) {}
  async search(input: ResearchRequest, signal: AbortSignal): Promise<ResearchCandidate[]> {
    const results: ResearchCandidate[] = [];
    for (const raw of this.urls.slice(0, input.maximumSources)) {
      const url = validateResearchUrl(raw);
      const response = await this.request(url, { redirect: 'manual', headers: { Accept: 'text/html,application/json,text/plain' }, signal });
      if (response.status >= 300 && response.status < 400) throw new Error('research redirects require revalidation');
      const type = response.headers.get('content-type') ?? '';
      if (!response.ok || !/(?:text|json|xml)/i.test(type)) throw Object.assign(new Error(`direct source failed (${response.status})`), { status: response.status });
      const text = (await response.text()).slice(0, input.maximumBytesPerSource + 1);
      if (text.length > input.maximumBytesPerSource) throw new Error('direct source exceeds research byte budget');
      results.push({ url: url.toString(), title: url.hostname, excerpt: text });
    }
    return results;
  }
}
