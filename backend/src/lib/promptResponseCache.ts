import crypto from 'crypto';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

const DEFAULT_TTL_MS = Number(process.env.PROMPT_CACHE_TTL_MS ?? 6 * 60 * 60 * 1000);
const MAX_ENTRIES = Number(process.env.PROMPT_CACHE_MAX ?? 500);

function cacheKey(namespace: string, payload: string): string {
  return `${namespace}:${crypto.createHash('sha256').update(payload).digest('hex').slice(0, 24)}`;
}

function prune(): void {
  if (store.size <= MAX_ENTRIES) return;
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt < now) store.delete(k);
  }
  while (store.size > MAX_ENTRIES) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
}

export async function cachedPromptResult<T>(
  namespace: string,
  payload: string,
  factory: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS
): Promise<T> {
  const key = cacheKey(namespace, payload);
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) {
    return hit.value as T;
  }
  const value = await factory();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  prune();
  return value;
}

export function invalidatePromptCache(namespace?: string): void {
  if (!namespace) {
    store.clear();
    return;
  }
  for (const k of store.keys()) {
    if (k.startsWith(`${namespace}:`)) store.delete(k);
  }
}
