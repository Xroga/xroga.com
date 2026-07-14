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
import { loadTerminalHistoryEntry } from '@/lib/terminalSessionStorage';
import { getSelectedRepoContext, saveSelectedRepoContext } from '@/lib/repoContext';
import {
  GITHUB_PROJECT_SAVED_EVENT,
  GITHUB_REPO_CONTEXT_EVENT,
  notifyGithubRepoContext,
} from '@/lib/githubProjectEvents';
import {
  isRealRepoSession,
  loadRepoSessionsIndex,
  type RepoActivityKind,
  type RepoSessionIndexEntry,
} from '@/lib/repoSessionsIndex';
import { syncRepoTerminalSessions } from '@/lib/syncRepoTerminalSessions';
import { resolveTerminalToOpen } from '@/lib/restoreRepoTerminal';
import { formatCompactAgo } from '@/lib/safeDates';
import { cn } from '@/lib/utils';
import { api, type Project } from '@/lib/api';
import { loadGithubProjectSession } from '@/lib/projectResume';
import { loadWorkspaceSession } from '@/lib/workspacePersistence';

type RepoSession = {
  id: string;
  title: string;
  updatedAt: string;
  status?: TerminalHistoryStatus;
  githubRepoName?: string;
  githubBranch?: string;
  cloudSynced: boolean;
  kind: 'local' | 'cloud' | 'index' | 'live';
  activityKind?: RepoActivityKind;
  entry?: TerminalHistoryEntry;
  project?: Project;
  index?: RepoSessionIndexEntry;
};

type RepoFolder = {
  key: string;
  label: string;
  sessions: RepoSession[];
};

function oneLine(text: string, max = 40): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
}

function repoLabel(full: string): string {
  if (!full.includes('/')) return full;
  return full.split('/')[1] || full;
}

function activityFromHistory(kind: TerminalHistoryEntry['kind']): RepoActivityKind {
  if (kind === 'code') return 'code';
  if (kind === 'image') return 'image';
  if (kind === 'research' || kind === 'business') return 'research';
  if (kind === 'mixed') return 'mixed';
  return 'chat';
}

