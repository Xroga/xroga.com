'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cloud, Filter, FolderGit2, FolderOpen, GitBranch, ChevronDown, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { useTerminalChat } from '@/context/TerminalChatContext';
import {
  loadTerminalHistory,
  type TerminalHistoryEntry,
  type TerminalHistoryStatus,
} from '@/lib/terminalHistory';
import { getSelectedRepoContext, saveSelectedRepoContext } from '@/lib/repoContext';
import {
  GITHUB_PROJECT_SAVED_EVENT,
  GITHUB_REPO_CONTEXT_EVENT,
  notifyGithubRepoContext,
} from '@/lib/githubProjectEvents';
import {
  ensureLiveTerminalUnderSelectedRepo,
  syncRepoTerminalSessions,
} from '@/lib/syncRepoTerminalSessions';
import { resolveTerminalToOpen, loadTerminalFromAnywhere } from '@/lib/restoreRepoTerminal';
import {
  allocateTerminalNumber,
  cachedTerminalNumber,
  cloudTerminalLabel,
  listCloudTerminalSessions,
  migrateLocalSessionsToCloud,
  onCloudTerminalsChanged,
} from '@/lib/cloudTerminalSessions';
import { loadRepoSessionsIndex } from '@/lib/repoSessionsIndex';
import type { CloudTerminalSessionSummary } from '@/lib/api';
import { formatCompactAgo } from '@/lib/safeDates';
import { cn } from '@/lib/utils';
import { loadWorkspaceSession } from '@/lib/workspacePersistence';

type RepoSession = {
  id: string;
  title: string;
  updatedAt: string;
  status?: TerminalHistoryStatus;
  githubRepoName?: string;
  githubBranch?: string;
  cloudSynced: boolean;
  kind: 'local' | 'cloud';
  terminalNumber: number;
  entry?: TerminalHistoryEntry;
};

type RepoFolder = {
  key: string;
  label: string;
  sessions: RepoSession[];
};

function repoLabel(full: string): string {
  if (!full.includes('/')) return full;
  return full.split('/')[1] || full;
}

/**
 * Repositories sidebar — only real numbered terminals (#1, #2, …).
 * No "New terminal" stub here — use the sidebar New Terminal button instead.
 */
