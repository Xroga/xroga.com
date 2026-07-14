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
import { syncRepoTerminalSessions } from '@/lib/syncRepoTerminalSessions';
import { resolveTerminalToOpen, loadTerminalFromAnywhere } from '@/lib/restoreRepoTerminal';
import {
  cachedTerminalNumber,
  cloudTerminalLabel,
  listCloudTerminalSessions,
  migrateLocalSessionsToCloud,
  onCloudTerminalsChanged,
} from '@/lib/cloudTerminalSessions';
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
  kind: 'local' | 'cloud' | 'live';
  terminalNumber?: number;
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

/** Used repos with permanent #1 / #2 terminals under each GitHub repo. */
export function SidebarProjectHistory({ expanded }: { expanded: boolean }) {
  const router = useRouter();
  const { restoreTerminalSession, messages, startNewChat } = useTerminalChat();
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([]);
  const [cloudSessions, setCloudSessions] = useState<CloudTerminalSessionSummary[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [filterRecent, setFilterRecent] = useState(true);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [liveEmpty, setLiveEmpty] = useState(false);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const refreshLocal = useCallback(() => {
    const selected = getSelectedRepoContext();
    setSelectedRepo(selected?.repo?.includes('/') ? selected.repo : null);
    const synced = syncRepoTerminalSessions();
    setEntries(
      synced.length
        ? synced
        : loadTerminalHistory().filter((e) => e.messageCount > 0 && e.githubRepoName?.includes('/'))
    );
    const ws = loadWorkspaceSession();
    setLiveEmpty(!ws?.messages?.length);
    setActiveSessionId(ws?.sessionId ?? null);
  }, []);

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

  useEffect(() => {
    if (!expanded) return;
    const t = window.setTimeout(() => refreshLocal(), 300);
    return () => window.clearTimeout(t);
  }, [messages, expanded, refreshLocal]);

  const folders = useMemo((): RepoFolder[] => {
    const map = new Map<string, RepoSession[]>();
    const push = (key: string, session: RepoSession) => {
      if (!key.includes('/')) return;
      const list = map.get(key) ?? [];
      const idx = list.findIndex((s) => s.id === session.id);
      if (idx >= 0) {
        // Prefer cloud-numbered rows over local duplicates
        if (session.cloudSynced || (session.terminalNumber && !list[idx]!.terminalNumber)) {
          list[idx] = { ...list[idx]!, ...session, cloudSynced: true };
        }
        map.set(key, list);
        return;
      }
      list.push(session);
      map.set(key, list);
    };

    // Permanent cloud sessions first (source of truth for #N labels)
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

    // Local cache fills gaps (offline / not yet uploaded)
    for (const e of entries) {
      if (!e.githubRepoName?.includes('/')) continue;
      const n = cachedTerminalNumber(e.id);
      push(e.githubRepoName, {
        id: e.id,
        title: n ? cloudTerminalLabel(n) : e.title || 'Terminal',
        updatedAt: e.updatedAt,
        status: e.status,
        githubRepoName: e.githubRepoName,
        githubBranch: e.githubBranch || 'main',
        cloudSynced: Boolean(n),
        kind: 'local',
        terminalNumber: n,
        entry: e,
      });
    }

    // Empty live workspace under selected repo → optional New terminal row
    if (selectedRepo?.includes('/') && liveEmpty) {
      const list = map.get(selectedRepo) ?? [];
      if (!list.some((s) => s.id.startsWith('live-'))) {
        list.unshift({
          id: `live-${selectedRepo}`,
          title: 'New terminal',
          updatedAt: new Date().toISOString(),
          githubRepoName: selectedRepo,
          githubBranch: getSelectedRepoContext()?.branch || 'main',
          cloudSynced: false,
          kind: 'live',
        });
        map.set(selectedRepo, list);
      }
    } else if (selectedRepo?.includes('/') && !map.has(selectedRepo)) {
      map.set(selectedRepo, [
        {
          id: `live-${selectedRepo}`,
          title: 'New terminal',
          updatedAt: new Date().toISOString(),
          githubRepoName: selectedRepo,
          githubBranch: getSelectedRepoContext()?.branch || 'main',
          cloudSynced: false,
          kind: 'live',
        },
      ]);
    }

    let foldersList = Array.from(map.entries())
      .filter(([key, sessions]) => key.includes('/') && sessions.length > 0)
      .map(([key, sessions]) => ({
        key,
        label: repoLabel(key),
        sessions: sessions
          .sort((a, b) => {
            if (a.id.startsWith('live-') && !b.id.startsWith('live-')) return -1;
            if (b.id.startsWith('live-') && !a.id.startsWith('live-')) return 1;
            const an = a.terminalNumber ?? 9999;
            const bn = b.terminalNumber ?? 9999;
            if (an !== bn) return an - bn;
            return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
          })
          .slice(0, 24),
      }));

    foldersList.sort((a, b) => {
      if (selectedRepo && a.key === selectedRepo) return -1;
      if (selectedRepo && b.key === selectedRepo) return 1;
      const aT = Date.parse(a.sessions.find((s) => !s.id.startsWith('live-'))?.updatedAt ?? '0');
      const bT = Date.parse(b.sessions.find((s) => !s.id.startsWith('live-'))?.updatedAt ?? '0');
      return bT - aT;
    });

    if (filterRecent) foldersList = foldersList.slice(0, 12);
    return foldersList;
  }, [entries, cloudSessions, filterRecent, selectedRepo, liveEmpty]);

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
    const n = cachedTerminalNumber(entry.id);
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
      if (repo?.includes('/')) {
        saveSelectedRepoContext({ repo, branch });
        notifyGithubRepoContext(repo, branch);
      }

      // New terminal — intentional blank (does not delete #1/#2)
      if (session.kind === 'live' || session.id.startsWith('live-')) {
        startNewChat();
        router.push('/workspace');
        return;
      }

      if (!repo?.includes('/')) {
        router.push('/workspace');
        return;
      }

      const preferId = session.id;
      const resolved = await resolveTerminalToOpen(repo, preferId);
      if (resolved.kind === 'live') {
        router.push('/workspace');
        return;
      }
      if (resolved.kind === 'restore') {
        await applyRestore(resolved.entry, branch);
        return;
      }

      // Last try: direct cloud/local load
      const direct = await loadTerminalFromAnywhere(preferId, repo);
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
      const branch =
        folder.sessions.find((s) => !s.id.startsWith('live-'))?.githubBranch ||
        getSelectedRepoContext()?.branch ||
        'main';
      saveSelectedRepoContext({ repo: folder.key, branch });
      notifyGithubRepoContext(folder.key, branch);

      const resolved = await resolveTerminalToOpen(folder.key);
      if (resolved.kind === 'restore') {
        await applyRestore(resolved.entry, branch);
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
          Select a GitHub repo, then chat — terminals appear as #1, #2 under the repo (saved to your account).
        </p>
      ) : (
        <div className="xv-repos-scroll space-y-0.5 max-h-[280px] overflow-y-auto pr-1">
          {folders.map((folder) => {
            const isOpen = openFolders[folder.key] !== false;
            const FolderIcon = isOpen ? FolderOpen : FolderGit2;
            const isActiveRepo = selectedRepo === folder.key;
            const priorCount = folder.sessions.filter((s) => !s.id.startsWith('live-')).length;
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
                    {priorCount > 0 ? (
                      <span className="text-[9px] text-[var(--muted)] tabular-nums ml-auto">
                        {priorCount}
                      </span>
                    ) : null}
                  </button>
                </div>
                {isOpen
                  ? folder.sessions.map((session) => {
                      const isActiveSession =
                        !session.id.startsWith('live-') && session.id === activeSessionId;
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
                          <p className="flex-1 min-w-0 text-left text-[11px] font-medium text-[var(--foreground)]/90 truncate leading-snug">
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
                  : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
