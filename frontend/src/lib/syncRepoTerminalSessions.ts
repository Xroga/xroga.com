/**
 * Keep Repositories sidebar in sync with the selected GitHub repo + live terminal.
 * Ensures first chat under a repo immediately becomes "#1 terminal" in local + cloud storage.
 */

import { getSelectedRepoContext } from '@/lib/repoContext';
import { loadWorkspaceSession } from '@/lib/workspacePersistence';
import {
  loadTerminalHistory,
  saveTerminalHistorySession,
  type TerminalHistoryEntry,
} from '@/lib/terminalHistory';
import { registerRepoSession, loadRepoSessionsIndex } from '@/lib/repoSessionsIndex';
import { messagesForStorage, safeStorageSet } from '@/lib/storageSafe';
import { saveTerminalSessionToIndexedDB } from '@/lib/terminalSessionStorage';
import {
  allocateTerminalNumber,
  cloudTerminalLabel,
  flushTerminalSessionToCloud,
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
  /** Flush cloud immediately so #1 survives refresh / other devices */
  flushCloud?: boolean;
}): TerminalHistoryEntry | null {
  const selected = getSelectedRepoContext();
  if (!selected?.repo?.includes('/')) return null;

  const ws = loadWorkspaceSession();
  const sessionId = opts?.sessionId || ws?.sessionId;
  const messages = opts?.messages?.length ? opts.messages : ws?.messages;
  const prompt = opts?.prompt || ws?.prompt || ws?.selectedLabel || 'Terminal';
  if (!sessionId || !messages?.length) return null;

  // Persist with forced selected repo — never rely on a racing localStorage read alone.
  saveTerminalHistorySession({
    sessionId,
    prompt,
    messages,
    status: 'active',
    forceRepo: selected.repo,
    forceBranch: selected.branch || 'main',
  });

  let entry = loadTerminalHistory().find((e) => e.id === sessionId) ?? null;
  if (!entry) {
    // localStorage may have failed — still build an entry for IDB + index + cloud
    const n = allocateTerminalNumber(sessionId, selected.repo);
    entry = {
      id: sessionId,
      title: cloudTerminalLabel(n),
      preview: prompt.slice(0, 200),
      prompt,
      messages,
      kind: 'chat',
      status: 'active',
      githubRepoName: selected.repo,
      githubBranch: selected.branch || 'main',
      githubRepoUrl: `https://github.com/${selected.repo}`,
      messageCount: messages.length,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  if (entry.githubRepoName !== selected.repo || !entry.title.startsWith('#')) {
    entry = stampRepoOnEntry(entry, selected.repo, selected.branch || 'main');
    const rest = loadTerminalHistory().filter((e) => e.id !== entry!.id);
    persistHistory([entry, ...rest]);
  }

  void saveTerminalSessionToIndexedDB(entry);

  const n = allocateTerminalNumber(entry.id, selected.repo);
  const labeled = { ...entry, title: cloudTerminalLabel(n), githubRepoName: selected.repo };
  registerRepoSession({
    githubRepoName: selected.repo,
    githubBranch: labeled.githubBranch || selected.branch || 'main',
    title: labeled.title,
    sessionId: labeled.id,
    status: 'active',
    activityKind: 'chat',
  });

  if (opts?.flushCloud) {
    void flushTerminalSessionToCloud(labeled);
  } else {
    void pushTerminalSessionToCloud(labeled);
  }

  return labeled;
}

/**
 * History entries for the Repositories sidebar — history + index ids with message bodies.
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
    if (isLive && (!e.githubRepoName?.includes('/') || e.githubRepoName === repo) && !e.title.startsWith('#')) {
      changed = true;
      return stampRepoOnEntry(e, repo, branch);
    }
    if (isLive && !e.githubRepoName?.includes('/')) {
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

  // Heal: index may have session ids history lost — keep them visible by identity.
  const fromHistory = next.filter((e) => e.messageCount > 0 && e.githubRepoName?.includes('/'));
  const have = new Set(fromHistory.map((e) => e.id));
  for (const idx of loadRepoSessionsIndex()) {
    if (!idx.githubRepoName?.includes('/') || !idx.sessionId || have.has(idx.sessionId)) continue;
    const hist = all.find((e) => e.id === idx.sessionId);
    if (hist?.messages?.length) {
      fromHistory.push({
        ...hist,
        githubRepoName: hist.githubRepoName || idx.githubRepoName,
        title: idx.title.startsWith('#') ? idx.title : hist.title,
      });
      have.add(idx.sessionId);
    }
  }

  return fromHistory;
}
