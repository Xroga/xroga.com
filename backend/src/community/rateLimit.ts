import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.js';

interface Bucket {
  count: number;
  resetsAt: number;
}

const buckets = new Map<string, Bucket>();

export function communityMutationRateLimit(options: { limit: number; windowMs: number }) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const identity = req.userId ?? req.ip ?? 'unknown';
    const key = `${identity}:${req.method}:${req.baseUrl}${req.route?.path ?? req.path}`;
    const now = Date.now();
    const existing = buckets.get(key);
    const bucket = !existing || existing.resetsAt <= now
      ? { count: 0, resetsAt: now + options.windowMs }
      : existing;
    bucket.count += 1;
    buckets.set(key, bucket);
    res.setHeader('RateLimit-Limit', String(options.limit));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, options.limit - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetsAt / 1000)));
    if (bucket.count > options.limit) {
      res.status(429).json({
        error: 'Too many community submissions. Please wait and try again.',
        code: 'COMMUNITY_RATE_LIMITED',
      });
      return;
    }
    next();
  };
}

export function resetCommunityRateLimitsForTest(): void {
  buckets.clear();
}
