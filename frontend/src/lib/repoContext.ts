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

const VISIBILITY_KEY = 'xroga-new-repo-visibility';

/** Visibility for repositories Xroga creates. Never inferred from anything else. */
export type NewRepoVisibility = 'private' | 'public';

/**
 * Reads the user's choice for repositories Xroga creates on their behalf.
 *
 * Returns `'private'` for every input that is not the exact string `'public'`: no stored
 * value, a corrupt one, a value written by an older build, or storage that throws. The
 * cost of reading this wrong in the private direction is a repository the user has to
 * flip to public themselves; in the public direction it is their code published to the
 * internet under their own account. Those are not symmetric, so this is not a default —
 * it is the answer to everything except an explicit, current "public".
 */
export function getNewRepoVisibility(): NewRepoVisibility {
  if (typeof window === 'undefined') return 'private';
  try {
    return localStorage.getItem(VISIBILITY_KEY) === 'public' ? 'public' : 'private';
  } catch {
    return 'private';
  }
}

export function saveNewRepoVisibility(visibility: NewRepoVisibility): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VISIBILITY_KEY, visibility === 'public' ? 'public' : 'private');
  } catch {
    /* non-blocking — the send path re-reads and falls back to private */
  }
}

const FRESH_TERMINAL_KEY = 'xroga-fresh-terminal';

/** Mark that New Terminal was clicked — user must pick a repo; do not auto-restore old #N. */
export function markFreshTerminalIntent(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(FRESH_TERMINAL_KEY, '1');
}

export function consumeFreshTerminalIntent(): boolean {
  if (typeof window === 'undefined') return false;
  const v = sessionStorage.getItem(FRESH_TERMINAL_KEY) === '1';
  if (v) sessionStorage.removeItem(FRESH_TERMINAL_KEY);
  return v;
}

export function hasFreshTerminalIntent(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(FRESH_TERMINAL_KEY) === '1';
}
