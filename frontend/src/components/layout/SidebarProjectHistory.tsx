'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Cloud,
  Filter,
  FolderGit2,
  FolderOpen,
  GitBranch,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
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
  ensureSelectedRepoFolder,
  loadRepoSessionsIndex,
  type RepoActivityKind,
  type RepoSessionIndexEntry,
} from '@/lib/repoSessionsIndex';
import { formatSafeDistance } from '@/lib/safeDates';
import { cn } from '@/lib/utils';
import { api, type Project } from '@/lib/api';
import { loadGithubProjectSession } from '@/lib/projectResume';
import { mergeGithubProjects } from '@/lib/githubProjectsFromHistory';

type RepoSession = {
  id: string;
  title: string;
  updatedAt: string;
  status?: TerminalHistoryStatus;
  githubRepoName?: string;
  githubBranch?: string;
  cloudSynced: boolean;
  kind: 'local' | 'cloud' | 'index';
  activityKind?: RepoActivityKind;
  entry?: TerminalHistoryEntry;
  project?: Project;
  index?: RepoSessionIndexEntry;
};

function activityLabel(kind?: RepoActivityKind | TerminalHistoryEntry['kind']): string {
  if (kind === 'code') return 'Build';
  if (kind === 'image') return 'Image';
  if (kind === 'research' || kind === 'business') return 'Research';
  if (kind === 'mixed') return 'Mixed';
  return 'Chat';
}

type RepoFolder = {
  key: string;
  label: string;
  sessions: RepoSession[];
};

