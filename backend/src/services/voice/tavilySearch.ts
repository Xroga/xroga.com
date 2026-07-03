import { createHash } from 'crypto';
import { getSecret } from '../../config/envSecrets.js';

const TAVILY_URL = 'https://api.tavily.com/search';
const SEARCH_TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const DAILY_SOFT_LIMIT = 30;

interface TavilyCacheEntry {
  answer: string;
  sources: string[];
  createdAt: number;
}

interface TavilyApiResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyApiResponse {
  answer?: string;
  results?: TavilyApiResult[];
}

const searchCache = new Map<string, TavilyCacheEntry>();
let dailySearchCount = 0;
let dailyResetDate = new Date().toDateString();

export class TavilyRateLimitError extends Error {
  constructor() {
    super('Tavily monthly rate limit reached');
    this.name = 'TavilyRateLimitError';
  }
}

export class TavilyTimeoutError extends Error {
  constructor() {
    super('Tavily search timed out');
    this.name = 'TavilyTimeoutError';
  }
}

export interface TavilySearchResult {
  answer: string;
  sources: string[];
  fromCache: boolean;
  empty: boolean;
}

function cacheKey(query: string): string {
  return createHash('sha256').update(query.toLowerCase().trim()).digest('hex');
}

function touchDailyCounter(): boolean {
  const today = new Date().toDateString();
  if (today !== dailyResetDate) {
    dailyResetDate = today;
    dailySearchCount = 0;
  }
  if (dailySearchCount >= DAILY_SOFT_LIMIT) {
    console.warn('[voice/tavily] Daily soft limit reached — using LLM fallback');
    return false;
  }
  dailySearchCount += 1;
  return true;
}

function getCached(query: string): TavilyCacheEntry | null {
  const hit = searchCache.get(cacheKey(query));
  if (!hit) return null;
  if (Date.now() - hit.createdAt > CACHE_TTL_MS) {
    searchCache.delete(cacheKey(query));
    return null;
  }
  return hit;
}

function setCache(query: string, answer: string, sources: string[]) {
  if (searchCache.size > 500) {
    const oldest = searchCache.keys().next().value;
    if (oldest) searchCache.delete(oldest);
  }
  searchCache.set(cacheKey(query), { answer, sources, createdAt: Date.now() });
}

async function fetchTavily(query: string): Promise<TavilyApiResponse> {
  const apiKey = getSecret('TAVILY_API_KEY');
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY not configured');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);

  try {
    const res = await fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: 5,
      }),
    });

    if (res.status === 429) {
      throw new TavilyRateLimitError();
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Tavily error ${res.status}: ${err.slice(0, 200)}`);
    }

    return (await res.json()) as TavilyApiResponse;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new TavilyTimeoutError();
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

function formatTavilyResponse(data: TavilyApiResponse): { answer: string; sources: string[] } {
  const sources = (data.results ?? [])
    .map((r) => r.url)
    .filter(Boolean)
    .slice(0, 5);

  if (data.answer?.trim()) {
    return { answer: data.answer.trim(), sources };
  }

  const snippets = (data.results ?? [])
    .map((r) => r.content?.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (snippets.length === 0) {
    return { answer: '', sources };
  }

  return {
    answer: snippets.join(' '),
    sources,
  };
}

/** Search Tavily with 1h cache, 3s timeout, and daily soft budget */
export async function searchWithTavily(query: string): Promise<TavilySearchResult> {
  const cached = getCached(query);
  if (cached) {
    return {
      answer: cached.answer,
      sources: cached.sources,
      fromCache: true,
      empty: !cached.answer,
    };
  }

  if (!getSecret('TAVILY_API_KEY')) {
    throw new Error('TAVILY_API_KEY not configured');
  }

  if (!touchDailyCounter()) {
    throw new TavilyRateLimitError();
  }

  const data = await fetchTavily(query);
  const { answer, sources } = formatTavilyResponse(data);

  if (answer) {
    setCache(query, answer, sources);
  }

  return {
    answer,
    sources,
    fromCache: false,
    empty: !answer,
  };
}