export function SidebarProjectHistory({ expanded }: { expanded: boolean }) {
  const router = useRouter();
  const { restoreTerminalSession, messages, sessionId, prompt } = useTerminalChat();
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([]);
  const [cloudSessions, setCloudSessions] = useState<CloudTerminalSessionSummary[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [filterRecent, setFilterRecent] = useState(true);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const refreshLocal = useCallback(() => {
    const selected = getSelectedRepoContext();
    setSelectedRepo(selected?.repo?.includes('/') ? selected.repo : null);
    // Stamp live chat as #1/#2 under the selected repo (fixes "chat but still 0 terminals")
    if (messages.length > 0 && sessionId) {
      ensureLiveTerminalUnderSelectedRepo({
        sessionId,
        messages,
        prompt,
        flushCloud: true,
      });
    }
    const synced = syncRepoTerminalSessions();
    let nextEntries =
      synced.length
        ? synced
        : loadTerminalHistory().filter((e) => e.messageCount > 0 && e.githubRepoName?.includes('/'));

    // Live chat must appear under the selected repo even if history write lagged.
    if (selected?.repo?.includes('/') && messages.length > 0 && sessionId) {
      const n = allocateTerminalNumber(sessionId, selected.repo);
      const live: TerminalHistoryEntry = {
        id: sessionId,
        title: cloudTerminalLabel(n),
        preview: prompt.slice(0, 200),
        prompt,
        messages,
        kind: 'chat',
        status: 'active',
        githubRepoName: selected.repo,
        githubBranch: selected.branch || 'main',
        messageCount: messages.length,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (!nextEntries.some((e) => e.id === sessionId)) {
        nextEntries = [live, ...nextEntries];
      } else {
        nextEntries = nextEntries.map((e) =>
          e.id === sessionId
            ? {
                ...e,
                ...live,
                createdAt: e.createdAt || live.createdAt,
              }
            : e
        );
      }
    }

    // Index can retain #N after localStorage quota drops messages — surface those ids.
    for (const idx of loadRepoSessionsIndex()) {
      if (!idx.githubRepoName?.includes('/') || !idx.sessionId) continue;
      if (nextEntries.some((e) => e.id === idx.sessionId)) continue;
      const hist = loadTerminalHistory().find((e) => e.id === idx.sessionId);
      if (hist?.messages?.length) {
        nextEntries = [...nextEntries, hist];
      }
    }

    setEntries(nextEntries);
    const ws = loadWorkspaceSession();
    setActiveSessionId(ws?.sessionId ?? sessionId ?? null);
  }, [messages, sessionId, prompt]);

  const refreshCloud = useCallback(() => {
    void (async () => {
      const list = await listCloudTerminalSessions();
      setCloudSessions(list);
      const local = loadTerminalHistory().filter(
        (e) => e.messageCount > 0 && e.githubRepoName?.includes('/') && e.messages?.length
      );
      if (local.length) {
        await migrateLocalSessionsToCloud(local, list);
        const again = await listCloudTerminalSessions();
        setCloudSessions(again);
      }
    })();
  }, []);

  useEffect(() => {
    refreshLocal();
    refreshCloud();
    const onRefresh = () => {
      refreshLocal();
      refreshCloud();
    };
    window.addEventListener(GITHUB_REPO_CONTEXT_EVENT, onRefresh);
    window.addEventListener(GITHUB_PROJECT_SAVED_EVENT, onRefresh);
    window.addEventListener('storage', refreshLocal);
    window.addEventListener('xroga-resume-workspace', onRefresh);
    const offCloud = onCloudTerminalsChanged(onRefresh);
    return () => {
      window.removeEventListener(GITHUB_REPO_CONTEXT_EVENT, onRefresh);
      window.removeEventListener(GITHUB_PROJECT_SAVED_EVENT, onRefresh);
      window.removeEventListener('storage', refreshLocal);
      window.removeEventListener('xroga-resume-workspace', onRefresh);
      offCloud();
    };
  }, [refreshLocal, refreshCloud]);

  // Refresh as soon as the user chats — #1 / #2 should appear quickly
  useEffect(() => {
    if (!expanded) return;
    if (messages.length === 0) {
      refreshLocal();
      return;
    }
    const t = window.setTimeout(() => {
      refreshLocal();
      refreshCloud();
    }, 100);
    return () => window.clearTimeout(t);
  }, [messages, sessionId, expanded, refreshLocal, refreshCloud]);

  const folders = useMemo((): RepoFolder[] => {
    const map = new Map<string, RepoSession[]>();
    const push = (key: string, session: RepoSession) => {
      if (!key.includes('/')) return;
      const list = map.get(key) ?? [];
      const idx = list.findIndex((s) => s.id === session.id);
      if (idx >= 0) {
        const prev = list[idx]!;
        const number = session.cloudSynced ? session.terminalNumber : prev.terminalNumber;
        list[idx] = {
          ...prev,
          ...session,
          cloudSynced: prev.cloudSynced || session.cloudSynced,
          terminalNumber: number,
          title: cloudTerminalLabel(number),
        };
        map.set(key, list);
        return;
      }
      list.push(session);
      map.set(key, list);
    };

    for (const s of cloudSessions) {
      if (!s.githubRepoName?.includes('/') || s.messageCount <= 0) continue;
      push(s.githubRepoName, {
        id: s.id,
        title: cloudTerminalLabel(s.terminalNumber),
        updatedAt: s.updatedAt,
        status: (s.status as TerminalHistoryStatus) || 'complete',
        githubRepoName: s.githubRepoName,
        githubBranch: s.githubBranch || 'main',
        cloudSynced: true,
        kind: 'cloud',
        terminalNumber: s.terminalNumber,
      });
    }

    for (const e of entries) {
      if (!e.githubRepoName?.includes('/') || e.messageCount <= 0) continue;
      const n =
        cachedTerminalNumber(e.id) ??
        allocateTerminalNumber(e.id, e.githubRepoName);
      push(e.githubRepoName, {
        id: e.id,
        title: cloudTerminalLabel(n),
        updatedAt: e.updatedAt,
        status: e.status,
        githubRepoName: e.githubRepoName,
        githubBranch: e.githubBranch || 'main',
        cloudSynced: Boolean(cachedTerminalNumber(e.id)),
        kind: 'local',
        terminalNumber: n,
        entry: e,
      });
    }

    // Show currently selected repo even before first chat (#1 appears after first message).
    // Never invent a "New terminal" stub row.
    if (selectedRepo?.includes('/') && !map.has(selectedRepo)) {
      map.set(selectedRepo, []);
    }

    let foldersList = Array.from(map.entries())
      .filter(
        ([key, sessions]) =>
          key.includes('/') && (sessions.length > 0 || key === selectedRepo)
      )
      .map(([key, sessions]) => ({
        key,
        label: repoLabel(key),
        sessions: sessions
          .sort((a, b) => {
            if (a.terminalNumber !== b.terminalNumber) {
              return a.terminalNumber - b.terminalNumber;
            }
            return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
          })
          .slice(0, 24),
      }));

    foldersList.sort((a, b) => {
      if (selectedRepo && a.key === selectedRepo) return -1;
      if (selectedRepo && b.key === selectedRepo) return 1;
      const aT = Date.parse(a.sessions[a.sessions.length - 1]?.updatedAt ?? '0');
      const bT = Date.parse(b.sessions[b.sessions.length - 1]?.updatedAt ?? '0');
      return bT - aT;
    });

    if (filterRecent) foldersList = foldersList.slice(0, 12);
    return foldersList;
  }, [entries, cloudSessions, filterRecent, selectedRepo]);

  useEffect(() => {
    setOpenFolders((prev) => {
      const next = { ...prev };
      for (const f of folders) {
        if (next[f.key] === undefined) next[f.key] = true;
      }
      if (selectedRepo) next[selectedRepo] = true;
      return next;
    });
  }, [folders, selectedRepo]);

  async function applyRestore(entry: TerminalHistoryEntry, branch: string) {
    if (entry.githubRepoName?.includes('/')) {
      saveSelectedRepoContext({
        repo: entry.githubRepoName,
        branch: entry.githubBranch || branch,
      });
      notifyGithubRepoContext(entry.githubRepoName, entry.githubBranch || branch);
    }
    const n =
      cachedTerminalNumber(entry.id) ??
      (entry.githubRepoName
        ? allocateTerminalNumber(entry.id, entry.githubRepoName)
        : undefined);
    await restoreTerminalSession({
      sessionId: entry.id,
      prompt: entry.prompt,
      messages: entry.messages,
      selectedId: entry.id,
      selectedLabel: n ? cloudTerminalLabel(n) : entry.title,
      source: 'projects',
      jumpMessageId: entry.messages[entry.messages.length - 1]?.id,
    });
    router.push('/workspace');
    toast.success(n ? `Opened ${cloudTerminalLabel(n)}` : 'Restored your previous terminal');
  }

  async function openSession(session: RepoSession) {
    if (busyId) return;
    setBusyId(session.id);
    try {
      const branch = session.githubBranch || 'main';
      const repo = session.githubRepoName;
      if (!repo?.includes('/')) {
        router.push('/workspace');
        return;
      }

      saveSelectedRepoContext({ repo, branch });
      notifyGithubRepoContext(repo, branch);

      // Same session already open with messages — stay
      if (session.id === activeSessionId) {
        const ws = loadWorkspaceSession();
        if (ws?.messages?.length && ws.sessionId === session.id) {
          router.push('/workspace');
          return;
        }
      }

      const resolved = await resolveTerminalToOpen(repo, session.id);
      if (resolved.kind === 'live') {
        router.push('/workspace');
        return;
      }
      if (resolved.kind === 'restore') {
        await applyRestore(resolved.entry, branch);
        return;
      }

      const direct = await loadTerminalFromAnywhere(session.id, repo);
      if (direct?.messages?.length) {
        await applyRestore(direct, branch);
        return;
      }

      toast.error('Could not load that terminal — try again in a moment.');
      router.push('/workspace');
    } finally {
      setBusyId(null);
    }
  }

  async function openRepoFolder(folder: RepoFolder) {
    if (busyId) return;
    setBusyId(folder.key);
    setOpenFolders((prev) => ({ ...prev, [folder.key]: true }));
    try {
      const latest =
        folder.sessions[folder.sessions.length - 1] || folder.sessions[0];
      const branch = latest?.githubBranch || getSelectedRepoContext()?.branch || 'main';
      saveSelectedRepoContext({ repo: folder.key, branch });
      notifyGithubRepoContext(folder.key, branch);

      // Repo selected but no #1 yet — stay on fresh workspace
      if (!folder.sessions.length) {
        router.push('/workspace');
        return;
      }

      const preferId = latest?.id;
      const resolved = await resolveTerminalToOpen(folder.key, preferId);
      if (resolved.kind === 'restore') {
        await applyRestore(resolved.entry, branch);
        return;
      }
      if (resolved.kind === 'live') {
        router.push('/workspace');
        return;
      }
      router.push('/workspace');
    } finally {
      setBusyId(null);
    }
  }

  if (!expanded) return null;

  return (
    <div className="mt-2 mb-1 px-1.5">
      <div className="flex items-center justify-between gap-1 px-1.5 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
          Repositories
        </span>
        <button
          type="button"
          title={filterRecent ? 'Showing recent used repos' : 'Show all used repos'}
          onClick={() => setFilterRecent((v) => !v)}
          className={cn(
            'p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5',
            filterRecent && 'text-[var(--accent)]'
          )}
        >
          <Filter className="h-3 w-3" />
        </button>
      </div>

      {folders.length === 0 ? (
        <p className="px-2 py-2 text-[10px] text-[var(--muted)] leading-relaxed">
          Click New Terminal, select a GitHub repo, then chat — #1 terminal appears here and is saved to your account.
        </p>
      ) : (
        <div className="xv-repos-scroll space-y-0.5 max-h-[280px] overflow-y-auto pr-1">
          {folders.map((folder) => {
            const isOpen = openFolders[folder.key] !== false;
            const FolderIcon = isOpen ? FolderOpen : FolderGit2;
            const isActiveRepo = selectedRepo === folder.key;
            return (
              <div key={folder.key} className="space-y-0.5">
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-label={isOpen ? 'Collapse' : 'Expand'}
                    onClick={() =>
                      setOpenFolders((prev) => ({ ...prev, [folder.key]: !isOpen }))
                    }
                    className="p-1 rounded-md text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--foreground)]/5"
                  >
                    {isOpen ? (
                      <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === folder.key}
                    title="Open latest terminal for this repo"
                    onClick={() => void openRepoFolder(folder)}
                    className={cn(
                      'flex-1 min-w-0 flex items-center gap-1 px-1 py-1 rounded-md text-[10px] hover:bg-[var(--foreground)]/5',
                      isActiveRepo
                        ? 'text-[var(--foreground)] font-semibold'
                        : 'text-[var(--muted)] hover:text-[var(--foreground)]'
                    )}
                  >
                    <FolderIcon className="h-3 w-3 shrink-0" />
                    <span className="truncate font-medium" title={folder.key}>
                      {folder.label}
                    </span>
                    <span className="text-[9px] text-[var(--muted)] tabular-nums ml-auto">
                      {folder.sessions.length}
                    </span>
                  </button>
                </div>
                {isOpen ? (
                  folder.sessions.length === 0 ? (
                    <p className="pl-6 pr-2 py-1.5 text-[10px] text-[var(--muted)] leading-snug">
                      {isActiveRepo && messages.length > 0
                        ? 'Saving #1 terminal to your account…'
                        : (
                          <>
                            Chat below to create{' '}
                            <span className="font-semibold text-[var(--foreground)]/80">#1 terminal</span>
                          </>
                        )}
                    </p>
                  ) : (
                    folder.sessions.map((session) => {
                      const isActiveSession = session.id === activeSessionId;
                      return (
                        <button
                          key={session.id}
                          type="button"
                          disabled={busyId === session.id}
                          onClick={() => void openSession(session)}
                          className={cn(
                            'w-full flex items-center gap-1.5 rounded-md pl-6 pr-2 py-1.5 transition-colors',
                            'hover:bg-[var(--foreground)]/8',
                            (isActiveRepo || isActiveSession) && 'bg-[var(--foreground)]/[0.04]',
                            isActiveSession && 'ring-1 ring-[var(--accent)]/25'
                          )}
                        >
                          <p className="flex-1 min-w-0 text-left text-[11px] font-semibold text-[var(--foreground)]/90 truncate leading-snug">
                            {session.title}
                          </p>
                          <GitBranch className="h-2.5 w-2.5 text-violet-400 shrink-0" />
                          {session.cloudSynced ? (
                            <Cloud className="h-2.5 w-2.5 text-[var(--muted)] shrink-0 opacity-70" />
                          ) : null}
                          <span className="text-[9px] text-[var(--muted)] shrink-0 tabular-nums min-w-[1.5rem] text-right">
                            {formatCompactAgo(session.updatedAt)}
                          </span>
                        </button>
                      );
                    })
                  )
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
