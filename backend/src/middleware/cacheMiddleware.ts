import type { Request, Response, NextFunction } from 'express';
import { getRedis } from '../config/redis.js';

const DEFAULT_TTL_SEC = 60;

export function cacheGet(ttlSec = DEFAULT_TTL_SEC) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET') {
      next();
      return;
    }

    const redis = getRedis();
    if (!redis) {
      next();
      return;
    }

    const userId = (req as { userId?: string }).userId;
    const key = `cache:${req.originalUrl}:${userId ?? 'anon'}`;

    try {
      const cached = await redis.get(key);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.json(JSON.parse(cached));
        return;
      }
    } catch {
      next();
      return;
    }

    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      void redis.setex(key, ttlSec, JSON.stringify(body)).catch(() => {});
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

export async function invalidateCachePattern(pattern: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch {
    // ignore
  }
}
