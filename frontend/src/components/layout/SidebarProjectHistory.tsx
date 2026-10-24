'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import { activateSidebarProject, clearActiveSidebarProject, getActiveSidebarProject, SIDEBAR_PROJECT_ACTIVE_EVENT } from '@/lib/sidebarProjectTask';
import { clearSelectedRepoContext, consumeFreshTerminalIntent } from '@/lib/repoContext';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { useThemeStore } from '@/store/useThemeStore';
import { Cloud, FolderOpen, GitBranch, ChevronDown, ChevronRight, Pin, PinOff, MoreHorizontal, Plus, ArrowUp, ArrowDown } from 'lucide-react';
import { SidebarActionMenu, type SidebarActionId, type SidebarMenuAction } from './SidebarActionMenu';
import { SidebarMovingTitle } from './SidebarMovingTitle';
import './SidebarOrganize.css';
import {
 meaningfulSidebarTitle,visiblePage,sortPinned,loadSidebarMeta,loadSidebarSections,
 loadSidebarProjects,loadSidebarChats,loadSidebarChatById,changeSidebarMeta,
 loadPinnedSidebarRecords,swapSidebarPins,
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
  loadCloudTerminalSession,
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
  const pathname = usePathname();
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
  const [moreCloudSessions,setMoreCloudSessions]=useState(false);
  const [moreSidebarChats,setMoreSidebarChats]=useState(false);
  const [pinnedProjectRecords,setPinnedProjectRecords]=useState<SidebarProject[]>([]);
  const [pinnedSessionRecords,setPinnedSessionRecords]=useState<RepoSession[]>([]);
  const [shownProjects,setShownProjects] = useState(5);
  const [shownPins,setShownPins] = useState(10);
  const [shownRecents,setShownRecents] = useState(12);
  const [allProjectChats,setAllProjectChats] = useState<Record<string,boolean>>({});
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
  const [activeSidebarProjectId, setActiveSidebarProjectId] = useState<string | null>(null);

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
  useEffect(()=>{
    const sync=()=>setActiveSidebarProjectId(getActiveSidebarProject(accountId)?.projectId||null);
    sync();
    window.addEventListener(SIDEBAR_PROJECT_ACTIVE_EVENT,sync);
    return()=>window.removeEventListener(SIDEBAR_PROJECT_ACTIVE_EVENT,sync);
  },[accountId]);
  const lastSidebarFetchRef = useRef(0);
  const refreshTimerRef = useRef<number | null>(null);
  const activeAccountRef=useRef(accountId);
  activeAccountRef.current=accountId;
  useEffect(()=>{
    // Never leave another signed-in user's projects or pin labels in memory
    // while a new account's requests are still pending.
    setAccountProjects([]);setItemMeta([]);setSections([]);setSidebarChats([]);
    setEntries([]);setAllHistory([]);setCloudSessions([]);
    setOpenFolders({});setActiveSessionId(null);
    setPinnedProjectRecords([]);setPinnedSessionRecords([]);setPinnedIds([]);
    setShownProjects(5);setShownPins(10);setShownRecents(12);setProjectsHasMore(false);
  },[accountId]);
  const refreshSidebarData = useCallback(async()=>{
    if(!accountId){setItemMeta([]);setSections([]);setAccountProjects([]);setSidebarChats([]);setPinnedIds([]);return;}
    try{
      const [metadata,sectionList,firstProjects,chats]=await Promise.all([
        loadSidebarMeta(accountId),loadSidebarSections(accountId),loadSidebarProjects(accountId,0,6),loadSidebarChats(accountId,0,200)
      ]);
      if(activeAccountRef.current!==accountId)return;
      setItemMeta(metadata);setSections(sectionList);
      setAccountProjects(prev=>prev.length>5?prev:firstProjects.slice(0,5));setProjectsHasMore(prev=>accountProjects.length>5?prev:firstProjects.length>5);
      setSidebarChats(chats);setMoreSidebarChats(chats.length>=200);setPinnedIds(sortPinned(metadata.filter(item=>item.pin_order!==null&&!item.archived_at)).map(item=>item.item_id));
      const hydrated=await loadPinnedSidebarRecords(accountId,metadata);
      if(activeAccountRef.current!==accountId)return;
      setPinnedProjectRecords(hydrated.projects);
      setPinnedSessionRecords(hydrated.sessions.filter(x=>x.messageCount>0).map(x=>({
        id:x.id,title:meaningfulSidebarTitle(x.title,x.preview),preview:x.preview,updatedAt:x.updatedAt,
        githubRepoName:x.githubRepoName,githubBranch:x.githubBranch,terminalNumber:x.terminalNumber,
        status:x.status as TerminalHistoryStatus,cloudSynced:true,kind:'cloud' as const,
      })));
      setSidebarError('');
      lastSidebarFetchRef.current=Date.now();
    }catch(error){if(activeAccountRef.current===accountId)setSidebarError((error as Error).message||'Could not load your saved work');}
  },[accountId]);
  useEffect(()=>{
    void refreshSidebarData();
    // A stream of chat saves should cause one data refresh, not a fetch storm.
    const queue=()=>{
      if(refreshTimerRef.current)window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current=window.setTimeout(()=>{
        refreshTimerRef.current=null;
        if(!document.hidden)void refreshSidebarData();
      },1200);
    };
    const onFocus=()=>{
      if(Date.now()-lastSidebarFetchRef.current>30000)queue();
    };
    window.addEventListener('xroga-sidebar-chats-changed',queue);
    window.addEventListener('focus',onFocus);
    return()=>{
      window.removeEventListener('xroga-sidebar-chats-changed',queue);
      window.removeEventListener('focus',onFocus);
      if(refreshTimerRef.current)window.clearTimeout(refreshTimerRef.current);
    };
  },[refreshSidebarData]);
  const metaIndex=useMemo(()=>new Map(itemMeta.map(item=>[item.item_type+':'+item.item_id,item])),[itemMeta]);
  const metaOf=(kind:SidebarKind,id:string)=>metaIndex.get(kind+':'+id);
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
  // Refs keep the refresh event subscriptions stable while reading verified
  // account-scoped histories from the latest completed cloud queries.
  const verifiedCloudRef=useRef(cloudSessions);
  const verifiedSidebarChatsRef=useRef(sidebarChats);
  const verifiedPinnedRef=useRef(pinnedSessionRecords);
  verifiedCloudRef.current=cloudSessions;
  verifiedSidebarChatsRef.current=sidebarChats;
  verifiedPinnedRef.current=pinnedSessionRecords;
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
    // Read and sanitize local chat history once per refresh, not once per item.
    const localHistory=loadTerminalHistory();
    const historyById=new Map(localHistory.map(e=>[e.id,e]));
    const verifiedIdsForHistory=new Set([...verifiedCloudRef.current.map(c=>c.id),...verifiedSidebarChatsRef.current.map(c=>c.id),...verifiedPinnedRef.current.map(c=>c.id)]);
    setAllHistory(localHistory.filter(e=>e.id&&e.messageCount>0&&verifiedIdsForHistory.has(e.id)));
    const synced = syncRepoTerminalSessions();
    // The legacy local history store has no owner ID. It must not be trusted
    // as a history source after account switches; only authenticated cloud IDs
    // are eligible to appear in the account sidebar.
    const verifiedIds=new Set([...verifiedCloudRef.current.map(c=>c.id),...verifiedSidebarChatsRef.current.map(c=>c.id),...verifiedPinnedRef.current.map(c=>c.id)]);
    let nextEntries =
      (synced.length
        ? synced
        : localHistory.filter((e) => e.messageCount > 0 && e.githubRepoName?.includes('/')))
      .filter(e=>verifiedIds.has(e.id));

    // Live chat appears under its sticky repo (or selected if still unbound).
    // Never rewrite an existing #N onto a newly selected repo.
    if (messagesRef.current.length > 0 && sessionIdRef.current) {
      const hist = historyById.get(sessionIdRef.current);
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
      const hist = historyById.get(idx.sessionId);
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
      const list = await listCloudTerminalSessions(undefined,{limit:100,offset:0});
      setMoreCloudSessions(list.length>=100);
      setCloudSessions(list);
      // Never automatically import unscoped local cache entries into whichever
      // account happens to sign in: legacy localStorage has no owner provenance.
      const verifiedIds=new Set(list.map(s=>s.id));
      const local = loadTerminalHistory().filter(
        (e) => e.messageCount > 0 && e.githubRepoName?.includes('/') && e.messages?.length && verifiedIds.has(e.id)
      );
      if (!local.length) return;
      // `migrateLocalSessionsToCloud` runs at most once per page load and reports
      // whether it actually uploaded anything. Re-listing unconditionally — as this
      // did before — meant every refresh cost two list calls even when there was
      // nothing to migrate, and each upload's change event started the cycle again.
      const uploaded = await migrateLocalSessionsToCloud(local, list);
      if (uploaded) setCloudSessions(await listCloudTerminalSessions(undefined,{limit:100,offset:0}));
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
    }, 360);
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
        title: meaningfulSidebarTitle(s.title,null),
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
      if(!cloudSessions.some(c=>c.id===e.id))continue;
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
    } else {
      // A repository-free conversation must not inherit the last GitHub workspace.
      clearSelectedRepoContext();
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
      // Restore membership alongside the actual saved conversation, not the previous task.
      const explicitProjectId=metaOf('conversation',session.id)?.project_id;
      const inferredProject=accountProjects.find(p=>p.github_repo_name&&p.github_repo_name===session.githubRepoName);
      const restoredProject=explicitProjectId||inferredProject?.id;
      if(accountId&&restoredProject)activateSidebarProject(accountId,restoredProject);
      else clearActiveSidebarProject();
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

      // Never claim to restore a missing transcript by navigating to an empty chat.
      toast.error('Saved messages are unavailable for this conversation');
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
    const verifiedIds=new Set([...verifiedCloudRef.current.map(c=>c.id),...verifiedSidebarChatsRef.current.map(c=>c.id),...verifiedPinnedRef.current.map(c=>c.id)]);
    for (const e of [...allHistory, ...entries]) {
      if (!e.id || e.messageCount <= 0 || !verifiedIds.has(e.id)) continue;
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
        map.set(c.id, { id: c.id, title: meaningfulSidebarTitle(c.title,null), preview: c.preview, updatedAt: c.updatedAt,
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
    for(const x of pinnedSessionRecords){
      const prev=map.get(x.id);
      if(!prev||Date.parse(x.updatedAt)>Date.parse(prev.updatedAt))map.set(x.id,x);
    }
    return Array.from(map.values()).sort((a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0));
  }, [allHistory, entries, cloudSessions, sidebarChats, pinnedSessionRecords]);

  useEffect(()=>{
    if(!accountId||!savedConversations.length)return;
    const oldKey='xroga_sidebar_pins_v1:'+accountId;
    const migratedKey='xroga_sidebar_pins_migrated_v1:'+accountId;
    if(localStorage.getItem(migratedKey)==='yes')return;
    let old:string[]=[];
    try{const value=JSON.parse(localStorage.getItem(oldKey)||'[]');
      old=Array.isArray(value)?value.filter((id):id is string=>typeof id==='string'):[];}catch{old=[];}
    if(!old.length){localStorage.setItem(migratedKey,'yes');return;}
    let cancelled=false;
    void (async()=>{
      try{
        // Read older legacy pins directly by account-owned session IDs, even when
        // those sessions are beyond the first Recents page on this device.
        const legacy=old.filter(id=>!itemMeta.some(item=>item.item_type==='conversation'&&item.item_id===id));
        const verified=await loadPinnedSidebarRecords(accountId,legacy.map((id,index)=>({
          user_id:accountId,item_type:'conversation' as const,item_id:id,
          title_override:null,pin_order:index+1,archived_at:null,project_id:null,section_id:null,
        })));
        const ids=new Set(verified.sessions.map(item=>item.id));
        const candidates=legacy.filter(id=>ids.has(id));
        const highest=Math.max(0,...itemMeta.map(item=>item.pin_order??0));
        for(let i=0;i<candidates.length;i++){
          if(cancelled||activeAccountRef.current!==accountId)return;
          await changeSidebarMeta(accountId,'conversation',candidates[i],{pin_order:highest+(i+1)*1000});
        }
        if(!cancelled&&activeAccountRef.current===accountId){
          localStorage.setItem(migratedKey,'yes');await refreshSidebarData();
        }
      }catch(e){console.warn('[sidebar] Legacy pin migration can be retried:',e);}
    })();
    return()=>{cancelled=true;};
  },[accountId,savedConversations,itemMeta,refreshSidebarData]);

  async function loadMoreRecents(){
    if(!accountId)return;
    try{
      const [oldCloud,oldChats]=await Promise.all([
        moreCloudSessions?listCloudTerminalSessions(undefined,{limit:100,offset:cloudSessions.length}):Promise.resolve([]),
        moreSidebarChats?loadSidebarChats(accountId,sidebarChats.length,200):Promise.resolve([])
      ]);
      setMoreCloudSessions(oldCloud.length>=100);
      setMoreSidebarChats(oldChats.length>=200);
      if(oldCloud.length)setCloudSessions(prev=>{
        const byId=new Map([...prev,...oldCloud].map(x=>[x.id,x]));
        return [...byId.values()];
      });
      if(oldChats.length)setSidebarChats(prev=>{
        const byId=new Map([...prev,...oldChats].map(x=>[x.id,x]));
        return [...byId.values()];
      });
    }catch(e){toast.error((e as Error).message||'Could not load older history');}
  }
  const organizedProjects = useMemo(()=>{
    const actual=accountProjects.map(p=>({id:p.id,label:p.name,repo:p.github_repo_name||null,actual:p}));
    const known=new Set(actual.map(p=>p.repo).filter(Boolean));
    const old=folders.filter(folder=>!known.has(folder.repo)).map(folder=>({
      id:'repo:'+folder.key,label:folder.label,repo:folder.repo,actual:null as SidebarProject|null,
    }));
    // Show only the requested first five projects; legacy repositories are fallbacks
    // only when the account does not yet have canonical project records.
    return actual.length ? [...actual,...old.filter(folder=>accountProjects.length<5).slice(0,Math.max(0,5-accountProjects.length))] : old;
  },[accountProjects,folders]);
  const projectById=(id:string)=>organizedProjects.find(p=>p.id===id)
    ||(pinnedProjectRecords.find(p=>p.id===id)?(()=>{
       const p=pinnedProjectRecords.find(p=>p.id===id)!;
       return {id:p.id,label:p.name,repo:p.github_repo_name||null,actual:p};
      })():undefined);
  const activeItems=savedConversations.filter(s=>!metaOf('conversation',s.id)?.archived_at);
  const pinnedItems=sortPinned(itemMeta.filter(m=>m.pin_order!==null&&!m.archived_at))
    .filter(m=>m.item_type==='conversation'?activeItems.some(s=>s.id===m.item_id):
      Boolean(projectById(m.item_id)));
  const recentConversations=activeItems;
  const standaloneRecents=recentConversations.filter(session=>{
    const projectId=metaOf('conversation',session.id)?.project_id;
    if(projectId)return !accountProjects.some(project=>project.id===projectId)
      && !pinnedProjectRecords.some(project=>project.id===projectId)
      && !organizedProjects.some(project=>project.id===projectId);
    return !organizedProjects.some(project=>Boolean(project.repo&&project.repo===session.githubRepoName))
      && !accountProjects.some(project=>Boolean(project.github_repo_name&&project.github_repo_name===session.githubRepoName));
  });
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
      ? `${window.location.origin}/workspace?project=${encodeURIComponent(id)}`
      : `${window.location.origin}/dashboard/projects`;
    return `${window.location.origin}/workspace?conversation=${encodeURIComponent(id)}`;
  }

  /** Creating a task starts a new real conversation; the project itself remains reusable. */
  function beginProjectTask(p:{id:string;label:string;repo:string|null}){
    if(!accountId){requestAuthGate('history');return;}
    startNewChat(); // flush the prior conversation BEFORE switching its project/repository.
    if(p.repo?.includes('/')){
      const selected=getSelectedRepoContext();
      saveSelectedRepoContext({repo:p.repo,branch:selected?.repo===p.repo?selected.branch:'main',projectRoot:'/'});
      notifyGithubRepoContext(p.repo,selected?.repo===p.repo?selected.branch:'main');
    }else clearSelectedRepoContext();
    // Legacy repo-only folders are not canonical project IDs. Keep them navigable
    // without persisting a synthetic "repo:" key into the UUID project relation.
    if(!p.id.startsWith('repo:')) activateSidebarProject(accountId,p.id);
    // An explicit project task supersedes a leftover generic New Product intent.
    consumeFreshTerminalIntent();
    setOpenFolders(prev=>({...prev,[p.id]:true}));
    useProjectWorkspaceStore.getState().setWorkspaceOpen(false);
    // Always reveal the existing composer and starter view for a new project task.
    useThemeStore.getState().setChatbarHidden(false);
    router.push('/workspace');
    window.dispatchEvent(new CustomEvent('xroga-resume-workspace'));
  }
  function openProject(id:string){
    const p=projectById(id);
    if(!p){toast.error('This project is not available');return;}
    setOpenFolders(prev=>({...prev,[p.id]:true}));
    // Clicking the project title resumes its workspace. Only the adjacent +
    // explicitly starts another task; never discard an active draft on a title click.
    if(activeSidebarProjectId===p.id){router.push('/workspace');return;}
    const latest=getProjectChats(p)[0];
    if(latest){void openSession(latest);return;}
    beginProjectTask(p);
  }
  useEffect(()=>{
    if(!accountId||pathname!=='/workspace')return;
    const target=new URLSearchParams(window.location.search).get('project');
    if(!target)return;
    let cancelled=false;
    void (async()=>{
      try{
        // Validate ownership before turning an external URL into project state.
        const actual=await api.projects.get(target);
        if(cancelled)return;
        window.history.replaceState(window.history.state,'','/workspace');
        beginProjectTask({id:actual.id,label:actual.name,repo:actual.github_repo_name||null});
      }catch(e){
        if(cancelled)return;
        window.history.replaceState(window.history.state,'','/workspace');
        toast.error('Project is not available to your account');
      }
    })();
    return()=>{cancelled=true;};
    // The route/query is consumed once; do not re-create a task on a sidebar data refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[accountId,pathname]);
  function renderRow(kind:SidebarKind,id:string,label:string,open:()=>void,pinned:boolean){
    const saved=metaOf(kind,id)?.pin_order!=null;
    return <div key={kind+':'+id} className={cn('xv-sidebar-work-row group flex items-center gap-1 min-w-0 rounded-md hover:bg-[var(--foreground)]/[0.05]',
        (kind==='project'&&activeSidebarProjectId===id)||(kind==='conversation'&&activeSessionId===id)
          ? 'bg-[var(--foreground)]/[0.13] text-[var(--foreground)]' : '')}
      onContextMenu={event=>openMenu(event,kind,id)} draggable={pinned}
      onDragStart={event=>event.dataTransfer.setData('text/plain',kind+':'+id)}
      onDragOver={event=>{if(pinned)event.preventDefault();}}
      onDrop={event=>{
        event.preventDefault();const source=event.dataTransfer.getData('text/plain');
        const target=kind+':'+id;
        if(!pinned||!source||source===target)return;
        const src=pinnedItems.find(m=>m.item_type+':'+m.item_id===source);
        const dst=pinnedItems.find(m=>m.item_type+':'+m.item_id===target);
        if(src&&dst&&accountId)void swapSidebarPins(accountId,src,dst)
          .then(refreshSidebarData).catch(e=>toast.error((e as Error).message));
      }}>
      <button type="button" onClick={open} className="min-w-0 flex-1 flex items-center text-[10px] font-normal leading-[1.35] text-left py-1 px-1.5 rounded-md focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        aria-label={label}>
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
      await swapSidebarPins(accountId,pinnedItems[idx],neighbor);
      await refreshSidebarData();
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
    if(typeof window==='undefined'||window.location.pathname!=='/workspace'||!accountId)return;
    const id=new URLSearchParams(window.location.search).get('conversation');
    if(!id||id===activeSessionId)return;
    window.history.replaceState(window.history.state,'','/workspace');
    const match=savedConversations.find(s=>s.id===id);
    if(match){void openSession(match);return;}
    void (async()=>{
      const restored=await loadSidebarChatById(accountId,id).catch(()=>null)
        ||await loadCloudTerminalSession(id).catch(()=>null);
      if(restored?.messages?.length)await applyRestore(restored,'main');
      else toast.error('That conversation is not available to this account');
    })();
    // Deep-link query is consumed once and never starts a blank chat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[accountId,savedConversations,activeSessionId]);

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
        else beginProjectTask({id:p.id,label:p.name,repo:p.github_repo_name||null});
      }else if(editor.mode==='new-section'){
        const value=editorText.trim();if(!value||!editor.projectId)throw new Error('Select a project and section name');
        const sec=await createSidebarSection(accountId,editor.projectId,value);
        if(editor.kind==='conversation')await changeSidebarMeta(accountId,'conversation',editor.id,{project_id:editor.projectId,section_id:sec.id});
      }else if(editor.mode==='delete'){
        if(editor.kind==='project')await api.projects.delete(editor.id);
        else{
          const conv=savedConversations.find(s=>s.id===editor.id);
          if(conv?.githubRepoName?.includes('/'))await api.terminalSessions.delete(editor.id);
          if(!conv?.githubRepoName)await deleteSidebarChat(accountId,editor.id);
          removeTerminalHistoryEntry(editor.id);
        }
        await createClient().from('xroga_sidebar_items').delete().eq('user_id',accountId)
          .eq('item_type',editor.kind).eq('item_id',editor.id);
      }
      setEditor(null);setEditorText('');await refreshSidebarData();refreshLocal();refreshCloud();
      toast.success('Saved');
    }catch(e){toast.error((e as Error).message||'Could not save');}
    finally{setSaving(false);}
  }

  if (!expanded) return null;
  const sectionTitle = 'px-2 pb-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--muted)]';
  const secondary = 'text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)]';
  const getProjectChats = (p:(typeof organizedProjects)[number]) =>
    recentConversations.filter(session => {
      const data=metaOf('conversation',session.id);
      if(data?.project_id)return data.project_id===p.id;
      return Boolean(p.repo&&session.githubRepoName===p.repo);
    });
  const openedMenu=menu?menuActions:[];
  return <div className="mt-2 mb-1 px-1.5" data-sidebar-work-organizer>
    <section aria-label="Projects" className="space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className={sectionTitle}>Projects</h2>
        <div className="flex items-center gap-2">
          <button type="button" onClick={()=>router.push('/dashboard/projects')} className={secondary}>All projects</button>
          <button type="button" onClick={()=>{setEditor({mode:'new-project',kind:'project',id:'',title:'New project'});setEditorText('');}}
            className={secondary} aria-label="Create project"><Plus size={13} aria-hidden="true"/></button>
        </div>
      </div>
      {sidebarError ? <p role="alert" className="px-2 text-[10px] text-[var(--muted)]">{sidebarError}
        <button type="button" className="underline ml-1" onClick={()=>void refreshSidebarData()}>Retry</button></p>:null}
      {visiblePage(organizedProjects.filter(p=>!metaOf('project',p.id)?.archived_at),shownProjects).map(p=>{
        const related=getProjectChats(p);
        const expandedProject=openFolders[p.id]??Boolean(p.repo&&folders.some(f=>f.repo===p.repo&&f.key===selectedContextKey));
        const children=allProjectChats[p.id]?related:related.slice(0,3);
        const childSections=sections.filter(section=>section.project_id===p.id);
        return <div key={p.id} className="space-y-0.5">
          <div className="flex items-center gap-0.5">
            <button type="button" aria-label={expandedProject?'Collapse '+p.label:'Expand '+p.label}
              onClick={()=>setOpenFolders(prev=>({...prev,[p.id]:!expandedProject}))}
              className="p-1 rounded-md text-[var(--muted)] hover:bg-[var(--foreground)]/5">
              {expandedProject?<ChevronDown size={13}/>:<ChevronRight size={13}/>}
            </button>
            <div className="min-w-0 flex-1">
              {renderRow('project',p.id,projectTitle(p.id,p.label),()=>openProject(p.id),false)}
            </div>
            <button type="button" aria-label={'New task in '+projectTitle(p.id,p.label)} title={'New task in '+projectTitle(p.id,p.label)}
              className="xv-sidebar-project-task shrink-0 rounded-md p-1 text-[var(--muted)] hover:bg-[var(--foreground)]/10 hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              onClick={()=>beginProjectTask(p)}><Plus size={14} aria-hidden="true"/></button>
          </div>
          {expandedProject ? <div className="pl-3 space-y-0.5" aria-label={p.label+' conversations'}>
            {activeSidebarProjectId===p.id&&sessionId&&!related.some(item=>item.id===sessionId)?
              <button type="button" className="w-full text-left px-2 py-1.5 text-xs font-medium rounded-md bg-[var(--foreground)]/[0.055] truncate"
                aria-label={'Active new task in '+projectTitle(p.id,p.label)}
                onClick={()=>router.push('/workspace')}>
                {messages.find(message=>message.role==='user')?.content
                  ? meaningfulSidebarTitle('',messages.find(message=>message.role==='user')?.content).slice(0,64)
                  : 'Start conversation'}
              </button>:null}
            {childSections.map(section=>{
              const grouped=related.filter(item=>metaOf('conversation',item.id)?.section_id===section.id);
              if(!grouped.length)return null;
              return <div key={section.id}>
                <p className="px-2 py-0.5 text-[9px] font-medium text-[var(--muted)]">{section.title}</p>
                {(allProjectChats[p.id]?grouped:grouped.slice(0,3)).map(session=>
                  renderRow('conversation',session.id,conversationTitle(session),()=>void openSession(session),false))}
              </div>;
            })}
            {children.filter(session=>!metaOf('conversation',session.id)?.section_id).map(session=>
              renderRow('conversation',session.id,conversationTitle(session),()=>void openSession(session),false))}
            {related.length>3&&!allProjectChats[p.id]?
              <button type="button" className={secondary+' px-2 py-1'} onClick={()=>setAllProjectChats(prev=>({...prev,[p.id]:true}))}>View all chats</button>:null}
            {allProjectChats[p.id]&&related.length>3?
              <button type="button" className={secondary+' px-2 py-1'} onClick={()=>setAllProjectChats(prev=>({...prev,[p.id]:false}))}>Show fewer chats</button>:null}
            {related.length===0?<p className="px-2 py-1 text-[10px] text-[var(--muted)]">No saved conversations</p>:null}
          </div>:null}
        </div>;
      })}
      {projectsHasMore?
        <button type="button" className={secondary+' px-2 py-1'} onClick={()=>void moreProjects()}>View more projects</button>:null}
      {accountProjects.length>5?
        <button type="button" className={secondary+' px-2 py-1'} onClick={()=>{setAccountProjects(prev=>prev.slice(0,5));setShownProjects(5);setProjectsHasMore(true);}}>Show less</button>:null}
      {organizedProjects.length===0&&!sidebarError?<p className="px-2 py-1 text-[10px] text-[var(--muted)]">Projects you create will appear here.</p>:null}
    </section>

    {pinnedItems.length>0?<section className="mt-3" aria-label="Pinned items">
      <h2 className={sectionTitle}>Pinned</h2>
      {pinnedItems.slice(0,shownPins).map(item=>{
        if(item.item_type==='project'){
          const p=projectById(item.item_id);if(!p)return null;
          return renderRow('project',p.id,projectTitle(p.id,p.label),()=>openProject(p.id),true);
        }
        const session=savedConversations.find(s=>s.id===item.item_id);if(!session)return null;
        return renderRow('conversation',session.id,conversationTitle(session),()=>void openSession(session),true);
      })}
      {pinnedItems.length>shownPins?<button type="button" className={secondary+' px-2 py-1'} onClick={()=>setShownPins(prev=>prev+10)}>View more pins</button>:null}
      {shownPins>10?<button type="button" className={secondary+' px-2 py-1'} onClick={()=>setShownPins(10)}>Show less</button>:null}
    </section>:null}

    {!isGuest?<section className="xv-sidebar-recents-section" aria-label="Recent conversations outside projects">
      <div className="flex items-center justify-between gap-2"><h2 className={sectionTitle}>Recents</h2><span className="text-[9px] text-[var(--muted)]">Outside projects</span></div>
      {standaloneRecents.slice(0,shownRecents).map(session=>
        renderRow('conversation',session.id,conversationTitle(session),()=>void openSession(session),false))}
      {standaloneRecents.length===0?<p className="px-2 py-1 text-[10px] text-[var(--muted)]">Chats outside a project appear here.</p>:null}
      {standaloneRecents.length>shownRecents?
        <button type="button" className={secondary+' px-2 py-1'} onClick={()=>setShownRecents(prev=>prev+12)}>View more recents</button>
        :moreCloudSessions||moreSidebarChats?<button type="button" className={secondary+' px-2 py-1'}
          onClick={()=>void loadMoreRecents()}>Load older recents</button>:null}
      {shownRecents>12?<button type="button" className={secondary+' px-2 py-1'}
        onClick={()=>setShownRecents(12)}>Show fewer</button>:null}
      <button type="button" className={secondary+' px-2 py-1'} onClick={()=>setArchivedOpen(prev=>!prev)}
        aria-expanded={archivedOpen}>{archivedOpen?'Hide archive':'Archived items'}</button>
      {archivedOpen?itemMeta.filter(item=>item.archived_at!==null).map(item=>{
        const label=item.item_type==='project'
          ?projectTitle(item.item_id,projectById(item.item_id)?.label||'Archived project')
          :conversationTitle(savedConversations.find(s=>s.id===item.item_id)||{id:item.item_id,title:'Archived conversation',preview:'',updatedAt:'',cloudSynced:false,kind:'local',terminalNumber:0});
        return <div key={item.item_type+item.item_id} className="flex gap-2 items-center text-[10px] px-2 py-1">
          <span className="min-w-0 truncate flex-1">{label}</span>
          <button type="button" className={secondary} onClick={()=>void updateItem(item.item_type,item.item_id,{archived_at:null})}>Restore</button>
        </div>;
      }):null}
    </section>:null}

    <SidebarActionMenu point={menu?{x:menu.x,y:menu.y}:null} actions={openedMenu}
      onClose={()=>setMenu(null)} onSelect={id=>void handleMenuAction(id)}/>

    {editor&&typeof document!=='undefined'?createPortal(
      <div className="fixed inset-0 z-[10040] flex items-center justify-center bg-black/50 p-3"
        onPointerDown={event=>{if(event.target===event.currentTarget&&!saving)setEditor(null);}}>
        <div role="dialog" aria-modal="true" aria-label={editor.mode+' saved work'} className="w-full max-w-[350px] rounded-xl border border-[var(--card-border)] bg-[var(--card)] text-[var(--foreground)] shadow-2xl p-4 space-y-3">
          <h3 className="text-sm font-semibold capitalize">{editor.mode.replace(/-/g,' ')}</h3>
          {editor.mode==='move-project'?<>
            <input autoFocus value={editorText} onChange={e=>setEditorText(e.target.value)} placeholder="Search projects" aria-label="Search destination projects"
              className="w-full rounded-lg border border-[var(--card-border)] bg-transparent p-2 text-xs"/>
            <div className="max-h-[220px] overflow-y-auto space-y-1">
              {allProjectOptions.filter(p=>p.name.toLowerCase().includes(editorText.toLowerCase())).map(project=>
                <button key={project.id} type="button" className="w-full rounded-md px-2 py-2 text-left text-xs hover:bg-[var(--foreground)]/10"
                  onClick={()=>{void updateItem('conversation',editor.id,{project_id:project.id,section_id:null});setEditor(null);}}>
                  {project.name}</button>)}
            </div>
            <button type="button" className="text-xs underline" onClick={()=>{setEditor({...editor,mode:'new-project'});setEditorText('');}}>New project</button>
          </>:editor.mode==='move-section'?<>
            {!editor.projectId?<p className="text-xs text-[var(--muted)]">Move this conversation into a project before creating a section.</p>:<>
              <div className="max-h-[200px] overflow-y-auto">
                {sections.filter(x=>x.project_id===editor.projectId).map(sec=>
                  <button type="button" className="w-full text-xs rounded-md px-2 py-2 text-left hover:bg-[var(--foreground)]/10" key={sec.id}
                    onClick={()=>{void updateItem('conversation',editor.id,{project_id:editor.projectId,section_id:sec.id});setEditor(null);}}>{sec.title}</button>)}
              </div>
              <button type="button" className="text-xs underline" onClick={()=>{setEditor({...editor,mode:'new-section'});setEditorText('');}}>New section</button>
            </>}
            {!editor.projectId?<button type="button" className="text-xs underline" onClick={()=>{setEditor({...editor,mode:'move-project'});setEditorText('');void loadSidebarProjects(accountId,0,100).then(setAllProjectOptions);}}>Choose a project</button>:null}
          </>:editor.mode==='delete'?<p className="text-xs leading-relaxed text-[var(--muted)]">
            {editor.kind==='project'?'Deleting this Xroga project may also delete linked files and project data. It will not delete the remote GitHub repository.':'This permanently deletes the selected saved conversation where you have permission. This cannot be undone.'}
          </p>:<>
            <input autoFocus value={editorText} maxLength={120} onChange={e=>setEditorText(e.target.value)}
              placeholder={editor.mode==='rename'?'New title':editor.mode==='new-section'?'Section name':'Project name'}
              aria-label="Title" className="w-full rounded-lg border border-[var(--card-border)] bg-transparent p-2 text-xs"
              onKeyDown={e=>{if(e.key==='Escape')setEditor(null);if(e.key==='Enter'){e.preventDefault();void saveEditor();}}}/>
          </>}
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded-md px-3 py-2 text-xs hover:bg-[var(--foreground)]/10" onClick={()=>setEditor(null)}>Cancel</button>
            {editor.mode!=='move-project'&&editor.mode!=='move-section'?
              <button type="button" disabled={saving||(!editorText.trim()&&editor.mode!=='delete')}
                className="rounded-md px-3 py-2 text-xs font-semibold bg-[var(--foreground)] text-[var(--background)] disabled:opacity-50"
                onClick={()=>void saveEditor()}>{saving?'Saving…':editor.mode==='delete'?'Delete':'Save'}</button>:null}
          </div>
        </div>
      </div>,document.body):null}
  </div>;
}