function oneLine(text: string, max = 42): string {
  const line = text.replace(/\s+/g, ' ').trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1)}…`;
}

function repoLabel(full: string): string {
  if (!full.includes('/')) return full;
  return full.split('/')[1] || full;
}

/** Cursor-style Repositories sidebar — never empty when GitHub is connected / used. */
export function SidebarProjectHistory({ expanded }: { expanded: boolean }) {
  const router = useRouter();
  const { restoreTerminalSession, startNewChat } = useTerminalChat();
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([]);
  const [indexEntries, setIndexEntries] = useState<RepoSessionIndexEntry[]>([]);
  const [cloudProjects, setCloudProjects] = useState<Project[]>([]);
  const [connectedRepos, setConnectedRepos] = useState<string[]>([]);
  const [filterRecent, setFilterRecent] = useState(true);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const refreshLocal = useCallback(() => {
    ensureSelectedRepoFolder();
    setEntries(
      loadTerminalHistory()
        .filter((e) => e.messageCount > 0 || Boolean(e.githubRepoName))
        .slice(0, 48)
    );
    setIndexEntries(loadRepoSessionsIndex());
  }, []);

  const refreshCloud = useCallback(() => {
    void api.projects
      .list()
      .then((list) => {
        const all = Array.isArray(list) ? list : [];
        const withGithub = all.filter((p) => p.github_repo_name?.includes('/'));
        setCloudProjects(withGithub.length ? withGithub : all.filter((p) => p.github_repo_name));
      })
      .catch(() => {
        void api.projects
          .listGithub()
          .then((list) => setCloudProjects(Array.isArray(list) ? list : []))
          .catch(() => setCloudProjects([]));
      });

    void api.github
      .status()
      .then((st) => {
        if (st.defaultRepo?.includes('/')) {
          setConnectedRepos((prev) =>
            prev.includes(st.defaultRepo!) ? prev : [st.defaultRepo!, ...prev]
          );
        }
        if (!st.connected) return;
        return api.github.listRepos();
      })
      .then((res) => {
        if (!res?.repos?.length) return;
        setConnectedRepos((prev) => {
          const names = res.repos.map((r) => r.fullName).filter((n) => n.includes('/'));
          return Array.from(new Set([...names.slice(0, 20), ...prev]));
        });
      })
      .catch(() => {
        /* optional — local index still works */
      });
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

  const folders = useMemo((): RepoFolder[] => {
    const map = new Map<string, RepoSession[]>();
    const push = (key: string, session: RepoSession) => {
      const list = map.get(key) ?? [];
      if (list.some((s) => s.id === session.id)) return;
      // Prefer richer local/cloud over bare index stub
      const stubIdx = list.findIndex(
        (s) =>
          s.kind === 'index' &&
          s.githubRepoName === session.githubRepoName &&
          (session.kind === 'local' || session.kind === 'cloud')
      );
      if (stubIdx >= 0) list.splice(stubIdx, 1);
      list.push(session);
      map.set(key, list);
    };

    for (const e of entries) {
      const key = e.githubRepoName?.includes('/') ? e.githubRepoName : 'Recent';
      push(key, {
        id: e.id,
        title: e.title,
        updatedAt: e.updatedAt,
        status: e.status,
        githubRepoName: e.githubRepoName,
        githubBranch: e.githubBranch || 'main',
        cloudSynced: Boolean(e.cloudProjectId),
        kind: 'local',
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
        entry: e,
      });
    }

    for (const ix of indexEntries) {
      if (!ix.githubRepoName?.includes('/')) continue;
      push(ix.githubRepoName, {
        id: ix.id,
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

    const merged = mergeGithubProjects(cloudProjects, entries);
    for (const p of merged) {
      const key = p.github_repo_name?.includes('/') ? p.github_repo_name : 'Recent';
      if (p.id.startsWith('history-')) continue;
      push(key, {
        id: p.id,
        title: p.name,
        updatedAt: p.updated_at || p.created_at,
        status: 'complete',
        githubRepoName: p.github_repo_name ?? undefined,
        githubBranch: 'main',
        cloudSynced: true,
        kind: 'cloud',
        activityKind: 'code',
        project: p,
      });
    }

    // Connected GitHub accounts: show repo folders even with no session yet
    for (const repo of connectedRepos) {
      if (!repo.includes('/')) continue;
      if (!map.has(repo)) {
        map.set(repo, [
          {
            id: `connected-${repo}`,
            title: 'Open in workspace',
            updatedAt: new Date().toISOString(),
            githubRepoName: repo,
            githubBranch: 'main',
            cloudSynced: true,
            kind: 'index',
          },
        ]);
      }
    }

    const selected = getSelectedRepoContext()?.repo;
    if (selected?.includes('/') && !map.has(selected)) {
      map.set(selected, [
        {
          id: `selected-${selected}`,
          title: 'Current selection',
          updatedAt: new Date().toISOString(),
          githubRepoName: selected,
          githubBranch: getSelectedRepoContext()?.branch || 'main',
          cloudSynced: false,
          kind: 'index',
        },
      ]);
    }

    let foldersList = Array.from(map.entries()).map(([key, sessions]) => ({
      key,
      label: key === 'Recent' ? 'Recent' : repoLabel(key),
      sessions: sessions.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 8),
    }));

    foldersList.sort((a, b) => {
      if (a.key === 'Recent') return 1;
      if (b.key === 'Recent') return -1;
      const aT = Date.parse(a.sessions[0]?.updatedAt ?? 0);
      const bT = Date.parse(b.sessions[0]?.updatedAt ?? 0);
      return bT - aT;
    });

    if (filterRecent) foldersList = foldersList.slice(0, 10);
    return foldersList;
  }, [entries, indexEntries, cloudProjects, connectedRepos, filterRecent]);

  useEffect(() => {
    setOpenFolders((prev) => {
      const next = { ...prev };
      for (const f of folders) {
        if (next[f.key] === undefined) next[f.key] = true;
      }
      return next;
    });
  }, [folders]);

  async function openSession(session: RepoSession) {
    if (busyId) return;
    setBusyId(session.id);
    try {
      const branch = session.githubBranch || 'main';
      if (session.githubRepoName?.includes('/')) {
        saveSelectedRepoContext({ repo: session.githubRepoName, branch });
        notifyGithubRepoContext(session.githubRepoName, branch);
      }

      if (session.kind === 'cloud' && session.project) {
        const loaded = await loadGithubProjectSession(session.project, { branch });
        const localMatch = entries.find(
          (e) =>
            e.githubRepoName === session.githubRepoName &&
            (e.messages?.length ?? 0) > loaded.messages.length
        );
        const fullLocal = localMatch ? await loadTerminalHistoryEntry(localMatch.id) : null;
        const messages =
          fullLocal?.messages?.length && fullLocal.messages.length >= loaded.messages.length
            ? fullLocal.messages
            : loaded.messages;
        const prompt = fullLocal?.prompt || loaded.prompt;
        const sessionId = fullLocal?.id || loaded.sessionId;

        startNewChat();
        await restoreTerminalSession({
          sessionId,
          prompt: prompt || `Continue ${session.githubRepoName}`,
          messages: messages.length ? messages : [],
          selectedId: session.project.id,
          selectedLabel: session.title,
          source: 'projects',
          jumpMessageId: messages[messages.length - 1]?.id,
        });
        router.push('/workspace');
        return;
      }

      const historyId = session.entry?.id || session.index?.sessionId || session.id;
      const full = await loadTerminalHistoryEntry(historyId);
      if (full?.messages?.length) {
        startNewChat();
        await restoreTerminalSession({
          sessionId: full.id,
          prompt: full.prompt,
          messages: full.messages,
          selectedId: full.id,
          selectedLabel: full.title,
          source: 'projects',
          jumpMessageId: full.messages[full.messages.length - 1]?.id,
        });
        router.push('/workspace');
        return;
      }

      // Repo folder with no chat yet — just select repo and open workspace
      startNewChat();
      router.push('/workspace');
    } finally {
      setBusyId(null);
    }
  }

  if (!expanded) return null;

  const selected = getSelectedRepoContext()?.repo;

  return (
    <div className="mt-2 mb-1 px-1.5">
      <div className="flex items-center justify-between gap-1 px-1.5 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
          Repositories
        </span>
        <button
          type="button"
          title={filterRecent ? 'Showing recent repos' : 'Show all'}
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
          Connect GitHub, select a repo, then chat / research / generate / build. Everything stays under that
          repo here on Xroga (only code goes to GitHub).
        </p>
      ) : (
        <div className="space-y-0.5 max-h-[280px] overflow-y-auto pr-0.5 scrollbar-thin">
          {folders.map((folder) => {
            const isOpen = openFolders[folder.key] !== false;
            const FolderIcon = isOpen ? FolderOpen : FolderGit2;
            return (
              <div key={folder.key} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setOpenFolders((prev) => ({ ...prev, [folder.key]: !isOpen }))
                  }
                  className="w-full flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] text-[var(--muted)] hover:bg-[var(--foreground)]/5 hover:text-[var(--foreground)]"
                >
                  {isOpen ? (
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
                  ) : (
                    <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />
                  )}
                  <FolderIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate font-medium" title={folder.key}>
                    {folder.label}
                  </span>
                </button>
                {isOpen
                  ? folder.sessions.map((session) => {
                      const isSelected = selected && session.githubRepoName === selected;
                      return (
                        <button
                          key={session.id}
                          type="button"
                          disabled={busyId === session.id}
                          onClick={() => void openSession(session)}
                          className={cn(
                            'w-full text-left rounded-md pl-6 pr-2 py-1.5 transition-colors',
                            'hover:bg-[var(--foreground)]/8',
                            isSelected && 'bg-[var(--foreground)]/10'
                          )}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <p className="text-[11px] font-medium text-[var(--foreground)]/90 truncate leading-snug">
                              {oneLine(session.title, 34)}
                            </p>
                            <span className="text-[9px] text-[var(--muted)] shrink-0 tabular-nums">
                              {formatSafeDistance(session.updatedAt)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[var(--muted)]">
                            <GitBranch className="h-2.5 w-2.5 text-violet-400" />
                            {session.cloudSynced && <Cloud className="h-2.5 w-2.5 opacity-70" />}
                            <span className="text-[9px] uppercase tracking-wide opacity-80">
                              {activityLabel(session.activityKind)}
                            </span>
                          </div>
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
