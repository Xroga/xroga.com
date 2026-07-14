/**
 * Resolve and load prior terminal sessions for a GitHub repo.
 * Prefer permanent cloud storage, then IndexedDB / local history cache.
 */

import { loadTerminalHistory, type TerminalHistoryEntry } from '@/lib/terminalHistory';
import { loadRepoSessionsIndex } from '@/lib/repoSessionsIndex';
import { loadTerminalHistoryEntry } from '@/lib/terminalSessionStorage';
import { loadWorkspaceSession } from '@/lib/workspacePersistence';
import { loadCloudTerminalSession, listCloudTerminalSessions } from '@/lib/cloudTerminalSessions';

/** Candidate session ids for a repo, newest first. */
export function listRepoSessionIds(repoFullName: string): string[] {
  const repo = repoFullName.trim();
  if (!repo.includes('/')) return [];

  const ids: string[] = [];
  const seen = new Set<string>();
  const push = (id?: string | null) => {
    const key = id?.trim();
    if (!key || key.startsWith('live-') || seen.has(key)) return;
    seen.add(key);
    ids.push(key);
  };

  const history = loadTerminalHistory()
    .filter((e) => e.githubRepoName === repo && (e.messageCount > 0 || e.messages?.length > 0))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  for (const e of history) push(e.id);

  const index = loadRepoSessionsIndex()
    .filter((e) => e.githubRepoName === repo)
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  for (const e of index) push(e.sessionId || e.id);

  return ids;
}

/** Load one session — cloud first, then local cache. */
export async function loadTerminalFromAnywhere(
  sessionId: string,
  repoFullName?: string
): Promise<TerminalHistoryEntry | null> {
  const fromCloud = await loadCloudTerminalSession(sessionId);
  if (fromCloud?.messages?.length) {
    if (repoFullName && !fromCloud.githubRepoName?.includes('/')) {
      return { ...fromCloud, githubRepoName: repoFullName };
    }
    return fromCloud;
  }

  const fromLocal = await loadTerminalHistoryEntry(sessionId);
  if (fromLocal?.messages?.length) {
    if (repoFullName && !fromLocal.githubRepoName?.includes('/')) {
      return { ...fromLocal, githubRepoName: repoFullName };
    }
    return fromLocal;
  }
  return null;
}

/** Load the newest session that still has messages for this repo. */
export async function loadBestTerminalForRepo(
  repoFullName: string,
  preferSessionId?: string
): Promise<TerminalHistoryEntry | null> {
  const prefer = preferSessionId?.trim();
  if (prefer) {
    const preferred = await loadTerminalFromAnywhere(prefer, repoFullName);
    if (preferred?.messages?.length) return preferred;
  }

  try {
    const cloud = await listCloudTerminalSessions(repoFullName);
    const ordered = [...cloud].sort((a, b) => b.terminalNumber - a.terminalNumber);
    for (const s of ordered) {
      const full = await loadCloudTerminalSession(s.id);
      if (full?.messages?.length) return full;
    }
  } catch {
    /* fall through to local */
  }

  const ids = listRepoSessionIds(repoFullName);
  for (const id of ids) {
    const full = await loadTerminalFromAnywhere(id, repoFullName);
    if (full?.messages?.length) return full;
  }
  return null;
}

/**
 * If the live workspace already shows this exact session, keep it.
 * Clicking #1 / #2 always restores that session — never silently stays on a new blank.
 */
export async function resolveTerminalToOpen(
  repoFullName: string,
  preferSessionId?: string
): Promise<{ kind: 'live' } | { kind: 'restore'; entry: TerminalHistoryEntry } | { kind: 'empty' }> {
  const ws = loadWorkspaceSession();
  const liveId = ws?.sessionId;
  const liveHasMessages = Boolean(ws?.messages?.length);

  // Explicit #N terminal click — restore that id; do not fall through to live #N+1.
  if (preferSessionId && !preferSessionId.startsWith('live-')) {
    if (liveId === preferSessionId && liveHasMessages) {
      return { kind: 'live' };
    }
    const full = await loadTerminalFromAnywhere(preferSessionId, repoFullName);
    if (full?.messages?.length) {
      return { kind: 'restore', entry: full };
    }
    return { kind: 'empty' };
  }

  // Folder open / no specific id: keep live if it belongs to this repo, else restore latest.
  if (liveHasMessages && liveId) {
    const historyMatch = loadTerminalHistory().find((e) => e.id === liveId);
    if (!historyMatch || historyMatch.githubRepoName === repoFullName) {
      return { kind: 'live' };
    }
  }

  const best = await loadBestTerminalForRepo(repoFullName);
  if (best) return { kind: 'restore', entry: best };
  return { kind: 'empty' };
}
