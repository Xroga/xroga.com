/**
 * Lightweight always-on index for the Repositories sidebar.
 * Survives even when full terminal history fails quota / strip.
 */

import { getSelectedRepoContext } from '@/lib/repoContext';
import { safeStorageSet } from '@/lib/storageSafe';

const KEY = 'xroga_repo_sessions_v1';

export type RepoActivityKind = 'chat' | 'code' | 'image' | 'research' | 'mixed';

export interface RepoSessionIndexEntry {
  id: string;
  title: string;
  githubRepoName: string;
  githubBranch: string;
  updatedAt: string;
  createdAt: string;
  cloudProjectId?: string;
  sessionId?: string;
  status?: 'active' | 'stopped' | 'complete';
  /** What's in this terminal session — stored on Xroga under the repo (not pushed to GitHub) */
  activityKind?: RepoActivityKind;
}

function loadRaw(): RepoSessionIndexEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RepoSessionIndexEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveRaw(entries: RepoSessionIndexEntry[]) {
  if (typeof window === 'undefined') return;
  safeStorageSet(localStorage, KEY, JSON.stringify(entries.slice(0, 80)));
}

export function loadRepoSessionsIndex(): RepoSessionIndexEntry[] {
  return loadRaw().sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** Upsert a session under a GitHub repo so the sidebar always has something to show. */
export function registerRepoSession(opts: {
  githubRepoName: string;
  githubBranch?: string;
  title: string;
  sessionId?: string;
  cloudProjectId?: string;
  status?: 'active' | 'stopped' | 'complete';
  activityKind?: RepoActivityKind;
}): RepoSessionIndexEntry | null {
  const repo = opts.githubRepoName.trim();
  if (!repo.includes('/')) return null;

  const now = new Date().toISOString();
  const id = opts.sessionId?.trim() || `repo-${repo}-${opts.title.slice(0, 24)}`;
  const existing = loadRaw();
  const prev = existing.find((e) => e.id === id || (e.sessionId && e.sessionId === opts.sessionId));
  const entry: RepoSessionIndexEntry = {
    id: prev?.id ?? id,
    title: (opts.title || repo).slice(0, 80),
    githubRepoName: repo,
    githubBranch: opts.githubBranch?.trim() || prev?.githubBranch || 'main',
    updatedAt: now,
    createdAt: prev?.createdAt ?? now,
    cloudProjectId: opts.cloudProjectId ?? prev?.cloudProjectId,
    sessionId: opts.sessionId ?? prev?.sessionId,
    status: opts.status ?? prev?.status ?? 'complete',
    activityKind: opts.activityKind ?? prev?.activityKind ?? 'chat',
  };
  const rest = existing.filter((e) => e.id !== entry.id);
  saveRaw([entry, ...rest]);
  return entry;
}

export function markRepoSessionCloudId(sessionId: string, cloudProjectId: string) {
  const next = loadRaw().map((e) =>
    e.sessionId === sessionId || e.id === sessionId
      ? { ...e, cloudProjectId, updatedAt: new Date().toISOString() }
      : e
  );
  saveRaw(next);
}

/** Ensure currently selected repo appears as a folder even before first save. */
export function ensureSelectedRepoFolder(): RepoSessionIndexEntry | null {
  const selected = getSelectedRepoContext();
  if (!selected?.repo?.includes('/')) return null;
  const existing = loadRaw().find((e) => e.githubRepoName === selected.repo);
  if (existing) return existing;
  return registerRepoSession({
    githubRepoName: selected.repo,
    githubBranch: selected.branch,
    title: 'Current project',
    sessionId: `selected-${selected.repo}`,
    status: 'active',
  });
}
