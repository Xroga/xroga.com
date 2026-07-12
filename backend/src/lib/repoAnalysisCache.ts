/** Server-side GitHub repo analysis cache — read once per repo+branch until invalidated */

import type { GitHubRepoAnalysis } from '../services/integrations/githubDeploy.js';

interface CacheEntry {
  key: string;
  analysis: GitHubRepoAnalysis;
  scannedAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function cacheKey(userId: string, repo: string, branch: string): string {
  return `${userId}:${repo}:${branch}`;
}

export function getCachedRepoAnalysis(
  userId: string,
  repo: string,
  branch: string
): GitHubRepoAnalysis | null {
  const key = cacheKey(userId, repo, branch);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.scannedAt > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.analysis;
}

export function setCachedRepoAnalysis(
  userId: string,
  repo: string,
  branch: string,
  analysis: GitHubRepoAnalysis
): void {
  const key = cacheKey(userId, repo, branch);
  cache.set(key, { key, analysis, scannedAt: Date.now() });
}

/** Invalidate when user switches repo or after a successful push */
export function invalidateRepoAnalysis(userId: string, repo?: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}:`)) {
      if (!repo || key.includes(`:${repo}:`)) cache.delete(key);
    }
  }
}
