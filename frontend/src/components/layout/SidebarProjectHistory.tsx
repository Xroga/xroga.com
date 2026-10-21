'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Cloud, FolderOpen, Folder, MessageSquare, ChevronDown, ChevronRight, Pin, PinOff, Ellipsis, Plus, ArchiveRestore } from 'lucide-react';
import { AnimatedIcon } from '@/components/icons/animated/AnimatedIcon';
import { FilterIcon } from '@/components/icons/animated/FilterIcon';
import { GitForkIcon } from '@/components/icons/animated/GitForkIcon';
import toast from 'react-hot-toast';
import { useTerminalChat } from '@/context/TerminalChatContext';
import {
  loadTerminalHistory,
  type TerminalHistoryEntry,
  type TerminalHistoryStatus,
} from '@/lib/terminalHistory';
import { getSelectedRepoContext, saveSelectedRepoContext, PROJECT_CONTEXT_CHANGED_EVENT } from '@/lib/repoContext';
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
import { api, type CloudTerminalSessionSummary, type Project } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import { removeTerminalHistoryEntry } from '@/lib/terminalHistory';
import { SidebarOrganizerMenu, SidebarRevealTitle, type SidebarMenuTarget } from './SidebarOrganizerUI';
import './SidebarOrganizer.css';
import { loadSidebarMetadata, saveSidebarMetadata, removeSidebarMetadata,
  listSidebarProjects, listSidebarSections, createSidebarSection, renameSidebarSection, removeSidebarSection, safeConversationTitle,
  type SidebarItemMeta, type SidebarSection, type SidebarItemType } from '@/lib/sidebarOrganization';
import { formatCompactAgo } from '@/lib/safeDates';
import { cn } from '@/lib/utils';
import { loadWorkspaceSession } from '@/lib/workspacePersistence';
import { projectContextKey } from '@/lib/projectContext';
import { useWorkspaceIdentity } from '@/components/layout/WorkspaceIdentityContext';
import { useWorkspaceAuthGate } from '@/components/workspace/WorkspaceAuthGate';

type RepoSession = {
  id: string;
  title: string;
  updatedAt: string;
  status?: TerminalHistoryStatus;
  githubRepoName?: string;
  githubBranch?: string;
  projectRoot?: string;
  cloudSynced: boolean;
  kind: 'local' | 'cloud';
  terminalNumber: number;
  entry?: TerminalHistoryEntry;
  preview?: string;
};

