/** Per-user rate limiter — 100 requests per minute */

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

const buckets = new Map<string, { count: number; windowStart: number }>();

export function checkRateLimit(userId: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  let bucket = buckets.get(userId);

  if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
    bucket = { count: 0, windowStart: now };
    buckets.set(userId, bucket);
  }

  if (bucket.count >= MAX_REQUESTS) {
    const retryAfterSeconds = Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.count += 1;
  return { allowed: true };
}

/** Prune stale buckets periodically */
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= WINDOW_MS * 2) {
      buckets.delete(key);
    }
  }
}, WINDOW_MS).unref();
