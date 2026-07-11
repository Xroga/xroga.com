const CACHE_KEY = 'xroga-repo-analysis-cache';

export interface CachedRepoAnalysis {
  repo: string;
  branch: string;
  summary: string;
  techStack: string[];
  fileCount: number;
  scannedAt: number;
}

export function getCachedRepoAnalysis(repo: string, branch: string): CachedRepoAnalysis | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRepoAnalysis;
    if (parsed.repo !== repo || parsed.branch !== branch) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setCachedRepoAnalysis(entry: CachedRepoAnalysis): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
}

/** Call after a build pushes new files so the next manual refresh re-scans. */
export function markRepoAnalysisStale(repo: string): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CachedRepoAnalysis;
    if (parsed.repo === repo) {
      localStorage.removeItem(CACHE_KEY);
    }
  } catch {
    localStorage.removeItem(CACHE_KEY);
  }
}
