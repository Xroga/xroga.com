/**
 * Max 1 heavy build (website / negotiation) per user.
 * Redis SET NX when available; in-memory fallback for local/dev.
 */

import { getRedis } from '../config/redis.js';
import { isProductBuildRequest } from './buildIntent.js';

const MEMORY_TTL_MS = 30 * 60 * 1000;
const REDIS_TTL_SEC = 30 * 60;

const memoryLocks = new Map<string, { token: string; expiresAt: number }>();

export function isHeavyBuildPrompt(prompt: string, featureCategory?: string): boolean {
  if (
    featureCategory === 'landing_page' ||
    featureCategory === 'code_debug' ||
    featureCategory === 'browser_automation'
  ) {
    return true;
  }
  return isProductBuildRequest(prompt);
}

function memoryAcquire(userId: string, token: string): boolean {
  const now = Date.now();
  const existing = memoryLocks.get(userId);
  if (existing && existing.expiresAt > now && existing.token !== token) {
    return false;
  }
  memoryLocks.set(userId, { token, expiresAt: now + MEMORY_TTL_MS });
  return true;
}

function memoryRelease(userId: string, token: string): void {
  const existing = memoryLocks.get(userId);
  if (existing?.token === token) memoryLocks.delete(userId);
}

export async function acquireHeavyBuildSlot(
  userId: string,
  token: string
): Promise<{ ok: true } | { ok: false; code: 'HEAVY_BUSY' }> {
  const redis = getRedis();
  if (redis) {
    try {
      const key = `xroga:heavy-build:${userId}`;
      const result = await redis.set(key, token, 'EX', REDIS_TTL_SEC, 'NX');
      if (result === 'OK') return { ok: true };
      const current = await redis.get(key);
      if (current === token) return { ok: true };
      return { ok: false, code: 'HEAVY_BUSY' };
    } catch (err) {
      console.warn('[heavyBuildLock] redis acquire failed, using memory:', (err as Error).message);
    }
  }
  return memoryAcquire(userId, token) ? { ok: true } : { ok: false, code: 'HEAVY_BUSY' };
}

export async function releaseHeavyBuildSlot(userId: string, token: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const key = `xroga:heavy-build:${userId}`;
      const current = await redis.get(key);
      if (current === token) await redis.del(key);
    } catch (err) {
      console.warn('[heavyBuildLock] redis release failed:', (err as Error).message);
    }
  }
  memoryRelease(userId, token);
}

export const HEAVY_BUSY_MESSAGE =
  'Your current build is still running — this one is queued. Chat and planning stay available while you wait.';
