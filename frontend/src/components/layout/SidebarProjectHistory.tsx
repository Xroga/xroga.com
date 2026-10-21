'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Cloud, FolderOpen, GitBranch, ChevronDown, ChevronRight, Pin, PinOff, MoreHorizontal, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { SidebarActionMenu, type SidebarActionId, type SidebarMenuAction } from './SidebarActionMenu';
import { SidebarMovingTitle } from './SidebarMovingTitle';
import './SidebarOrganize.css';
import {
 meaningfulSidebarTitle,visiblePage,sortPinned,loadSidebarMeta,loadSidebarSections,
 loadSidebarProjects,loadSidebarChats,loadSidebarChatById,changeSidebarMeta,
 createSidebarSection,deleteSidebarChat,type SidebarMeta,type SidebarSection,
 type SidebarProject,type SidebarChat,type SidebarKind
} from '@/lib/sidebarOrganization';
import { api } from '@/lib/api';
import { createClient } from '@/lib/supabase/client';
import { removeTerminalHistoryEntry } from '@/lib/terminalHistory';
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
import type { CloudTerminalSessionSummary } from '@/lib/api';
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
  const [itemMeta,setItemMeta] = useState<SidebarMeta[]>([]);
  const [sections,setSections] = useState<SidebarSection[]>([]);
  const [accountProjects,setAccountProjects] = useState<SidebarProject[]>([]);
  const [sidebarChats,setSidebarChats] = useState<SidebarChat[]>([]);
  const [shownProjects,setShownProjects] = useState(5);
  const [shownPins,setShownPins] = useState(10);
  const [archivedOpen,setArchivedOpen] = useState(false);
  const [projectsHasMore,setProjectsHasMore] = useState(false);
  const [menu,setMenu] = useState<{kind:SidebarKind;id:string;x:number;y:number}|null>(null);
  const [editor,setEditor] = useState<{mode:'rename'|'new-project'|'new-section'|'move-project'|'move-section'|'delete';kind:SidebarKind;id:string;title:string;projectId?:string}|null>(null);
  const [editorText,setEditorText] = useState('');
  const [allProjectOptions,setAllProjectOptions] = useState<SidebarProject[]>([]);
  const [saving,setSaving] = useState(false);
  const [sidebarError,setSidebarError] = useState('');
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [cloudSessions, setCloudSessions] = useState<CloudTerminalSessionSummary[]>([]);
  const [selectedContextKey, setSelectedContextKey] = useState<string | null>(null);
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
  const accountId = !isGuest ? workspaceIdentity.userId ?? '' : '';
  const refreshSidebarData = useCallback(async()=>{
    if(!accountId){setItemMeta([]);setSections([]);setAccountProjects([]);setSidebarChats([]);setPinnedIds([]);return;}
    try{
      const [metadata,sectionList,firstProjects,chats]=await Promise.all([
        loadSidebarMeta(accountId),loadSidebarSections(accountId),loadSidebarProjects(accountId,0,6),loadSidebarChats(accountId,0,200)
      ]);
      setItemMeta(metadata);setSections(sectionList);
      setAccountProjects(firstProjects.slice(0,5));setProjectsHasMore(firstProjects.length>5);
      setSidebarChats(chats);setPinnedIds(sortPinned(metadata.filter(item=>item.pin_order!==null&&!item.archived_at)).map(item=>item.item_id));
      setSidebarError('');
    }catch(error){setSidebarError((error as Error).message||'Could not load your saved work');}
  },[accountId]);
  useEffect(()=>{
    void refreshSidebarData();
    const listener=()=>void refreshSidebarData();
    window.addEventListener('xroga-sidebar-chats-changed',listener);
    window.addEventListener('focus',listener);
    return()=>{window.removeEventListener('xroga-sidebar-chats-changed',listener);window.removeEventListener('focus',listener);};
  },[refreshSidebarData]);
  const metaOf=(kind:SidebarKind,id:string)=>itemMeta.find(x=>x.item_type===kind&&x.item_id===id);
  async function updateItem(kind:SidebarKind,id:string,changes:Partial<SidebarMeta>){
    if(!accountId){requestAuthGate('history');return;}
    const previous=itemMeta;
    const current=metaOf(kind,id);
    setItemMeta(prev=>{
      const rest=prev.filter(item=>!(item.item_type===kind&&item.item_id===id));
      return [...rest,{user_id:accountId,item_type:kind,item_id:id,title_override:null,pin_order:null,archived_at:null,project_id:null,section_id:null,
        ...current,...changes}];
    });
    try{await changeSidebarMeta(accountId,kind,id,changes);await refreshSidebarData();}
    catch(error){setItemMeta(previous);toast.error((error as Error).message||'Could not save changes');}
  }
  function togglePin(id:string,kind:SidebarKind='conversation'){
    const existing=metaOf(kind,id);
    const highest=Math.max(0,...itemMeta.map(item=>item.pin_order??0));
    void updateItem(kind,id,{pin_order:existing?.pin_order!=null?null:highest+1000});
  }
  async function moreProjects(){
    if(!accountId)return;
    try{
      const offset=accountProjects.length;
      const next=await loadSidebarProjects(accountId,offset,6);
      setAccountProjects(prev=>[...prev,...next.slice(0,5)]);
      setShownProjects(prev=>prev+5);setProjectsHasMore(next.length>5);
    }catch(e){toast.error((e as Error).message);}
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
          title: meaningfulSidebarTitle(hist?.title,hist?.prompt||prompt),
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
                  title: meaningfulSidebarTitle(e.title,live.prompt),
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
          title: meaningfulSidebarTitle(session.title,session.preview),
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
        title: meaningfulSidebarTitle(s.title,s.preview),
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
        title: meaningfulSidebarTitle(e.title,e.prompt),
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
          next[f.key] = f.key === selectedContextKey;
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
      selectedLabel: meaningfulSidebarTitle(entry.title,entry.prompt),
      source: 'projects',
      jumpMessageId: entry.messages[entry.messages.length - 1]?.id,
      githubRepoName: entry.githubRepoName,
    });
    router.push('/workspace');
    toast.success('Conversation restored');
  }

  async function openSession(session: RepoSession) {
    if (busyId) return;
    setBusyId(session.id);
    try {
      const branch = session.githubBranch || 'main';
      const repo = session.githubRepoName;
      if (!repo?.includes('/')) {
        if (session.entry?.messages?.length) await applyRestore(session.entry, 'main');
        else if(accountId){
          const restored=await loadSidebarChatById(accountId,session.id);
          if(restored?.messages?.length) await applyRestore(restored,'main');
          else toast.error('This conversation cannot be restored; no saved messages were found');
        }else toast.error('Sign in to recover saved conversations');
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

      // A session stub may exist while its history body is unavailable —
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
        id: e.id, title: meaningfulSidebarTitle(e.title,e.prompt), preview: e.prompt || e.preview, updatedAt: e.updatedAt,
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
        map.set(c.id, { id: c.id, title: meaningfulSidebarTitle(c.title,c.preview), preview: c.preview, updatedAt: c.updatedAt,
          githubRepoName: c.githubRepoName, githubBranch: c.githubBranch || 'main',
          projectRoot: '/', cloudSynced: true, kind: 'cloud', terminalNumber: c.terminalNumber,
          status: c.status as TerminalHistoryStatus });
      }
    }
    for(const chat of sidebarChats){
      if(chat.message_count<=0)continue;
      const previous=map.get(chat.id);
      if(!previous||Date.parse(chat.updated_at)>Date.parse(previous.updatedAt)){
        map.set(chat.id,{id:chat.id,title:meaningfulSidebarTitle(chat.title,chat.prompt),preview:chat.prompt||chat.preview,
          updatedAt:chat.updated_at,status:chat.status as TerminalHistoryStatus,cloudSynced:true,kind:'cloud',terminalNumber:0});
      }
    }
    return Array.from(map.values()).sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  }, [allHistory, entries, cloudSessions, sidebarChats]);

  const organizedProjects = useMemo(()=>{
    const actual=accountProjects.map(p=>({id:p.id,label:p.name,repo:p.github_repo_name||null,actual:p}));
    const known=new Set(actual.map(p=>p.repo).filter(Boolean));
    const old=folders.filter(folder=>!known.has(folder.repo)).map(folder=>({
      id:'repo:'+folder.key,label:folder.label,repo:folder.repo,actual:null as SidebarProject|null,
    }));
    return [...actual,...old];
  },[accountProjects,folders]);
  const projectById=(id:string)=>organizedProjects.find(p=>p.id===id);
  const activeItems=savedConversations.filter(s=>!metaOf('conversation',s.id)?.archived_at);
  const pinnedItems=sortPinned(itemMeta.filter(m=>m.pin_order!==null&&!m.archived_at))
    .filter(m=>m.item_type==='conversation'?activeItems.some(s=>s.id===m.item_id):
      Boolean(projectById(m.item_id)));
  const recentConversations=activeItems;
  function conversationTitle(session:RepoSession){
    return metaOf('conversation',session.id)?.title_override ||
      meaningfulSidebarTitle(session.title,session.entry?.prompt||session.preview);
  }
  function projectTitle(id:string,original:string){
    return metaOf('project',id)?.title_override||original;
  }
  const openMenu=(event:React.MouseEvent,kind:SidebarKind,id:string)=>{
    event.preventDefault();event.stopPropagation();
    setMenu({kind,id,x:event.clientX,y:event.clientY});
  };
  function contextLink(kind:SidebarKind,id:string){
    if(kind==='project') return projectById(id)?.actual
      ? `${window.location.origin}/dashboard/projects/${encodeURIComponent(id)}`
      : `${window.location.origin}/dashboard/projects`;
    return `${window.location.origin}/workspace?conversation=${encodeURIComponent(id)}`;
  }
  function openProject(id:string){
    const p=projectById(id);
    if(p?.actual){router.push(`/dashboard/projects/${encodeURIComponent(p.actual.id)}`);return;}
    const f=folders.find(folder=>'repo:'+folder.key===id);
    if(f)void openRepoFolder(f);
  }
  function renderRow(kind:SidebarKind,id:string,label:string,open:()=>void,pinned:boolean,leading?:React.ReactNode){
    const saved=metaOf(kind,id)?.pin_order!=null;
    return <div key={kind+':'+id} className="xv-sidebar-work-row group flex items-center gap-1 min-w-0 rounded-md hover:bg-[var(--foreground)]/[0.05]"
      onContextMenu={event=>openMenu(event,kind,id)} draggable={pinned}
      onDragStart={event=>event.dataTransfer.setData('text/plain',kind+':'+id)}
      onDragOver={event=>{if(pinned)event.preventDefault();}}
      onDrop={event=>{
        event.preventDefault();const source=event.dataTransfer.getData('text/plain');
        const target=kind+':'+id;
        if(!pinned||!source||source===target)return;
        const src=pinnedItems.find(m=>m.item_type+':'+m.item_id===source);
        const dst=pinnedItems.find(m=>m.item_type+':'+m.item_id===target);
        if(src&&dst)void Promise.all([
          updateItem(src.item_type,src.item_id,{pin_order:dst.pin_order}),
          updateItem(dst.item_type,dst.item_id,{pin_order:src.pin_order})
        ]).then(()=>refreshSidebarData());
      }}>
      <button type="button" onClick={open} className="min-w-0 flex-1 flex items-center gap-1.5 text-left py-1.5 px-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        title={undefined} aria-label={label}>
        {leading}
        <SidebarMovingTitle text={label}/>
      </button>
      <div className="xv-sidebar-work-actions shrink-0 flex items-center gap-0.5">
        <button type="button" className="p-1 rounded-md hover:bg-[var(--foreground)]/10 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          aria-label={saved?'Unpin '+label:'Pin '+label} aria-pressed={saved}
          onClick={()=>togglePin(id,kind)}><Pin size={12} fill={saved?'currentColor':'none'} aria-hidden="true"/></button>
        <button type="button" className="p-1 rounded-md hover:bg-[var(--foreground)]/10 focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          aria-label={'More options for '+label} aria-haspopup="menu" aria-expanded={menu?.id===id&&menu.kind===kind}
          onClick={event=>{const box=event.currentTarget.getBoundingClientRect();setMenu({kind,id,x:box.right+8,y:box.top});}}>
          <MoreHorizontal size={13} aria-hidden="true"/>
        </button>
      </div>
    </div>;
  }
  async function handleMenuAction(id:SidebarActionId){
    const selected=menu;setMenu(null);if(!selected)return;
    const {kind,id:itemId}=selected;
    const current=metaOf(kind,itemId);
    const title=kind==='project' ? projectTitle(itemId,projectById(itemId)?.label||'Project') :
      conversationTitle(savedConversations.find(s=>s.id===itemId) || {id:itemId,title:'Untitled conversation',preview:'',updatedAt:'',cloudSynced:false,kind:'local',terminalNumber:0});
    if(id==='pin'){togglePin(itemId,kind);return;}
    if(id==='copy'||id==='share'){
      const link=contextLink(kind,itemId);
      if(id==='share'&&navigator.share){
        try{await navigator.share({title,url:link});}catch{/* cancelled */}return;
      }
      try{await navigator.clipboard.writeText(link);
        toast.success(id==='share'?'Private link copied; sign-in access is still required':'Link copied');}
      catch{toast.error('Copy failed');}
      return;
    }
    if(id==='open'){window.open(contextLink(kind,itemId),'_blank','noopener,noreferrer');return;}
    if(id==='archive'){
      void updateItem(kind,itemId,{archived_at:new Date().toISOString()});return;
    }
    if(id==='pin-up'||id==='pin-down'){
      const idx=pinnedItems.findIndex(m=>m.item_type===kind&&m.item_id===itemId);
      const neighbor=pinnedItems[idx+(id==='pin-up'?-1:1)];
      if(idx<0||!neighbor)return;
      const before=pinnedItems[idx];
      await updateItem(kind,itemId,{pin_order:neighbor.pin_order});
      await updateItem(neighbor.item_type,neighbor.item_id,{pin_order:before.pin_order});
      return;
    }
    const mode=id==='move-project'?'move-project':id==='move-section'?'move-section':
      id==='rename'?'rename':id==='delete'?'delete':'rename';
    setEditor({mode,kind,id:itemId,title,projectId:current?.project_id||undefined});
    setEditorText(mode==='rename'?title:'');
    if(mode==='move-project'&&accountId){
      try{const projects=await loadSidebarProjects(accountId,0,100);setAllProjectOptions(projects);}
      catch(e){toast.error((e as Error).message);}
    }
  }
  const menuActions:SidebarMenuAction[]=menu?[
    {id:'share',label:'Share private link'},{id:'copy',label:'Copy link'},
    {id:'open',label:'Open in new tab'},{id:'rename',label:'Rename'},
    {id:'pin',label:metaOf(menu.kind,menu.id)?.pin_order!=null?'Unpin':'Pin'},
    ...(menu.kind==='conversation'?[
      {id:'move-project' as const,label:'Move to project'},
      {id:'move-section' as const,label:'Move to section'},
    ]:[]),
    ...(metaOf(menu.kind,menu.id)?.pin_order!=null?[
      {id:'pin-up' as const,label:'Move pin up'},
      {id:'pin-down' as const,label:'Move pin down'},
    ]:[]),
    {id:'archive',label:'Archive'},
    {id:'delete',label:'Delete',danger:true,disabled:menu.kind==='project'&&menu.id.startsWith('repo:')}
  ]:[];

  useEffect(()=>{
    if(typeof window==='undefined'||!savedConversations.length)return;
    if(window.location.pathname!=='/workspace')return;
    const id=new URLSearchParams(window.location.search).get('conversation');
    if(!id||id===activeSessionId)return;
    const match=savedConversations.find(s=>s.id===id);
    if(!match)return;
    window.history.replaceState(window.history.state,'','/workspace');
    void openSession(match);
    // The session target is a deep link, not a new chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[savedConversations,activeSessionId]);

  async function saveEditor(){
    if(!editor||!accountId||saving)return;
    setSaving(true);
    try{
      if(editor.mode==='rename'){
        const value=editorText.trim();
        if(!value||value.length>120)throw new Error('Enter a title under 120 characters');
        if(editor.kind==='project'&&!editor.id.startsWith('repo:')){
          const {error}=await createClient().from('projects').update({name:value}).eq('user_id',accountId).eq('id',editor.id);
          if(error)throw error;
        }else await changeSidebarMeta(accountId,editor.kind,editor.id,{title_override:value});
      }else if(editor.mode==='new-project'){
        const value=editorText.trim();if(!value)throw new Error('Enter a project name');
        const p=await api.projects.create({name:value,type:'app'});
        if(editor.kind==='conversation')await changeSidebarMeta(accountId,'conversation',editor.id,{project_id:p.id,section_id:null});
      }else if(editor.mode==='new-section'){
        const value=editorText.trim();if(!value||!editor.projectId)throw new Error('Select a project and section name');
        const sec=await createSidebarSection(accountId,editor.projectId,value);
        if(editor.kind==='conversation')await changeSidebarMeta(accountId,'conversation',editor.id,{project_id:editor.projectId,section_id:sec.id});
      }else if(editor.mode==='delete'){
        if(editor.kind==='project')await api.projects.delete(editor.id);
        else{
          const conv=savedConversations.find(s=>s.id===editor.id);
          if(conv?.githubRepoName?.includes('/')&&conv.cloudSynced)await api.terminalSessions.delete(editor.id);
          if(!conv?.githubRepoName)await deleteSidebarChat(accountId,editor.id);
          removeTerminalHistoryEntry(editor.id);
        }
      }
      setEditor(null);setEditorText('');await refreshSidebarData();refreshLocal();refreshCloud();
      toast.success('Saved');
    }catch(e){toast.error((e as Error).message||'Could not save');}
    finally{setSaving(false);}
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
        isGuest ? (
          <button
            type="button"
            onClick={() => requestAuthGate('history')}
            className="w-full rounded-lg px-2 py-2 text-left text-[10px] leading-relaxed text-[var(--muted)] transition hover:bg-[var(--foreground)]/5 hover:text-[var(--foreground)]"
          >
            This guest chat is temporary. Create a free account to save terminals and repository history →
          </button>
        ) : (
          <p className="px-2 py-2 text-[10px] text-[var(--muted)] leading-relaxed">
            Click New Terminal, select a GitHub repo, then chat — #1 terminal appears here and is saved to your account.
          </p>
        )
      ) : (
        <div className="xv-repos-scroll space-y-0.5 pr-1">
          {folders.map((folder) => {
            const isOpen = openFolders[folder.key] !== false;
            // A repository under the filter is a fork point, not a folder: the glyph
            // assembles from the child commit up to its two parents. The open state
            // keeps a folder, because that one is saying "expanded", not "repository".
            const FolderIcon = isOpen ? FolderOpen : null;
            const isActiveRepo = selectedContextKey === folder.key;
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
                    {FolderIcon ? (
                      <FolderIcon className="h-3 w-3 shrink-0" />
                    ) : (
                      <AnimatedIcon icon={GitForkIcon} size={12} intro={false} className="shrink-0" />
                    )}
                    <span className="truncate font-medium" title={`${folder.repo} · ${folder.branch}`}>
                      {folder.label}
                    </span>
                    <span className="max-w-16 truncate font-mono text-[8px] opacity-60">{folder.branch}</span>
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
      {!isGuest ? (
        <>
          <section className="mt-3" aria-label="Pinned conversations">
            <h2 className="px-1.5 pb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">Pinned</h2>
            {pinnedConversations.length
              ? pinnedConversations.map(s => renderConversationRow(s, true))
              : <p className="px-2 py-1 text-[10px] text-[var(--muted)]">Pin chats from Recents for quick access.</p>}
          </section>
          <section className="mt-3" aria-label="Recent conversations">
            <h2 className="px-1.5 pb-1 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]">Recents</h2>
            {recentConversations.length
              ? recentConversations.map(s => renderConversationRow(s, false))
              : <p className="px-2 py-1 text-[10px] text-[var(--muted)]">Your conversations will appear here.</p>}
          </section>
        </>
      ) : null}
    </div>
  );
}