/** Used repos only — every terminal session under each selected / past repo. */
export function SidebarProjectHistory({ expanded }: { expanded: boolean }) {
  const router = useRouter();
  const { restoreTerminalSession, messages } = useTerminalChat();
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([]);
  const [indexEntries, setIndexEntries] = useState<RepoSessionIndexEntry[]>([]);
  const [cloudProjects, setCloudProjects] = useState<Project[]>([]);
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
    setIndexEntries(loadRepoSessionsIndex());
    const ws = loadWorkspaceSession();
    setLiveEmpty(!ws?.messages?.length);
    setActiveSessionId(ws?.sessionId ?? null);
  }, []);

  const refreshCloud = useCallback(() => {
    void api.projects
      .listGithub()
      .then((list) =>
        setCloudProjects(Array.isArray(list) ? list.filter((p) => p.github_repo_name?.includes('/')) : [])
      )
      .catch(() => setCloudProjects([]));
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
    return () => {
      window.removeEventListener(GITHUB_REPO_CONTEXT_EVENT, onRefresh);
      window.removeEventListener(GITHUB_PROJECT_SAVED_EVENT, onRefresh);
      window.removeEventListener('storage', refreshLocal);
      window.removeEventListener('xroga-resume-workspace', onRefresh);
    };
  }, [refreshLocal, refreshCloud]);

  // Re-sync when live messages change — also when they become empty (New Terminal)
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
      if (list.some((s) => s.id === session.id)) return;
      const stubIdx = list.findIndex(
        (s) =>
          (s.kind === 'index' || s.kind === 'live') &&
          s.githubRepoName === session.githubRepoName &&
          (session.kind === 'local' || session.kind === 'cloud') &&
          (s.id.startsWith('live-') || s.title === 'New terminal' || s.title === 'Current terminal')
      );
      if (stubIdx >= 0) list.splice(stubIdx, 1);
      list.push(session);
      map.set(key, list);
    };

    for (const e of entries) {
      if (!e.githubRepoName?.includes('/')) continue;
      push(e.githubRepoName, {
        id: e.id,
        title: e.title || 'Terminal',
        updatedAt: e.updatedAt,
        status: e.status,
        githubRepoName: e.githubRepoName,
        githubBranch: e.githubBranch || 'main',
        cloudSynced: Boolean(e.cloudProjectId),
        kind: 'local',
        activityKind: activityFromHistory(e.kind),
        entry: e,
      });
    }

    for (const ix of indexEntries) {
      if (!isRealRepoSession(ix)) continue;
      if (entries.some((e) => e.id === ix.sessionId || e.id === ix.id)) continue;
      push(ix.githubRepoName, {
        id: ix.sessionId || ix.id,
        title: ix.title,
        updatedAt: ix.updatedAt,
        status: ix.status,
        githubRepoName: ix.githubRepoName,
        githubBranch: ix.githubBranch || 'main',
        cloudSynced: Boolean(ix.cloudProjectId),
        kind: 'index',
        activityKind: ix.activityKind ?? 'chat',
        index: ix,
      });
    }

    for (const p of cloudProjects) {
      const key = p.github_repo_name!;
      if (p.id.startsWith('history-')) continue;
      const already = map.get(key)?.some((s) => s.id === p.id || s.title === p.name);
      if (already) continue;
      push(key, {
        id: p.id,
        title: p.name || repoLabel(key),
        updatedAt: p.updated_at || p.created_at,
        status: 'complete',
        githubRepoName: key,
        githubBranch: 'main',
        cloudSynced: true,
        kind: 'cloud',
        activityKind: 'code',
        project: p,
      });
    }

    // Selected repo always appears. Empty live workspace = "New terminal" stub
    // (does not replace prior sessions — those stay listed with their titles).
    if (selectedRepo?.includes('/')) {
      const list = map.get(selectedRepo) ?? [];
      const hasLiveStub = list.some((s) => s.id.startsWith('live-'));
      if (liveEmpty && !hasLiveStub) {
        list.unshift({
          id: `live-${selectedRepo}`,
          title: list.length ? 'New terminal' : 'Current terminal',
          updatedAt: new Date().toISOString(),
          githubRepoName: selectedRepo,
          githubBranch: getSelectedRepoContext()?.branch || 'main',
          cloudSynced: false,
          kind: 'live',
          activityKind: 'chat',
        });
        map.set(selectedRepo, list);
      } else if (!map.has(selectedRepo)) {
        map.set(selectedRepo, [
          {
            id: `live-${selectedRepo}`,
            title: 'Current terminal',
            updatedAt: new Date().toISOString(),
            githubRepoName: selectedRepo,
            githubBranch: getSelectedRepoContext()?.branch || 'main',
            cloudSynced: false,
            kind: 'live',
            activityKind: 'chat',
          },
        ]);
      }
    }

    let foldersList = Array.from(map.entries())
      .filter(([key, sessions]) => key.includes('/') && sessions.length > 0)
      .map(([key, sessions]) => ({
        key,
        label: repoLabel(key),
        sessions: sessions
          .sort((a, b) => {
            // Keep New terminal stub first when present, then newest chats
            if (a.id.startsWith('live-') && !b.id.startsWith('live-')) return -1;
            if (b.id.startsWith('live-') && !a.id.startsWith('live-')) return 1;
            return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
          })
          .slice(0, 20),
      }));

    foldersList.sort((a, b) => {
      if (selectedRepo && a.key === selectedRepo) return -1;
      if (selectedRepo && b.key === selectedRepo) return 1;
      const aT = Date.parse(a.sessions.find((s) => !s.id.startsWith('live-'))?.updatedAt ?? a.sessions[0]?.updatedAt ?? 0);
      const bT = Date.parse(b.sessions.find((s) => !s.id.startsWith('live-'))?.updatedAt ?? b.sessions[0]?.updatedAt ?? 0);
      return bT - aT;
    });

    if (filterRecent) foldersList = foldersList.slice(0, 12);
    return foldersList;
  }, [entries, indexEntries, cloudProjects, filterRecent, selectedRepo, liveEmpty]);

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
      saveSelectedRepoContext({ repo: entry.githubRepoName, branch: entry.githubBranch || branch });
      notifyGithubRepoContext(entry.githubRepoName, entry.githubBranch || branch);
    }
    await restoreTerminalSession({
      sessionId: entry.id,
      prompt: entry.prompt,
      messages: entry.messages,
      selectedId: entry.id,
      selectedLabel: entry.title,
      source: 'projects',
      jumpMessageId: entry.messages[entry.messages.length - 1]?.id,
    });
    router.push('/workspace');
    toast.success('Restored your previous terminal');
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

      if (session.kind === 'cloud' && session.project) {
        const loaded = await loadGithubProjectSession(session.project, { branch });
        const localMatch = entries.find(
          (e) =>
            e.githubRepoName === session.githubRepoName &&
            (e.messages?.length ?? 0) > loaded.messages.length
        );
        const fullLocal = localMatch ? await loadTerminalHistoryEntry(localMatch.id) : null;
        const msgs =
          fullLocal?.messages?.length && fullLocal.messages.length >= loaded.messages.length
            ? fullLocal.messages
            : loaded.messages;
        const prompt = fullLocal?.prompt || loaded.prompt;
        const restoreId = fullLocal?.id || loaded.sessionId;

        await restoreTerminalSession({
          sessionId: restoreId,
          prompt: prompt || session.title,
          messages: msgs.length ? msgs : [],
          selectedId: session.project.id,
          selectedLabel: session.title,
          source: 'projects',
          jumpMessageId: msgs[msgs.length - 1]?.id,
        });
        router.push('/workspace');
        return;
      }

      if (!repo?.includes('/')) {
        router.push('/workspace');
        return;
      }

      const preferId = session.id.startsWith('live-')
        ? undefined
        : session.entry?.id || session.index?.sessionId || session.id;

      // Explicit New terminal stub — intentional blank workspace
      if (session.kind === 'live' || session.id.startsWith('live-')) {
        const resolved = await resolveTerminalToOpen(repo);
        if (resolved.kind === 'live' || resolved.kind === 'empty') {
          router.push('/workspace');
          return;
        }
        // Live empty but prior chats exist: if user clicked the New terminal
        // stub, stay blank; folder restore uses openRepoFolder instead.
        if (session.title === 'New terminal') {
          router.push('/workspace');
          return;
        }
        await applyRestore(resolved.entry, branch);
        return;
      }

      const resolved = await resolveTerminalToOpen(repo, preferId);
      if (resolved.kind === 'live') {
        router.push('/workspace');
        return;
      }
      if (resolved.kind === 'restore') {
        await applyRestore(resolved.entry, branch);
        return;
      }

      toast('No saved chat found for this terminal yet — prior chats stay listed under this repo.');
      router.push('/workspace');
    } finally {
      setBusyId(null);
    }
  }

  /** Clicking the repo folder reopens the latest prior terminal — not a blank slate. */
  async function openRepoFolder(folder: RepoFolder) {
    if (busyId) return;
    setBusyId(folder.key);
    setOpenFolders((prev) => ({ ...prev, [folder.key]: true }));
    try {
      const branch =
        folder.sessions[0]?.githubBranch || getSelectedRepoContext()?.branch || 'main';
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
          Select a GitHub repo above, then chat or build — it appears here with each terminal session.
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
                            {oneLine(session.title, 28)}
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
