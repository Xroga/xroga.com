const STORAGE_KEY = 'xroga-repo-context';

export interface SelectedRepoContext {
  repo: string;
  branch: string;
}

/** Repo + branch chosen in the chatbar (outside terminal). */
export function getSelectedRepoContext(): SelectedRepoContext | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { repo?: string; branch?: string };
    if (!parsed.repo?.includes('/')) return null;
    return {
      repo: parsed.repo,
      branch: parsed.branch?.trim() || 'main',
    };
  } catch {
    return null;
  }
}

export function saveSelectedRepoContext(ctx: SelectedRepoContext): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
}

export function clearSelectedRepoContext(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
