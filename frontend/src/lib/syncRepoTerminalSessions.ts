/**
 * Keep Repositories sidebar in sync with the selected GitHub repo + live terminal.
 * Does NOT invent unused GitHub repos — only stamps Xroga work onto the selected repo.
 */

import { getSelectedRepoContext } from '@/lib/repoContext';
import { loadWorkspaceSession } from '@/lib/workspacePersistence';
import {
  loadTerminalHistory,
  saveTerminalHistorySession,
  type TerminalHistoryEntry,
} from '@/lib/terminalHistory';
import { registerRepoSession } from '@/lib/repoSessionsIndex';
import { messagesForStorage, safeStorageSet } from '@/lib/storageSafe';
import { saveTerminalSessionToIndexedDB } from '@/lib/terminalSessionStorage';

const HISTORY_KEY = 'xroga_terminal_history';

function persistHistory(entries: TerminalHistoryEntry[]) {
  if (typeof window === 'undefined') return;
  const slim = entries.slice(0, 100).map((e) => ({
    ...e,
    messages: messagesForStorage(e.messages),
  }));
  safeStorageSet(localStorage, HISTORY_KEY, JSON.stringify(slim));
}

/**
 * 1) Save live workspace session under the selected repo
 * 2) Attach selected repo to that session if it was missing
 * Returns history entries that belong to real repos (for sidebar).
 */
export function syncRepoTerminalSessions(): TerminalHistoryEntry[] {
  const selected = getSelectedRepoContext();
  const ws = loadWorkspaceSession();

  if (selected?.repo?.includes('/') && ws?.messages?.length && ws.sessionId) {
    saveTerminalHistorySession({
      sessionId: ws.sessionId,
      prompt: ws.prompt || ws.selectedLabel || 'Terminal',
      messages: ws.messages,
      status: 'active',
    });
  }

  const all = loadTerminalHistory();
  if (!selected?.repo?.includes('/')) {
    return all.filter((e) => e.messageCount > 0 && e.githubRepoName?.includes('/'));
  }

  const repo = selected.repo;
  const branch = selected.branch || 'main';
  let changed = false;
  const next = all.map((e) => {
    // Bind the live session (and only the live session) when it lacks a repo stamp.
    const isLive = ws?.sessionId && e.id === ws.sessionId;
    if (!e.githubRepoName?.includes('/') && isLive) {
      changed = true;
      return {
        ...e,
        githubRepoName: repo,
        githubBranch: branch,
        githubRepoUrl: `https://github.com/${repo}`,
        updatedAt: new Date().toISOString(),
      };
    }
    return e;
  });

  if (changed) {
    persistHistory(next);
    for (const e of next) {
      if (e.githubRepoName === repo) {
        void saveTerminalSessionToIndexedDB(e);
        registerRepoSession({
          githubRepoName: repo,
          githubBranch: e.githubBranch || branch,
          title: e.title,
          sessionId: e.id,
          cloudProjectId: e.cloudProjectId,
          status: e.status,
          activityKind:
            e.kind === 'code'
              ? 'code'
              : e.kind === 'image'
                ? 'image'
                : e.kind === 'research' || e.kind === 'business'
                  ? 'research'
                  : e.kind === 'mixed'
                    ? 'mixed'
                    : 'chat',
        });
      }
    }
  } else if (ws?.sessionId && ws.messages?.length) {
    // Ensure index has the live session even if history write already had repo
    const live = next.find((e) => e.id === ws.sessionId);
    if (live?.githubRepoName === repo) {
      registerRepoSession({
        githubRepoName: repo,
        githubBranch: live.githubBranch || branch,
        title: live.title,
        sessionId: live.id,
        status: 'active',
        activityKind: 'chat',
      });
    }
  }

  return next.filter((e) => e.messageCount > 0 && e.githubRepoName?.includes('/'));
}
