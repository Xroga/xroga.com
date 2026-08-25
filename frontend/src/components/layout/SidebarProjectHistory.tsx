'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Cloud, FolderGit2, FolderOpen, GitBranch, ChevronDown, ChevronRight } from 'lucide-react';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { FilterIcon } from '@/components/icons/animated/FilterIcon';
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

type RepoFilter = 'latest' | 'oldest' | 'all' | 'current';

const REPO_FILTERS = [
  ['latest', 'Latest activity', 'Most recently used first'],
  ['oldest', 'Oldest activity', 'Earliest saved work first'],
  ['all', 'All repositories', 'Every repository, newest first'],
  ['current', 'Current repository', 'Only the selected workspace'],
] as const;

function RepositoryFilterPopover({
  open,
  anchorRef,
  value,
  onClose,
  onChange,
}: {
  open: boolean;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  value: RepoFilter;
  onClose: () => void;
  onChange: (value: RepoFilter) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 12, top: 12 });

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const width = 252;
    const height = 244;
    const rect = anchorRef.current.getBoundingClientRect();
    const roomOnRight = window.innerWidth - rect.right;
    const left = roomOnRight >= width + 18
      ? rect.right + 10
      : Math.max(12, rect.left - width - 10);
    const top = Math.max(12, Math.min(rect.top - 8, window.innerHeight - height - 12));
    setPosition({ left, top });
  }, [anchorRef, open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (anchorRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [anchorRef, onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={menuRef}
      className="xv-repo-filter-menu xv-repo-filter-menu--portal"
      role="menu"
      aria-label="Repository order"
      style={{ left: position.left, top: position.top }}
    >
      <div className="xv-repo-filter-head"><b>Repository view</b><span>Sort saved workspaces</span></div>
      {REPO_FILTERS.map(([filterValue, label, description]) => (
        <button
          key={filterValue}
          type="button"
          role="menuitemradio"
          aria-checked={value === filterValue}
          onClick={() => onChange(filterValue)}
          className={cn('xv-repo-filter-option', value === filterValue && 'is-active')}
        >
          <i aria-hidden="true" />
          <span><b>{label}</b><small>{description}</small></span>
        </button>
      ))}
    </div>,
    document.body,
  );
}

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
  const { restoreTerminalSession, startNewChat, messages, sessionId, prompt } = useTerminalChat();
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([]);
  const [cloudSessions, setCloudSessions] = useState<CloudTerminalSessionSummary[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [repoFilter, setRepoFilter] = useState<RepoFilter>('latest');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterAnchorRef = useRef<HTMLButtonElement>(null);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  /**
   * Live chat state is read through refs, not closed over.
   *
   * `refreshLocal` used to depend on `[messages, sessionId, prompt]`. `prompt` changes
   * on every keystroke and `messages` on every streamed token, so the callback got a
   * new identity constantly — which re-ran the effect below that owns four window
   * listeners and a cloud subscription, tearing them down and re-adding them, and
   * re-running a synchronous localStorage parse plus a network call, per character
   * typed. That is the lag in this panel.
   *
   * Refs give the same values without making the callback unstable.
   */
  const messagesRef = useRef(messages);
  const sessionIdRef = useRef(sessionId);
  const promptRef = useRef(prompt);
  messagesRef.current = messages;
  sessionIdRef.current = sessionId;
  promptRef.current = prompt;

  const refreshLocal = useCallback(() => {
    const selected = getSelectedRepoContext();
    setSelectedRepo(selected?.repo?.includes('/') ? selected.repo : null);
    // Stamp live chat as #1/#2 under the selected repo (fixes "chat but still 0 terminals")
    if (messagesRef.current.length > 0 && sessionIdRef.current) {
      ensureLiveTerminalUnderSelectedRepo({
        sessionId: sessionIdRef.current,
        messages: messagesRef.current,
        prompt: promptRef.current,
        flushCloud: true,
      });
    }
    const synced = syncRepoTerminalSessions();
    let nextEntries =
      synced.length
        ? synced
        : loadTerminalHistory().filter((e) => e.messageCount > 0 && e.githubRepoName?.includes('/'));

    // Live chat appears under its sticky repo (or selected if still unbound).
    // Never rewrite an existing #N onto a newly selected repo.
    if (messagesRef.current.length > 0 && sessionIdRef.current) {
      const hist = loadTerminalHistory().find((e) => e.id === sessionIdRef.current);
      const bindRepo =
        (hist?.githubRepoName?.includes('/') ? hist.githubRepoName : null) ??
        (selected?.repo?.includes('/') ? selected.repo : null);
      if (bindRepo) {
        const n = allocateTerminalNumber(sessionId, bindRepo);
        const live: TerminalHistoryEntry = {
          id: sessionId,
          title: cloudTerminalLabel(n),
          preview: prompt.slice(0, 200),
          prompt,
          messages,
          kind: hist?.kind ?? 'chat',
          status: 'active',
          githubRepoName: bindRepo,
          githubBranch: hist?.githubBranch || selected?.branch || 'main',
          messageCount: messages.length,
          createdAt: hist?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (!nextEntries.some((e) => e.id === sessionIdRef.current)) {
          nextEntries = [live, ...nextEntries];
        } else {
          nextEntries = nextEntries.map((e) =>
            e.id === sessionId
              ? {
                  ...e,
                  messages: live.messages,
                  prompt: live.prompt,
                  preview: live.preview,
                  messageCount: live.messageCount,
                  updatedAt: live.updatedAt,
                  status: 'active',
                  // Keep sticky repo + #N title from history
                  githubRepoName: e.githubRepoName || live.githubRepoName,
                  title: e.title.startsWith('#') ? e.title : live.title,
                }
              : e
          );
        }
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
    setActiveSessionId(ws?.sessionId ?? sessionIdRef.current ?? null);
    // `messages`, `sessionId` and `prompt` are read through refs above, so they are
    // always current at call time without making this callback unstable. Listing them
    // here is what caused the lag this fixes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cloudRefreshTimer = useRef<number | null>(null);
  const cloudRefreshInFlight = useRef(false);

  const refreshCloudNow = useCallback(async () => {
    // One list call at a time. Five listeners below plus the chat-progress effect
    // can all ask for a refresh inside the same tick; without this each ask was
    // its own request to /api/terminal-sessions.
    if (cloudRefreshInFlight.current) return;
    cloudRefreshInFlight.current = true;
    try {
      const list = await listCloudTerminalSessions();
      setCloudSessions(list);
      const local = loadTerminalHistory().filter(
        (e) => e.messageCount > 0 && e.githubRepoName?.includes('/') && e.messages?.length
      );
      if (!local.length) return;
      // `migrateLocalSessionsToCloud` runs at most once per page load and reports
      // whether it actually uploaded anything. Re-listing unconditionally — as this
      // did before — meant every refresh cost two list calls even when there was
      // nothing to migrate, and each upload's change event started the cycle again.
      const uploaded = await migrateLocalSessionsToCloud(local, list);
      if (uploaded) setCloudSessions(await listCloudTerminalSessions());
    } finally {
      cloudRefreshInFlight.current = false;
    }
  }, []);

  /**
   * Coalesced cloud refresh.
   *
   * A single save dispatches one change event, but a repo switch or a resumed
   * workspace dispatches several within a few milliseconds, and each one used to
   * become its own list request. Collapsing them into one trailing call keeps the
   * UI just as fresh at a fraction of the egress.
   */
  const refreshCloud = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (cloudRefreshTimer.current !== null) window.clearTimeout(cloudRefreshTimer.current);
    cloudRefreshTimer.current = window.setTimeout(() => {
      cloudRefreshTimer.current = null;
      void refreshCloudNow();
    }, 400);
  }, [refreshCloudNow]);

  useEffect(() => {
    refreshLocal();
    void refreshCloudNow();
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
      if (cloudRefreshTimer.current !== null) window.clearTimeout(cloudRefreshTimer.current);
    };
  }, [refreshLocal, refreshCloud, refreshCloudNow]);

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
    // `messages.length`, not `messages`: the array identity changes on every streamed
    // token, so depending on it re-ran this effect continuously during a response.
  }, [messages.length, sessionId, expanded, refreshLocal, refreshCloud]);

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

    // Activity filters operate on real terminal timestamps. The active repository
    // stays pinned only in the normal latest/all views; Oldest remains a truthful
    // chronological sort and Current is an explicit one-repository view.
    foldersList.sort((a, b) => {
      const aT = Math.max(
        0,
        ...a.sessions.map((s) => Date.parse(s.updatedAt) || 0)
      );
      const bT = Math.max(
        0,
        ...b.sessions.map((s) => Date.parse(s.updatedAt) || 0)
      );
      if (repoFilter === 'oldest') return aT - bT;
      if (selectedRepo && a.key === selectedRepo) return -1;
      if (selectedRepo && b.key === selectedRepo) return 1;
      return bT - aT;
    });

    if (repoFilter === 'latest') foldersList = foldersList.slice(0, 12);
    if (repoFilter === 'current') foldersList = foldersList.filter((folder) => folder.key === selectedRepo);
    return foldersList;
  }, [entries, cloudSessions, repoFilter, selectedRepo]);

  const closeFilter = useCallback(() => setFilterOpen(false), []);
  const changeFilter = useCallback((value: RepoFilter) => {
    setRepoFilter(value);
    setFilterOpen(false);
  }, []);

  useEffect(() => {
    setOpenFolders((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const f of folders) {
        if (next[f.key] === undefined) {
          next[f.key] = true;
          changed = true;
        }
      }
      if (selectedRepo && next[selectedRepo] !== true) {
        next[selectedRepo] = true;
        changed = true;
      }
      // Returning `prev` unchanged lets React skip the re-render entirely; the old
      // version always produced a new object, so every refresh re-rendered the tree.
      return changed ? next : prev;
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
      githubRepoName: entry.githubRepoName,
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

      // Session stub exists (e.g. #1 under modernpage) but history body is empty —
      // still open the workspace with this repo selected so chat/builds work.
      setActiveSessionId(session.id);
      router.push('/workspace');
      toast('Opened terminal — start chatting or building in this repo');
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
      const prevRepo = getSelectedRepoContext()?.repo;

      // Switching folders mid-chat: flush old #N (sticky), then open this folder's terminal.
      if (
        messages.length > 0 &&
        prevRepo?.includes('/') &&
        prevRepo !== folder.key
      ) {
        startNewChat();
      }

      saveSelectedRepoContext({ repo: folder.key, branch });
      notifyGithubRepoContext(folder.key, branch);

      // Repo selected but no #1 yet — stay on fresh workspace (old repos stay listed)
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
      <div className="relative flex items-center justify-between gap-1 px-1.5 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
          Repositories
        </span>
        <div className="relative">
          <button
            ref={filterAnchorRef}
            type="button"
            title="Filter repositories"
            aria-label="Filter repositories"
            aria-haspopup="menu"
            aria-expanded={filterOpen}
            onClick={() => setFilterOpen((value) => !value)}
            className={cn('xv-repo-filter-trigger', repoFilter !== 'latest' && 'is-active')}
          >
            {/* The funnel settles as if something just passed through it. */}
            <AnimatedIcon icon={FilterIcon} size={12} />
          </button>
          <RepositoryFilterPopover
            open={filterOpen}
            anchorRef={filterAnchorRef}
            value={repoFilter}
            onClose={closeFilter}
            onChange={changeFilter}
          />
        </div>
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
