/**
 * Resolve and load prior terminal sessions for a GitHub repo.
 * Old chats are stored in local history + IndexedDB — not deleted by New Terminal.
 */

import { loadTerminalHistory, type TerminalHistoryEntry } from '@/lib/terminalHistory';
import { loadRepoSessionsIndex } from '@/lib/repoSessionsIndex';
import { loadTerminalHistoryEntry } from '@/lib/terminalSessionStorage';
import { loadWorkspaceSession } from '@/lib/workspacePersistence';

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

/** Load the newest session that still has messages for this repo. */
export async function loadBestTerminalForRepo(
  repoFullName: string,
  preferSessionId?: string
): Promise<TerminalHistoryEntry | null> {
  const prefer = preferSessionId?.trim();
  const ids = listRepoSessionIds(repoFullName);
  const ordered = prefer ? [prefer, ...ids.filter((id) => id !== prefer)] : ids;

  for (const id of ordered) {
    const full = await loadTerminalHistoryEntry(id);
    if (full?.messages?.length) {
      // Heal sticky repo if it was missing on older saves
      if (!full.githubRepoName?.includes('/')) {
        return { ...full, githubRepoName: repoFullName };
      }
      return full;
    }
  }
  return null;
}

/**
 * If the live workspace already shows this repo's session, keep it.
 * Otherwise return the best saved terminal for restore.
 */
export async function resolveTerminalToOpen(
  repoFullName: string,
  preferSessionId?: string
): Promise<{ kind: 'live' } | { kind: 'restore'; entry: TerminalHistoryEntry } | { kind: 'empty' }> {
  const ws = loadWorkspaceSession();
  const liveId = ws?.sessionId;
  const liveHasMessages = Boolean(ws?.messages?.length);

  if (preferSessionId && liveId === preferSessionId && liveHasMessages) {
    return { kind: 'live' };
  }

  // Prefer an explicit session row click
  if (preferSessionId && !preferSessionId.startsWith('live-')) {
    const full = await loadTerminalHistoryEntry(preferSessionId);
    if (full?.messages?.length) {
      return {
        kind: 'restore',
        entry: full.githubRepoName?.includes('/')
          ? full
          : { ...full, githubRepoName: repoFullName },
      };
    }
  }

  // Folder / "Current terminal": keep live if it has chat under this work,
  // else restore the latest saved session so users don't think data is lost.
  if (liveHasMessages && liveId) {
    const historyMatch = loadTerminalHistory().find((e) => e.id === liveId);
    if (!historyMatch || historyMatch.githubRepoName === repoFullName) {
      return { kind: 'live' };
    }
  }

  const best = await loadBestTerminalForRepo(repoFullName, preferSessionId);
  if (best) return { kind: 'restore', entry: best };
  return { kind: 'empty' };
}