type RepoFolder = {
  key: string;
  repo: string;
  branch: string;
  projectRoot: string;
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
  const workspaceIdentity = useWorkspaceIdentity();
  const isGuest = workspaceIdentity.status === 'guest';
  const { requestAuthGate } = useWorkspaceAuthGate();
  const { restoreTerminalSession, startNewChat, messages, sessionId, prompt } = useTerminalChat();
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([]);
  const [allHistory, setAllHistory] = useState<TerminalHistoryEntry[]>([]);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [cloudSessions, setCloudSessions] = useState<CloudTerminalSessionSummary[]>([]);
  const [selectedContextKey, setSelectedContextKey] = useState<string | null>(null);
  const [repoFilter, setRepoFilter] = useState<RepoFilter>('latest');
  const [filterOpen, setFilterOpen] = useState(false);
  const filterAnchorRef = useRef<HTMLButtonElement>(null);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [projectRows,setProjectRows]=useState<Project[]>([]);
  const [projectsLoading,setProjectsLoading]=useState(false);
  const [projectsMore,setProjectsMore]=useState(false);
  const [projectCount,setProjectCount]=useState(5);
  const [sections,setSections]=useState<SidebarSection[]>([]);
  const [metadata,setMetadata]=useState<SidebarItemMeta[]>([]);
  const [metaLoaded,setMetaLoaded]=useState(false);
  const [morePins,setMorePins]=useState(10);
  const [moreRecent,setMoreRecent]=useState(50);
  const [loadingMoreRecent,setLoadingMoreRecent]=useState(false);
  const [recentsMore,setRecentsMore]=useState(true);
  const [showArchived,setShowArchived]=useState(false);
  const [expandedProjects,setExpandedProjects]=useState<Record<string,boolean>>({});
  const [fullProjects,setFullProjects]=useState<Record<string,boolean>>({});
  const [menuTarget,setMenuTarget]=useState<SidebarMenuTarget|null>(null);
  const [menuPoint,setMenuPoint]=useState<{x:number;y:number}|null>(null);
  const menuTriggerRef=useRef<HTMLElement|null>(null);
  const handledLinkRef=useRef<string|null>(null);
  const [pinNames,setPinNames]=useState<Record<string,string>>({});

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
  // Local account-scoped pins; cross-device pin sync is not yet supported.
  const pinStorageKey = !isGuest && workspaceIdentity.userId
    ? 'xroga_sidebar_pins_v1:' + workspaceIdentity.userId : null;

  useEffect(() => {
    if (!pinStorageKey) { setPinnedIds([]); return; }
    function read() {
      try {
        const parsed = JSON.parse(localStorage.getItem(pinStorageKey!) || '[]');
        setPinnedIds(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string').slice(0, 200) : []);
      } catch { setPinnedIds([]); }
    }
    read();
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, [pinStorageKey]);

  function togglePin(id: string) {
    if (!pinStorageKey) return;
    setPinnedIds(prev => {
      const next = prev.includes(id) ? prev.filter(value => value !== id) : [id, ...prev].slice(0, 200);
      try { localStorage.setItem(pinStorageKey, JSON.stringify(next)); } catch { /* storage unavailable */ }
      return next;
    });
  }

  const messagesRef = useRef(messages);
  const sessionIdRef = useRef(sessionId);
  const promptRef = useRef(prompt);
  messagesRef.current = messages;
  sessionIdRef.current = sessionId;
  promptRef.current = prompt;

  const refreshLocal = useCallback(() => {
    if (isGuest) {
      setEntries([]);
      setAllHistory([]);
      setCloudSessions([]);
      const ws = loadWorkspaceSession();
      setActiveSessionId(ws?.sessionId ?? sessionIdRef.current ?? null);
      setSelectedContextKey(null);
      return;
    }

    const selected = getSelectedRepoContext();
    setSelectedContextKey(selected?.repo?.includes('/') ? projectContextKey(selected) : null);
    // Stamp live chat as #1/#2 under the selected repo (fixes "chat but still 0 terminals")
    if (messagesRef.current.length > 0 && sessionIdRef.current) {
      ensureLiveTerminalUnderSelectedRepo({
        sessionId: sessionIdRef.current,
        messages: messagesRef.current,
        prompt: promptRef.current,
        flushCloud: true,
      });
    }
    setAllHistory(loadTerminalHistory().filter((e) => e.id && e.messageCount > 0));
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
          projectContextKey: hist?.projectContextKey || (bindRepo ? projectContextKey({ repo: bindRepo, branch: hist?.githubBranch || selected?.branch || 'main', projectRoot: hist?.projectRoot || selected?.projectRoot || '/' }) : undefined),
          projectRoot: hist?.projectRoot || selected?.projectRoot || '/',
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
  }, [isGuest]);

  const cloudRefreshTimer = useRef<number | null>(null);
  const cloudRefreshInFlight = useRef(false);

  const refreshCloudNow = useCallback(async () => {
    if (isGuest) {
      setCloudSessions([]);
      return;
    }
    // One list call at a time. Five listeners below plus the chat-progress effect
    // can all ask for a refresh inside the same tick; without this each ask was
    // its own request to /api/terminal-sessions.
    if (cloudRefreshInFlight.current) return;
    cloudRefreshInFlight.current = true;
    try {
      const list = await listCloudTerminalSessions();
      setCloudSessions(list);
      const local = loadTerminalHistory().filter(
        (e) => e.messageCount > 0 && e.messages?.length
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
  }, [isGuest]);

  /**
   * Coalesced cloud refresh.
   *
   * A single save dispatches one change event, but a repo switch or a resumed
   * workspace dispatches several within a few milliseconds, and each one used to
   * become its own list request. Collapsing them into one trailing call keeps the
   * UI just as fresh at a fraction of the egress.
   */
  const refreshCloud = useCallback(() => {
    if (isGuest || typeof window === 'undefined') return;
    if (cloudRefreshTimer.current !== null) window.clearTimeout(cloudRefreshTimer.current);
    cloudRefreshTimer.current = window.setTimeout(() => {
      cloudRefreshTimer.current = null;
      void refreshCloudNow();
    }, 400);
  }, [isGuest, refreshCloudNow]);

  useEffect(() => {
    refreshLocal();
    void refreshCloudNow();
    const onRefresh = () => {
      refreshLocal();
      refreshCloud();
    };
    window.addEventListener(GITHUB_REPO_CONTEXT_EVENT, onRefresh);
    window.addEventListener(PROJECT_CONTEXT_CHANGED_EVENT, onRefresh);
    window.addEventListener(GITHUB_PROJECT_SAVED_EVENT, onRefresh);
    window.addEventListener('storage', refreshLocal);
    window.addEventListener('xroga-resume-workspace', onRefresh);
    const offCloud = onCloudTerminalsChanged(onRefresh);
    return () => {
      window.removeEventListener(GITHUB_REPO_CONTEXT_EVENT, onRefresh);
      window.removeEventListener(PROJECT_CONTEXT_CHANGED_EVENT, onRefresh);
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
    const map = new Map<string, { repo: string; branch: string; projectRoot: string; sessions: RepoSession[] }>();
    const push = (repo: string, branch: string, projectRoot: string, session: RepoSession) => {
      if (!repo.includes('/')) return;
      const key = projectContextKey({ repo, branch, projectRoot });
      const bucket = map.get(key) ?? { repo, branch, projectRoot, sessions: [] };
      const list = bucket.sessions;
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
        map.set(key, { ...bucket, sessions: list });
        return;
      }
      list.push(session);
      map.set(key, { ...bucket, sessions: list });
    };

    for (const s of cloudSessions) {
      if (!s.githubRepoName?.includes('/') || s.messageCount <= 0) continue;
      push(s.githubRepoName, s.githubBranch || 'main', '/', {
        id: s.id,
        title: cloudTerminalLabel(s.terminalNumber),
        updatedAt: s.updatedAt,
        status: (s.status as TerminalHistoryStatus) || 'complete',
        githubRepoName: s.githubRepoName,
        githubBranch: s.githubBranch || 'main',
        projectRoot: '/',
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
      push(e.githubRepoName, e.githubBranch || 'main', e.projectRoot || '/', {
        id: e.id,
        title: cloudTerminalLabel(n),
        updatedAt: e.updatedAt,
        status: e.status,
        githubRepoName: e.githubRepoName,
        githubBranch: e.githubBranch || 'main',
        projectRoot: e.projectRoot || '/',
        cloudSynced: Boolean(cachedTerminalNumber(e.id)),
        kind: 'local',
        terminalNumber: n,
        entry: e,
      });
    }

    // Show currently selected repo even before first chat (#1 appears after first message).
    // Never invent a "New terminal" stub row.
    const selected = getSelectedRepoContext();
    if (selected?.repo?.includes('/') && selectedContextKey && !map.has(selectedContextKey)) {
      map.set(selectedContextKey, { repo: selected.repo, branch: selected.branch, projectRoot: selected.projectRoot || '/', sessions: [] });
    }

    let foldersList = Array.from(map.entries())
      .filter(
        ([key, bucket]) => bucket.repo.includes('/') && (bucket.sessions.length > 0 || key === selectedContextKey)
      )
      .map(([key, bucket]) => ({
        key,
        repo: bucket.repo,
        branch: bucket.branch,
        projectRoot: bucket.projectRoot,
        label: repoLabel(bucket.repo),
        sessions: bucket.sessions
          .sort((a, b) => {
            if (a.terminalNumber !== b.terminalNumber) {
              return a.terminalNumber - b.terminalNumber;
            }
            return Date.parse(a.updatedAt) - Date.parse(b.updatedAt);
          }),
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
      if (selectedContextKey && a.key === selectedContextKey) return -1;
      if (selectedContextKey && b.key === selectedContextKey) return 1;
      return bT - aT;
    });

    // The single parent scrollbar reaches all repositories; no 12-folder truncation.
    if (repoFilter === 'current') foldersList = foldersList.filter((folder) => folder.key === selectedContextKey);
    return foldersList;
  }, [entries, cloudSessions, repoFilter, selectedContextKey]);

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
      if (selectedContextKey && next[selectedContextKey] !== true) {
        next[selectedContextKey] = true;
        changed = true;
      }
      // Returning `prev` unchanged lets React skip the re-render entirely; the old
      // version always produced a new object, so every refresh re-rendered the tree.
      return changed ? next : prev;
    });
  }, [folders, selectedContextKey]);

  async function applyRestore(entry: TerminalHistoryEntry, branch: string) {
    if (entry.githubRepoName?.includes('/')) {
      saveSelectedRepoContext({
        repo: entry.githubRepoName,
        branch: entry.githubBranch || branch,
        projectRoot: entry.projectRoot || '/',
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
        const saved=session.entry?.messages?.length?session.entry:await loadTerminalFromAnywhere(session.id);
        if(saved?.messages?.length)await applyRestore(saved,'main');
        else toast.error('This conversation is unavailable; no empty chat was opened');
        return;
      }

      saveSelectedRepoContext({ repo, branch, projectRoot: session.projectRoot || '/' });
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

      toast.error('Saved messages are unavailable; no empty chat was opened');
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
      const branch = folder.branch;
      const previous = getSelectedRepoContext();
      const previousKey = previous?.repo?.includes('/') ? projectContextKey(previous) : null;

      // Switching folders mid-chat: flush old #N (sticky), then open this folder's terminal.
      if (previousKey && previousKey !== folder.key) {
        startNewChat();
      }

      saveSelectedRepoContext({ repo: folder.repo, branch, projectRoot: folder.projectRoot });
      notifyGithubRepoContext(folder.repo, branch);

      // Repo selected but no #1 yet — stay on fresh workspace (old repos stay listed)
      if (!folder.sessions.length) {
        router.push('/workspace');
        return;
      }

      const preferId = latest?.id;
      const resolved = await resolveTerminalToOpen(folder.repo, preferId);
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

  /** A single deduplicated history across local caches and account cloud sessions. */
  const savedConversations = useMemo((): RepoSession[] => {
    const map = new Map<string, RepoSession>();
    for (const e of [...allHistory, ...entries]) {
      if (!e.id || e.messageCount <= 0) continue;
      const repo = e.githubRepoName?.includes('/') ? e.githubRepoName : undefined;
      map.set(e.id, {
        id: e.id, title: e.title, preview: e.prompt || e.preview, updatedAt: e.updatedAt,
        status: e.status, githubRepoName: repo, githubBranch: e.githubBranch || 'main',
        projectRoot: e.projectRoot || '/', cloudSynced: Boolean(repo && cachedTerminalNumber(e.id)),
        kind: 'local', terminalNumber: repo ? cachedTerminalNumber(e.id) ?? 0 : 0, entry: e,
      });
    }
    for (const c of cloudSessions) {
      if (!c.id || c.messageCount <= 0) continue;
      const previous = map.get(c.id);
      if (previous) {
        map.set(c.id, { ...previous, preview: previous.preview || c.preview, cloudSynced: true,
          terminalNumber: c.terminalNumber || previous.terminalNumber,
          updatedAt: Date.parse(c.updatedAt) > Date.parse(previous.updatedAt) ? c.updatedAt : previous.updatedAt });
      } else {
        map.set(c.id, { id: c.id, title: c.title, preview: c.preview, updatedAt: c.updatedAt,
          githubRepoName: c.githubRepoName, githubBranch: c.githubBranch || 'main',
          projectRoot: '/', cloudSynced: true, kind: 'cloud', terminalNumber: c.terminalNumber,
          status: c.status as TerminalHistoryStatus });
      }
    }
    return Array.from(map.values()).sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  }, [allHistory, entries, cloudSessions]);

  const userId=!isGuest?workspaceIdentity.userId:undefined;
  const metaById=useMemo(()=>new Map(metadata.map(m=>[`${m.item_type}:${m.item_id}`,m])),[metadata]);
  const metaFor=(kind:SidebarItemType,id:string)=>metaById.get(`${kind}:${id}`);
  const loadOrg=useCallback(async()=>{
    if(!userId){setMetadata([]);setProjectRows([]);setSections([]);setMetaLoaded(false);return;}
    setProjectsLoading(true);
    try{
      const [meta,projectPage,sectionList]=await Promise.all([
        loadSidebarMetadata(userId),listSidebarProjects(userId,0,5),listSidebarSections(userId)
      ]);
      setMetadata(meta);setProjectRows(projectPage.items);setProjectsMore(projectPage.hasMore);
      setSections(sectionList);setProjectCount(5);setMetaLoaded(true);
      const pins=meta.filter(m=>m.pinned_at&&m.pin_order!==null);
      const projectsToFind=pins.filter(m=>m.item_type==='project'&&!m.item_id.startsWith('repo:')).map(m=>m.item_id);
      const chatsToFind=pins.filter(m=>m.item_type==='conversation').map(m=>m.item_id);
      const nameMap:Record<string,string>={};
      const client=createClient();
      for(let at=0;at<projectsToFind.length;at+=100){
        const {data}=await client.from('projects').select('id,name').eq('user_id',userId)
          .in('id',projectsToFind.slice(at,at+100));
        for(const p of data||[])nameMap[`project:${p.id}`]=p.name;
      }
      for(let at=0;at<chatsToFind.length;at+=100){
        const {data}=await client.from('terminal_sessions').select('id,title,prompt').eq('user_id',userId)
          .in('id',chatsToFind.slice(at,at+100));
        for(const c of data||[])nameMap[`conversation:${c.id}`]=safeConversationTitle(c.title,c.prompt);
      }
      setPinNames(nameMap);
    }catch(err){setMetaLoaded(false);toast.error('Could not load saved sidebar organization');console.warn('[sidebar]',err);}
    finally{setProjectsLoading(false);}
  },[userId]);
  useEffect(()=>{void loadOrg();},[loadOrg]);
  useEffect(()=>{
    if(!userId)return;
    const refresh=()=>{if(document.visibilityState==='visible')void loadOrg();};
    document.addEventListener('visibilitychange',refresh);
    return()=>document.removeEventListener('visibilitychange',refresh);
  },[userId,loadOrg]);

  function conversationTitle(session:RepoSession){
    const m=metaFor('conversation',session.id);
    return m?.title_override||safeConversationTitle(session.title,session.entry?.prompt,session.preview);
  }
  const pinned=useMemo(()=>metadata.filter(m=>m.pinned_at!==null&&m.pin_order!==null&&!m.archived_at)
    .sort((a,b)=>(a.pin_order??0)-(b.pin_order??0)),[metadata]);
  const projectDirectory=useMemo(()=>{
    const concrete=projectRows.map(p=>({id:p.id,label:metaById.get(`project:${p.id}`)?.title_override||p.name,
      repo:p.github_repo_name||undefined,project:p,folder:null as RepoFolder|null,updatedAt:p.updated_at}));
    const repositoryFolders=folders.filter(f=>!projectRows.some(p=>p.github_repo_name===f.repo))
      .map(f=>({id:`repo:${f.key}`,label:metaById.get(`project:repo:${f.key}`)?.title_override||f.label,
        repo:f.repo,project:null as Project|null,folder:f,updatedAt:f.sessions[0]?.updatedAt||''}));
    return [...concrete,...repositoryFolders].filter(p=>!metaById.get(`project:${p.id}`)?.archived_at);
  },[projectRows,folders,metaById]);
  const projectById=new Map(projectDirectory.map(p=>[p.id,p]));
  const pinnedItems=pinned.map(m=>{
    const id=m.item_id;
    const project=projectById.get(id);
    const chat=savedConversations.find(s=>s.id===id);
    const label=m.title_override||(m.item_type==='project'?
      project?.label||pinNames[`project:${id}`]:
      chat?conversationTitle(chat):pinNames[`conversation:${id}`]);
    return label?{m,label,chat,project}:null;
  }).filter((v):v is NonNullable<typeof v>=>Boolean(v));

  function updateLocalMeta(row:SidebarItemMeta){
    setMetadata(prev=>[...prev.filter(m=>!(m.item_type===row.item_type&&m.item_id===row.item_id)),row]);
  }
  async function patchMeta(kind:SidebarItemType,id:string,patch:Parameters<typeof saveSidebarMetadata>[4]){
    if(!userId)throw new Error('Sign in to manage work');
    const old=metaFor(kind,id);
    const optimistic:SidebarItemMeta={
      user_id:userId,item_type:kind,item_id:id,title_override:null,project_id:null,section_id:null,
      pinned_at:null,pin_order:null,archived_at:null,updated_at:new Date().toISOString(),...old,...patch
    };
    updateLocalMeta(optimistic);
    try{const saved=await saveSidebarMetadata(userId,kind,id,old,patch);updateLocalMeta(saved);return saved;}
    catch(error){setMetadata(prev=>old?[...prev.filter(m=>!(m.item_type===kind&&m.item_id===id)),old]:
      prev.filter(m=>!(m.item_type===kind&&m.item_id===id)));throw error;}
  }
  async function togglePersistentPin(kind:SidebarItemType,id:string){
    const old=metaFor(kind,id);const isPinned=old?.pinned_at!==null&&old?.pinned_at!==undefined;
    const order=(pinned.reduce((n,m)=>Math.max(n,m.pin_order||0),0))+1;
    await patchMeta(kind,id,isPinned?{pinned_at:null,pin_order:null}:
      {pinned_at:new Date().toISOString(),pin_order:order});
  }
  async function reorderPinned(t:SidebarMenuTarget,dir:-1|1){
    const ix=pinned.findIndex(m=>m.item_type===t.kind&&m.item_id===t.id);
    const other=pinned[ix+dir];const current=pinned[ix];
    if(ix<0||!other||!current)return;
    const oldOrder=current.pin_order!;
    await patchMeta(t.kind,t.id,{pin_order:other.pin_order!});
    try{await patchMeta(other.item_type,other.item_id,{pin_order:oldOrder});}
    catch(e){await patchMeta(t.kind,t.id,{pin_order:oldOrder});throw e;}
  }
  async function addMoreProjects(){
    if(projectsLoading)return;
    if(projectsMore && userId){
      setProjectsLoading(true);
      try{const page=await listSidebarProjects(userId,projectRows.length,5);
        setProjectRows(old=>[...old.filter(p=>!page.items.some(n=>n.id===p.id)),...page.items]);
        setProjectsMore(page.hasMore);
      }catch{toast.error('Projects could not load. Try again.');return;}
      finally{setProjectsLoading(false);}
    }
    setProjectCount(n=>n+5);
  }
  async function loadMoreConversations(){
    if(loadingMoreRecent||!recentsMore)return;
    setLoadingMoreRecent(true);
    try{
      const incoming=await listCloudTerminalSessions(undefined,{limit:50,offset:cloudSessions.length});
      setCloudSessions(current=>{
        const map=new Map(current.map(c=>[c.id,c]));
        for(const c of incoming)map.set(c.id,c);
        return [...map.values()];
      });
      setRecentsMore(incoming.length===50);
      setMoreRecent(n=>n+50);
    }catch{toast.error('Recent conversations could not load');}
    finally{setLoadingMoreRecent(false);}
  }
  const directLink=(kind:SidebarItemType,id:string)=>kind==='conversation'?
    `${window.location.origin}/workspace?openSession=${encodeURIComponent(id)}`:
    id.startsWith('repo:')?`${window.location.origin}/workspace?openRepo=${encodeURIComponent(id.slice(5))}`:
    `${window.location.origin}/dashboard/projects/${encodeURIComponent(id)}`;
  const openMenu=(event:React.MouseEvent<HTMLElement>,target:SidebarMenuTarget,rightClick=false)=>{
    if(rightClick)event.preventDefault();
    menuTriggerRef.current=event.currentTarget;
    const rect=event.currentTarget.getBoundingClientRect();
    setMenuPoint({x:rightClick?event.clientX:rect.right+8,y:rightClick?event.clientY:rect.top});
    setMenuTarget(target);
  };
  const closeMenu=()=>{setMenuTarget(null);setMenuPoint(null);};
  const saveRename=async(t:SidebarMenuTarget,name:string)=>{
    const trimmed=name.trim();if(!trimmed||trimmed.length>120)throw new Error('Use 1–120 characters');
    if(t.kind==='project'&&!t.id.startsWith('repo:')&&userId){
      const {error}=await createClient().from('projects').update({name:trimmed}).eq('id',t.id).eq('user_id',userId);
      if(error)throw error;
      setProjectRows(rows=>rows.map(p=>p.id===t.id?{...p,name:trimmed}:p));
    }
    await patchMeta(t.kind,t.id,{title_override:trimmed});
  };
  const move=async(t:SidebarMenuTarget,projectId:string|null,sectionId:string|null=null)=>{
    if(t.kind!=='conversation')throw new Error('Only conversations can be moved');
    await patchMeta('conversation',t.id,{project_id:projectId,section_id:sectionId});
  };
  const createProject=async(name:string)=>{const p=await api.projects.create({name:name.trim(),type:'research'});
    setProjectRows(rows=>[p,...rows]);return p;};
  const createSection=async(projectId:string,name:string)=>{
    if(!userId)throw new Error('Sign in first');
    const section=await createSidebarSection(userId,projectId,name);
    setSections(items=>[...items,section]);return section;
  };
  const archive=async(t:SidebarMenuTarget)=>{await patchMeta(t.kind,t.id,{archived_at:t.archived?null:new Date().toISOString()});};
  const remove=async(t:SidebarMenuTarget)=>{
    const message=t.kind==='project'?'Delete this Xroga project? The connected GitHub repository is NOT deleted.':
      'Permanently delete this conversation and its saved messages?';
    if(!window.confirm(message))return;
    if(t.kind==='project'){
      if(t.id.startsWith('repo:'))throw new Error('Repository-linked folders cannot be deleted here');
      await api.projects.delete(t.id);setProjectRows(rows=>rows.filter(p=>p.id!==t.id));
    }else{
      const targetSession=savedConversations.find(s=>s.id===t.id);
      if(targetSession?.cloudSynced||!targetSession?.entry)await api.terminalSessions.delete(t.id);
      removeTerminalHistoryEntry(t.id);
      setEntries(rows=>rows.filter(e=>e.id!==t.id));
      setAllHistory(rows=>rows.filter(e=>e.id!==t.id));
      setCloudSessions(rows=>rows.filter(e=>e.id!==t.id));
    }
    if(userId)await removeSidebarMetadata(userId,t.kind,t.id);
    setMetadata(rows=>rows.filter(m=>!(m.item_type===t.kind&&m.item_id===t.id)));
  };
  async function copyLink(t:SidebarMenuTarget){
    await navigator.clipboard.writeText(directLink(t.kind,t.id));toast.success('Private link copied');
  }
  const onShare=(t:SidebarMenuTarget)=>{
    closeMenu();
    toast('Use Copy private link for account-only access. Public sharing of complete work is not enabled.');
  };

  useEffect(()=>{
    if(!userId||typeof window==='undefined'||!window.location.pathname.startsWith('/workspace'))return;
    const params=new URLSearchParams(window.location.search);
    const openId=params.get('openSession');const openRepo=params.get('openRepo');
    if(openId&&handledLinkRef.current!==openId){
      handledLinkRef.current=openId;
      void loadTerminalFromAnywhere(openId).then(async entry=>{
        if(entry?.messages.length)await applyRestore(entry,entry.githubBranch||'main');
        else toast.error('Conversation not found or access denied');
        window.history.replaceState(null,'','/workspace');
      }).catch(()=>toast.error('Could not restore the shared conversation'));
    }else if(openRepo&&handledLinkRef.current!==openRepo){
      handledLinkRef.current=openRepo;
      const folder=folders.find(f=>f.key===openRepo);
      if(folder)void openRepoFolder(folder);
    }
  // The deep-link is resolved by ID from the authorized backend, not from the visible page cache.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[userId]);

  const visibleCount=Math.max(5,projectCount);
  const heading=(text:string,extra?:React.ReactNode)=><div className="xv-so-heading"><span>{text}</span>{extra}</div>;
  const row=(kind:SidebarItemType,id:string,label:string,open:()=>void,depth=0,active=false)=>{
    const pinnedNow=Boolean(metaFor(kind,id)?.pinned_at);
    const target:SidebarMenuTarget={kind,id,label,pinned:pinnedNow,archived:Boolean(metaFor(kind,id)?.archived_at),
      projectId:metaFor(kind,id)?.project_id};
    return <div key={`${kind}:${id}`} className={cn('xv-so-row group',active&&'is-active')}
      style={depth?{paddingLeft:depth*10}:undefined}
      onContextMenu={event=>openMenu(event,target,true)}>
      <button type="button" className="xv-so-open" onClick={open} aria-label={label}
        disabled={busyId===id}>
        {kind==='project'?<Folder size={14} aria-hidden="true" />:<MessageSquare size={13} aria-hidden="true" />}
        <SidebarRevealTitle text={label}/>
      </button>
      {metaLoaded?<button className="xv-so-quick" type="button"
        aria-label={pinnedNow?'Unpin':'Pin'} aria-pressed={pinnedNow}
        onClick={()=>void togglePersistentPin(kind,id).catch(()=>toast.error('Could not save pin'))}>
        {pinnedNow?<PinOff size={13}/>:<Pin size={13}/>}
      </button>:null}
      <button className="xv-so-quick" type="button" aria-label={`More options for ${label}`}
        onClick={event=>openMenu(event,target)}><Ellipsis size={15}/></button>
    </div>;
  };

  const projectChats=(id:string,repo?:string)=>{
    return savedConversations.filter(session=>{
      const m=metaFor('conversation',session.id);
      if(m?.archived_at)return false;
      if(m?.project_id)return m.project_id===id;
      return Boolean(repo&&session.githubRepoName===repo);
    });
  };
  const archivedItems=metadata.filter(m=>m.archived_at);
  if(!expanded)return null;
  return <div className="xv-so mt-2 mb-1 px-1.5">
    {heading('Projects',<button type="button" aria-label="All projects" onClick={()=>router.push('/dashboard/projects')}>
      <Plus size={14}/></button>)}
    {isGuest?<button className="xv-so-more" onClick={()=>requestAuthGate('history')}>Sign in to save projects and history</button>:
      <>
        {projectDirectory.slice(0,visibleCount).map(project=>{
          const sessions=projectChats(project.id,project.repo);
          const open=expandedProjects[project.id]===true;
          return <div key={project.id}>
            <div className="flex items-center gap-0.5">
              <button type="button" aria-label={open?'Collapse project':'Expand project'}
                className="p-1 rounded-md text-[var(--muted)]"
                onClick={()=>setExpandedProjects(prev=>({...prev,[project.id]:!open}))}>
                {open?<ChevronDown size={13}/>:<ChevronRight size={13}/>}
              </button>
              <div className="min-w-0 flex-1">
                {row('project',project.id,project.label,()=>{
                  if(project.project)router.push(`/dashboard/projects/${project.id}`);
                  else if(project.folder)void openRepoFolder(project.folder);
                },0,Boolean(project.folder&&selectedContextKey===project.folder.key))}
              </div>
            </div>
            {open?<div className="xv-so-nest">
              {sections.filter(section=>section.project_id===project.id).map(section=>
                <div key={section.id}>
                  <div className="group flex items-center justify-between px-1 py-1 text-[10px] text-[var(--muted)]">
                    <span className="min-w-0 truncate">{section.name}</span>
                    <span className="hidden group-hover:inline-flex group-focus-within:inline-flex gap-1">
                      <button type="button" aria-label={`Rename section ${section.name}`} onClick={()=>void(async()=>{
                        if(!userId)return;
                        const value=window.prompt('Rename section',section.name)?.trim();
                        if(!value||value===section.name)return;
                        try{await renameSidebarSection(userId,section.id,value);
                          setSections(items=>items.map(s=>s.id===section.id?{...s,name:value}:s));}
                        catch{toast.error('Could not rename section');}
                      })()}>Rename</button>
                      <button type="button" aria-label={`Delete section ${section.name}`} onClick={()=>void(async()=>{
                        if(!userId||!window.confirm('Delete this section? Its conversations remain in the project.'))return;
                        try{await removeSidebarSection(userId,section.id);
                          setSections(items=>items.filter(s=>s.id!==section.id));
                          setMetadata(items=>items.map(m=>m.section_id===section.id?{...m,section_id:null}:m));}
                        catch{toast.error('Could not delete section');}
                      })()}>Delete</button>
                    </span>
                  </div>
                  {sessions.filter(chat=>metaFor('conversation',chat.id)?.section_id===section.id)
                    .slice(0,fullProjects[project.id]?undefined:3)
                    .map(chat=>row('conversation',chat.id,conversationTitle(chat),()=>void openSession(chat),1,chat.id===activeSessionId))}
                </div>)}
              {sessions.filter(chat=>!metaFor('conversation',chat.id)?.section_id)
                .slice(0,fullProjects[project.id]?undefined:3)
                .map(chat=>row('conversation',chat.id,conversationTitle(chat),()=>void openSession(chat),1,chat.id===activeSessionId))}
              {sessions.length>3?<button type="button" className="xv-so-more"
                onClick={()=>setFullProjects(prev=>({...prev,[project.id]:!prev[project.id]}))}>
                {fullProjects[project.id]?'Show less':'View all chats'}</button>:null}
              {!sessions.length?<span className="block p-2 text-[10px] text-[var(--muted)]">No saved conversations</span>:null}
            </div>:null}
          </div>;
        })}
        {!projectsLoading&&!projectDirectory.length?<p className="px-2 py-2 text-[10px] text-[var(--muted)]">No projects yet</p>:null}
        {(projectsMore||projectDirectory.length>visibleCount)?
          <button className="xv-so-more" onClick={()=>void addMoreProjects()} disabled={projectsLoading}>
            {projectsLoading?'Loading projects…':'View more projects'}</button>:null}
        {projectCount>5?<button className="xv-so-more" onClick={()=>setProjectCount(5)}>Show less</button>:null}
        <button className="xv-so-more" onClick={()=>router.push('/dashboard/projects')}>All projects</button>

        {pinnedItems.length>0?<>
          {heading('Pinned')}
          {pinnedItems.slice(0,morePins).map(({m,label,chat,project})=>row(m.item_type,m.item_id,label,()=>{
            if(m.item_type==='conversation'){
              void openSession(chat||{id:m.item_id,title:label,preview:label,updatedAt:m.updated_at,
                cloudSynced:true,kind:'cloud',terminalNumber:0});
            }else if(project?.project)router.push(`/dashboard/projects/${m.item_id}`);
            else if(project?.folder)void openRepoFolder(project.folder);
            else router.push(`/dashboard/projects/${m.item_id}`);
          }))}
          {pinnedItems.length>morePins?<button className="xv-so-more" onClick={()=>setMorePins(n=>n+10)}>View more pins</button>:null}
          {morePins>10?<button className="xv-so-more" onClick={()=>setMorePins(10)}>Show less</button>:null}
        </>:null}

        {heading('Recents',archivedItems.length?<button type="button" aria-label={showArchived?'Back to recents':'Archived items'}
          onClick={()=>setShowArchived(v=>!v)}><ArchiveRestore size={14}/></button>:null)}
        {showArchived?archivedItems.map(m=>row(m.item_type,m.item_id,m.title_override||
            (m.item_type==='conversation'?
              pinNames[`conversation:${m.item_id}`]||'Archived conversation':
              pinNames[`project:${m.item_id}`]||'Archived project'),()=>{
                if(m.item_type==='conversation')void openSession({id:m.item_id,title:'',preview:'',updatedAt:m.updated_at,
                    cloudSynced:true,kind:'cloud',terminalNumber:0});
                else router.push(`/dashboard/projects/${m.item_id}`);
              })):
          savedConversations.filter(chat=>!metaFor('conversation',chat.id)?.archived_at)
            .slice(0,moreRecent).map(chat=>row('conversation',chat.id,conversationTitle(chat),
              ()=>void openSession(chat),0,chat.id===activeSessionId))}
        {!showArchived&&recentsMore&&savedConversations.length>=moreRecent?
          <button className="xv-so-more" disabled={loadingMoreRecent} onClick={()=>void loadMoreConversations()}>
            {loadingMoreRecent?'Loading…':'View more recent work'}</button>:null}
        {!showArchived&&!savedConversations.length?<p className="p-2 text-[10px] text-[var(--muted)]">Your saved conversations appear here</p>:null}
      </>}

    <SidebarOrganizerMenu target={menuTarget} point={menuPoint} trigger={menuTriggerRef}
      close={closeMenu} projects={projectRows} sections={sections}
      pin={t=>togglePersistentPin(t.kind,t.id)} rename={saveRename} move={move}
      createProject={createProject} createSection={createSection} archive={archive} remove={remove}
      copy={copyLink} openTab={t=>window.open(directLink(t.kind,t.id),'_blank','noopener,noreferrer')}
      share={onShare} reorder={reorderPinned}/>
  </div>;
}
