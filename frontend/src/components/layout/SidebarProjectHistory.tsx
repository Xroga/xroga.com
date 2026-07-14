'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Cloud, Filter, FolderGit2, FolderOpen, GitBranch, ChevronDown, ChevronRight } from 'lucide-react';
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
import { formatCompactAgo } from '@/lib/safeDates';
import { cn } from '@/lib/utils';
import { api, type Project } from '@/lib/api';
import { loadGithubProjectSession } from '@/lib/projectResume';

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

/** Only repos the user actually used on Xroga — Cursor-style session rows. */
export function SidebarProjectHistory({ expanded }: { expanded: boolean }) {
  const router = useRouter();
  const { restoreTerminalSession, startNewChat } = useTerminalChat();
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([]);
  const [indexEntries, setIndexEntries] = useState<RepoSessionIndexEntry[]>([]);
  const [cloudProjects, setCloudProjects] = useState<Project[]>([]);
  const [filterRecent, setFilterRecent] = useState(true);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const refreshLocal = useCallback(() => {
    setEntries(
      loadTerminalHistory()
        .filter((e) => e.messageCount > 0 && e.githubRepoName?.includes('/'))
        .slice(0, 60)
    );
    setIndexEntries(loadRepoSessionsIndex());
  }, []);

  const refreshCloud = useCallback(() => {
    // Only projects already saved from Xroga work — never dump every GitHub repo
    void api.projects
      .listGithub()
      .then((list) => setCloudProjects(Array.isArray(list) ? list.filter((p) => p.github_repo_name?.includes('/')) : []))
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

  const folders = useMemo((): RepoFolder[] => {
    const map = new Map<string, RepoSession[]>();
    const push = (key: string, session: RepoSession) => {
      if (!key.includes('/') && key !== 'Recent') return;
      const list = map.get(key) ?? [];
      if (list.some((s) => s.id === session.id)) return;
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
      if (!e.githubRepoName?.includes('/')) continue;
      push(e.githubRepoName, {
        id: e.id,
        title: e.title || 'Session',
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
      // Prefer local history row when same session already listed
      if (entries.some((e) => e.id === ix.sessionId || e.id === ix.id)) continue;
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

    for (const p of cloudProjects) {
      const key = p.github_repo_name!;
      // Skip cloud-only stub if this repo already has local sessions
      if (map.has(key) && (map.get(key)?.length ?? 0) > 0) {
        // Still allow cloud project if it's a distinct saved build not in local
        const already = map.get(key)!.some((s) => s.id === p.id || s.title === p.name);
        if (already) continue;
      }
      if (p.id.startsWith('history-')) continue;
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

    // Drop empty folders and "Recent" without a real repo
    let foldersList = Array.from(map.entries())
      .filter(([key, sessions]) => key.includes('/') && sessions.length > 0)
      .map(([key, sessions]) => ({
        key,
        label: repoLabel(key),
        sessions: sessions
          .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
          .slice(0, 8),
      }));

    foldersList.sort((a, b) => {
      const aT = Date.parse(a.sessions[0]?.updatedAt ?? 0);
      const bT = Date.parse(b.sessions[0]?.updatedAt ?? 0);
      return bT - aT;
    });

    if (filterRecent) foldersList = foldersList.slice(0, 8);
    return foldersList;
  }, [entries, indexEntries, cloudProjects, filterRecent]);

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
          prompt: prompt || session.title,
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
          Repos appear here after you work in them on Xroga — chat, research, images, or builds.
        </p>
      ) : (
        <div className="xv-repos-scroll space-y-0.5 max-h-[280px] overflow-y-auto pr-1">
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
                            'w-full flex items-center gap-1.5 rounded-md pl-6 pr-2 py-1.5 transition-colors',
                            'hover:bg-[var(--foreground)]/8',
                            isSelected && 'bg-[var(--foreground)]/10'
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
