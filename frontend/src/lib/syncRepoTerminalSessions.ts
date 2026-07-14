/**
 * Keep Repositories sidebar in sync with the selected GitHub repo + live terminal.
 * Ensures first chat under a repo immediately becomes "#1 terminal".
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
import {
  allocateTerminalNumber,
  cloudTerminalLabel,
  pushTerminalSessionToCloud,
} from '@/lib/cloudTerminalSessions';
import type { ChatMessage } from '@/context/TerminalChatContext';

const HISTORY_KEY = 'xroga_terminal_history';

function persistHistory(entries: TerminalHistoryEntry[]) {
  if (typeof window === 'undefined') return;
  const slim = entries.slice(0, 100).map((e) => ({
    ...e,
    messages: messagesForStorage(e.messages),
  }));
  safeStorageSet(localStorage, HISTORY_KEY, JSON.stringify(slim));
}

function stampRepoOnEntry(
  e: TerminalHistoryEntry,
  repo: string,
  branch: string
): TerminalHistoryEntry {
  const n = allocateTerminalNumber(e.id, repo);
  return {
    ...e,
    githubRepoName: repo,
    githubBranch: e.githubBranch || branch,
    githubRepoUrl: e.githubRepoUrl || `https://github.com/${repo}`,
    title: cloudTerminalLabel(n),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Force the live chat into history under the selected repo as #1 / #2.
 * Call whenever messages change or sidebar refreshes.
 */
export function ensureLiveTerminalUnderSelectedRepo(opts?: {
  sessionId?: string;
  messages?: ChatMessage[];
  prompt?: string;
}): TerminalHistoryEntry | null {
  const selected = getSelectedRepoContext();
  if (!selected?.repo?.includes('/')) return null;

  const ws = loadWorkspaceSession();
  const sessionId = opts?.sessionId || ws?.sessionId;
  const messages = opts?.messages?.length ? opts.messages : ws?.messages;
  const prompt = opts?.prompt || ws?.prompt || ws?.selectedLabel || 'Terminal';
  if (!sessionId || !messages?.length) return null;

  // Persist with selected repo in scope (extractProjectMeta reads localStorage)
  saveTerminalHistorySession({
    sessionId,
    prompt,
    messages,
    status: 'active',
  });

  let entry = loadTerminalHistory().find((e) => e.id === sessionId) ?? null;
  if (!entry) return null;

  if (!entry.githubRepoName?.includes('/')) {
    entry = stampRepoOnEntry(entry, selected.repo, selected.branch || 'main');
    const rest = loadTerminalHistory().filter((e) => e.id !== entry!.id);
    persistHistory([entry, ...rest]);
    void saveTerminalSessionToIndexedDB(entry);
  } else if (!entry.title.startsWith('#')) {
    const n = allocateTerminalNumber(entry.id, entry.githubRepoName);
    entry = { ...entry, title: cloudTerminalLabel(n) };
    const rest = loadTerminalHistory().filter((e) => e.id !== entry!.id);
    persistHistory([entry, ...rest]);
  }

  const n = allocateTerminalNumber(entry.id, entry.githubRepoName!);
  registerRepoSession({
    githubRepoName: entry.githubRepoName!,
    githubBranch: entry.githubBranch || selected.branch || 'main',
    title: cloudTerminalLabel(n),
    sessionId: entry.id,
    status: 'active',
    activityKind: 'chat',
  });
  void pushTerminalSessionToCloud({ ...entry, title: cloudTerminalLabel(n) });

  return { ...entry, title: cloudTerminalLabel(n) };
}

/**
 * 1) Save live workspace session under the selected repo
 * 2) Attach selected repo to that session if it was missing
 * Returns history entries that belong to real repos (for sidebar).
 */
export function syncRepoTerminalSessions(): TerminalHistoryEntry[] {
  ensureLiveTerminalUnderSelectedRepo();

  const selected = getSelectedRepoContext();
  const ws = loadWorkspaceSession();
  const all = loadTerminalHistory();

  if (!selected?.repo?.includes('/')) {
    return all.filter((e) => e.messageCount > 0 && e.githubRepoName?.includes('/'));
  }

  const repo = selected.repo;
  const branch = selected.branch || 'main';
  let changed = false;
  const next = all.map((e) => {
    const isLive = ws?.sessionId && e.id === ws.sessionId;
    if (isLive && !e.githubRepoName?.includes('/')) {
      changed = true;
      return stampRepoOnEntry(e, repo, branch);
    }
    if (isLive && e.githubRepoName === repo && !e.title.startsWith('#')) {
      changed = true;
      return stampRepoOnEntry(e, repo, branch);
    }
    return e;
  });

  if (changed) {
    persistHistory(next);
    for (const e of next) {
      if (e.githubRepoName === repo && e.messageCount > 0) {
        void saveTerminalSessionToIndexedDB(e);
        const n = allocateTerminalNumber(e.id, repo);
        registerRepoSession({
          githubRepoName: repo,
          githubBranch: e.githubBranch || branch,
          title: cloudTerminalLabel(n),
          sessionId: e.id,
          cloudProjectId: e.cloudProjectId,
          status: e.status,
          activityKind: 'chat',
        });
      }
    }
  }

  return next.filter((e) => e.messageCount > 0 && e.githubRepoName?.includes('/'));
}
