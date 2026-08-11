'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { api, type GitHubRepo } from '@/lib/api';
import { getCachedRepoAnalysis, setCachedRepoAnalysis } from '@/lib/repoAnalysisCache';
import { ChatBarPortalPopover } from '@/components/ui/ChatBarPortalPopover';
import { GITHUB_CONNECTED_EVENT } from '@/lib/githubEvents';
import {
  consumeFreshTerminalIntent,
  markFreshTerminalIntent,
  clearSelectedRepoContext,
  saveSelectedRepoContext,
  getNewRepoVisibility,
  saveNewRepoVisibility,
  type NewRepoVisibility,
} from '@/lib/repoContext';
import {
  GITHUB_PROJECT_SAVED_EVENT,
  GITHUB_REPO_CONTEXT_EVENT,
  OPEN_REPO_PICKER_EVENT,
  REPO_CONTEXT_CLEARED_EVENT,
  notifyGithubRepoContext,
  notifyOpenRepoPicker,
  notifyRepoContextCleared,
} from '@/lib/githubProjectEvents';
import { useTerminalChat } from '@/context/TerminalChatContext';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'xroga-repo-context';
const REPO_LIST_CACHE_KEY = 'xroga-repo-list-cache';
const REPO_LIST_CACHE_TTL_MS = 5 * 60_000;

interface RepoListSnapshot {
  connected: boolean;
  repos: GitHubRepo[];
  defaultRepo?: string | null;
  verifiedAt: number;
}

let repoListRequest: Promise<RepoListSnapshot> | null = null;

function readRepoListSnapshot(): RepoListSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(REPO_LIST_CACHE_KEY) ?? 'null') as RepoListSnapshot | null;
    if (!parsed || !Array.isArray(parsed.repos) || typeof parsed.verifiedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchRepoListSnapshot(force = false): Promise<RepoListSnapshot> {
  const cached = readRepoListSnapshot();
  if (!force && cached && Date.now() - cached.verifiedAt < REPO_LIST_CACHE_TTL_MS) return cached;
  if (repoListRequest) return repoListRequest;
  repoListRequest = (async () => {
    const status = await api.github.status();
    const repos = status.connected ? (await api.github.listRepos()).repos : [];
    const snapshot: RepoListSnapshot = {
      connected: status.connected,
      repos,
      defaultRepo: status.defaultRepo,
      verifiedAt: Date.now(),
    };
    localStorage.setItem(REPO_LIST_CACHE_KEY, JSON.stringify(snapshot));
    return snapshot;
  })().finally(() => {
    repoListRequest = null;
  });
  return repoListRequest;
}

interface RepoContextBarProps {
  outside?: boolean;
  /**
   * Renders inside the composer's bottom row rather than as its own row above it.
   * Everything still works; the difference is that it stays on one line, truncates
   * instead of scrolling, and shows a spinner rather than the words
   * "Loading repositories…" while it waits.
   */
  compact?: boolean;
}

export function RepoContextBar({ outside, compact }: RepoContextBarProps) {
  const { messages, restoreTerminalSession, startNewChat } = useTerminalChat();
  const repoLocked = messages.length > 0;
  const [connected, setConnected] = useState(false);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [repoSummary, setRepoSummary] = useState<string | null>(null);
  const [repoTech, setRepoTech] = useState<string[]>([]);
  const [open, setOpen] = useState<'repo' | 'branch' | null>(null);
  // Only consulted when no repo is selected, i.e. when this build will create one.
  // Initialised to 'private' rather than from storage so the first server-rendered paint
  // can never show "Public" for a user whose stored value has not been read yet.
  const [newRepoVisibility, setNewRepoVisibility] = useState<NewRepoVisibility>('private');
  const repoAnchorRef = useRef<HTMLSpanElement>(null);
  const branchAnchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    setNewRepoVisibility(getNewRepoVisibility());
  }, []);

  const loadBranches = useCallback(async (fullName: string, preferred?: string) => {
    const [owner, repo] = fullName.split('/');
    if (!owner || !repo) return 'main';
    setLoadingBranches(true);
    try {
      const { branches: list } = await api.github.listBranches(owner, repo);
      const names = list.map((b) => b.name);
      setBranches(names);
      const next =
        preferred && names.includes(preferred)
          ? preferred
          : names.includes('main')
            ? 'main'
            : names[0] ?? 'main';
      setSelectedBranch(next);
      return next;
    } catch {
      setBranches(['main']);
      setSelectedBranch('main');
      return 'main';
    } finally {
      setLoadingBranches(false);
    }
  }, []);

  const analyzeRepo = useCallback(async (fullName: string, branch: string, force = false) => {
    if (!force) {
      const cached = getCachedRepoAnalysis(fullName, branch);
      if (cached) {
        setRepoSummary(cached.summary);
        setRepoTech(cached.techStack ?? []);
        return;
      }
    }

    setAnalyzing(true);
    setRepoSummary(null);
    try {
      const result = await api.github.analyzeRepo(fullName, branch, { lite: true });
      setRepoSummary(result.summary);
      setRepoTech(result.techStack ?? []);
      setCachedRepoAnalysis({
        repo: fullName,
        branch,
        summary: result.summary,
        techStack: result.techStack ?? [],
        fileCount: result.fileCount,
        scannedAt: Date.now(),
      });
    } catch {
      setRepoSummary(null);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const refresh = useCallback(async (force = false) => {
    if (!readRepoListSnapshot()) setLoadingRepos(true);
    try {
      const snapshot = await fetchRepoListSnapshot(force);
      if (!snapshot.connected) {
        setConnected(false);
        setRepos([]);
        setSelectedRepo(null);
        return;
      }
      setConnected(true);
      const list = snapshot.repos;
      setRepos(list);

      const saved = localStorage.getItem(STORAGE_KEY);
      let savedRepo: string | null = null;
      let savedBranch: string | null = null;
      if (saved) {
        try {
          const p = JSON.parse(saved) as { repo?: string; branch?: string };
          savedRepo = p.repo ?? null;
          savedBranch = p.branch ?? null;
        } catch { /* ignore */ }
      }

      const { hasFreshTerminalIntent } = await import('@/lib/repoContext');
      const freshTerminal = hasFreshTerminalIntent();

      // Fresh Terminal: never auto-bind sticky default — user must pick (or leave empty for new product).
      const defaultRepo = freshTerminal
        ? savedRepo && list.some((r) => r.fullName === savedRepo)
          ? savedRepo
          : null
        : savedRepo && list.some((r) => r.fullName === savedRepo)
          ? savedRepo
          : snapshot.defaultRepo && list.some((r) => r.fullName === snapshot.defaultRepo)
            ? snapshot.defaultRepo
            : repoLocked
              ? list[0]?.fullName ?? null
              : null;

      setSelectedRepo(defaultRepo);
      if (defaultRepo) {
        const meta = list.find((r) => r.fullName === defaultRepo);
        const branch = await loadBranches(defaultRepo, savedBranch ?? meta?.defaultBranch);
        // Persist sticky selection for pipeline clientMeta
        saveSelectedRepoContext({ repo: defaultRepo, branch });
        // Defer lite analyze so the repo picker paints first
        const runAnalyze = () => void analyzeRepo(defaultRepo, branch, false);
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          (
            window as Window & {
              requestIdleCallback: (cb: () => void, opts?: { timeout: number }) => number;
            }
          ).requestIdleCallback(runAnalyze, { timeout: 1200 });
        } else {
          globalThis.setTimeout(runAnalyze, 200);
        }
      } else if (freshTerminal) {
        // Keep selection cleared for a new product
        setSelectedBranch('main');
      }
    } catch {
      setConnected(false);
      setRepos([]);
    } finally {
      setLoadingRepos(false);
    }
  }, [loadBranches, analyzeRepo, repoLocked]);

  useEffect(() => {
    const hadCache = Boolean(readRepoListSnapshot());
    void refresh(false).then(() => {
      if (hadCache) void refresh(true);
    });
    const onConnected = () => void refresh(true);
    const onStorage = () => {
      void refresh(true);
    };
    const onProjectSaved = () => void refresh(true);
    const onRepoContext = (e: Event) => {
      const detail = (e as CustomEvent<{ repo?: string; branch?: string }>).detail;
      if (!detail?.repo?.includes('/')) return;
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ repo: detail.repo, branch: detail.branch ?? 'main' }),
      );
      void refresh(false);
    };
    const onCleared = () => {
      setSelectedRepo(null);
      setSelectedBranch('main');
      setRepoSummary(null);
      setOpen(null);
    };
    const onOpenPicker = () => {
      setSelectedRepo(null);
      setSelectedBranch('main');
      setRepoSummary(null);
      // Force chatbar "Select repository" dropdown open
      window.setTimeout(() => setOpen('repo'), 30);
    };
    window.addEventListener(GITHUB_CONNECTED_EVENT, onConnected);
    window.addEventListener(GITHUB_REPO_CONTEXT_EVENT, onRepoContext);
    window.addEventListener(GITHUB_PROJECT_SAVED_EVENT, onProjectSaved);
    window.addEventListener(REPO_CONTEXT_CLEARED_EVENT, onCleared);
    window.addEventListener(OPEN_REPO_PICKER_EVENT, onOpenPicker);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(GITHUB_CONNECTED_EVENT, onConnected);
      window.removeEventListener(GITHUB_REPO_CONTEXT_EVENT, onRepoContext);
      window.removeEventListener(GITHUB_PROJECT_SAVED_EVENT, onProjectSaved);
      window.removeEventListener(REPO_CONTEXT_CLEARED_EVENT, onCleared);
      window.removeEventListener(OPEN_REPO_PICKER_EVENT, onOpenPicker);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  useEffect(() => {
    if (!selectedRepo) return;
    saveSelectedRepoContext({ repo: selectedRepo, branch: selectedBranch });
  }, [selectedRepo, selectedBranch]);

  async function selectRepo(fullName: string) {
    setSelectedRepo(fullName);
    setOpen(null);
    const meta = repos.find((r) => r.fullName === fullName);
    const branch = await loadBranches(fullName, meta?.defaultBranch);

    // Mid-chat repo switch: keep the old #N under its repo, start a blank session for the new one.
    const prev = (() => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as { repo?: string };
      } catch {
        return null;
      }
    })();
    let startedFreshSession = false;
    if (
      messages.length > 0 &&
      prev?.repo?.includes('/') &&
      prev.repo !== fullName
    ) {
      startNewChat();
      startedFreshSession = true;
    }

    saveSelectedRepoContext({ repo: fullName, branch });
    // Sync sidebar — sticky binding keeps prior terminals under their own folders
    const { syncRepoTerminalSessions } = await import('@/lib/syncRepoTerminalSessions');
    syncRepoTerminalSessions();
    notifyGithubRepoContext(fullName, branch);
    void analyzeRepo(fullName, branch, false);
    try {
      await api.github.updateSettings('manual', fullName);
    } catch { /* non-blocking */ }

    // New Terminal flow: keep blank workspace so the next chat creates #1 / #2.
    // Only auto-resume when user is NOT starting a fresh terminal.
    if (consumeFreshTerminalIntent() || startedFreshSession) {
      window.dispatchEvent(new CustomEvent('xroga-resume-workspace'));
      return;
    }

    if (messages.length === 0) {
      try {
        const { loadBestTerminalForRepo } = await import('@/lib/restoreRepoTerminal');
        const best = await loadBestTerminalForRepo(fullName);
        if (best?.messages?.length) {
          await restoreTerminalSession({
            sessionId: best.id,
            prompt: best.prompt,
            messages: best.messages,
            selectedId: best.id,
            selectedLabel: best.title,
            source: 'projects',
            jumpMessageId: best.messages[best.messages.length - 1]?.id,
          });
        }
      } catch {
        /* non-blocking */
      }
    }
  }

  async function selectBranch(name: string) {
    setSelectedBranch(name);
    setOpen(null);
    if (selectedRepo) {
      void analyzeRepo(selectedRepo, name, false);
    }
  }

  if (!connected && !loadingRepos) return null;

  if (loadingRepos) {
    // Compact shows the spinner alone. A sentence of status text in a control row is
    // noise, and it is also the widest this element ever gets, so the row reflowed
    // the moment repositories finished loading.
    if (compact) {
      return null;
    }
    return (
      <div className={cn('flex items-center gap-1.5 text-[10px] font-mono text-[var(--muted)]', outside ? 'py-0' : 'py-1')}>
        <Loader2 className="w-3 h-3 animate-spin opacity-60" />
        <span>Loading repositories…</span>
      </div>
    );
  }

  const textTriggerClass =
    'inline-flex items-center gap-0.5 cursor-pointer select-none font-semibold text-[var(--foreground)] hover:text-[#006aff] transition-colors outline-none';
  const plainTextClass = 'inline-flex items-center gap-0.5 font-semibold text-[var(--foreground)]';

  return (
    <div
      className={cn(
        'flex items-center text-[10px] font-mono text-[var(--foreground)]',
        compact
          ? 'xv-repo-chip gap-1.5 w-max max-w-full min-w-0 overflow-x-auto scrollbar-hide'
          : 'gap-2 overflow-x-auto scrollbar-hide',
        !compact && (outside ? 'px-0 py-0' : 'px-2 sm:px-3 py-1 border-0')
      )}
    >
      {/* Explicit product intent — avoids patching the wrong app */}
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          title={
            selectedRepo
              ? `Updates go to ${selectedRepo}`
              : 'Pick a repo first to update an existing product'
          }
          onClick={() => {
            if (!selectedRepo) {
              setOpen('repo');
              notifyOpenRepoPicker();
            }
          }}
          className={cn(
            'rounded px-1.5 py-0.5 border text-[9px] font-semibold transition-colors',
            selectedRepo
              ? 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'
              : 'border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]',
          )}
        >
          {selectedRepo ? 'Update current' : 'Pick to update'}
        </button>
        <button
          type="button"
          title="Clear repo selection and start a brand-new product"
          onClick={() => {
            markFreshTerminalIntent();
            clearSelectedRepoContext();
            notifyRepoContextCleared();
            setSelectedRepo(null);
            setSelectedBranch('main');
            setRepoSummary(null);
            setRepoTech([]);
            startNewChat();
            notifyOpenRepoPicker();
          }}
          className="rounded px-1.5 py-0.5 border border-[var(--card-border)] text-[9px] font-semibold text-[var(--muted)] hover:text-[var(--foreground)] hover:border-[var(--accent)]/40 transition-colors"
        >
          New product
        </button>
      </div>

      <div className="relative shrink-0">
        {repoLocked && selectedRepo ? (
          <span className={plainTextClass}>
            <span className="truncate max-w-[140px] sm:max-w-[220px]">{selectedRepo}</span>
          </span>
        ) : (
          <>
            <span
              ref={repoAnchorRef}
              role="button"
              tabIndex={0}
              onClick={() => setOpen(open === 'repo' ? null : 'repo')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setOpen(open === 'repo' ? null : 'repo');
                }
              }}
              className={textTriggerClass}
            >
              <span className="truncate max-w-[140px] sm:max-w-[220px]">
                {selectedRepo ?? 'Select repository'}
              </span>
              <ChevronDown className={cn('w-3 h-3 opacity-50 transition-transform', open === 'repo' && 'rotate-180')} />
            </span>
            <ChatBarPortalPopover open={open === 'repo'} onClose={() => setOpen(null)} anchorRef={repoAnchorRef} width={240}>
              <ul className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl p-1 max-h-[200px] overflow-y-auto">
                {repos.map((r) => (
                  <li key={r.fullName}>
                    <span
                      role="option"
                      aria-selected={r.fullName === selectedRepo}
                      onClick={() => void selectRepo(r.fullName)}
                      className={cn(
                        'block px-2.5 py-1.5 rounded-lg text-[10px] cursor-pointer truncate hover:bg-white/10',
                        r.fullName === selectedRepo && 'text-[#006aff] font-semibold'
                      )}
                    >
                      {r.fullName}
                    </span>
                  </li>
                ))}
              </ul>
            </ChatBarPortalPopover>
          </>
        )}
      </div>

      {selectedRepo ? (
        <>
          <span className="text-[var(--muted)] opacity-40">/</span>

          <div className="relative shrink-0">
            {repoLocked ? (
              <span className={plainTextClass}>
                {loadingBranches ? <Loader2 className="w-3 h-3 animate-spin" /> : selectedBranch}
              </span>
            ) : (
              <>
                <span
                  ref={branchAnchorRef}
                  role="button"
                  tabIndex={0}
                  onClick={() => !loadingBranches && setOpen(open === 'branch' ? null : 'branch')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (!loadingBranches) setOpen(open === 'branch' ? null : 'branch');
                    }
                  }}
                  className={cn(textTriggerClass, loadingBranches && 'opacity-60 pointer-events-none')}
                >
                  {loadingBranches ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    selectedBranch
                  )}
                  <ChevronDown className={cn('w-3 h-3 opacity-50 transition-transform', open === 'branch' && 'rotate-180')} />
                </span>
                <ChatBarPortalPopover open={open === 'branch'} onClose={() => setOpen(null)} anchorRef={branchAnchorRef} width={180}>
                  <ul className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl p-1 max-h-[200px] overflow-y-auto">
                    {branches.map((b) => (
                      <li key={b}>
                        <span
                          role="option"
                          aria-selected={b === selectedBranch}
                          onClick={() => void selectBranch(b)}
                          className={cn(
                            'block px-2.5 py-1.5 rounded-lg text-[10px] cursor-pointer hover:bg-white/10',
                            b === selectedBranch && 'text-[#006aff] font-semibold'
                          )}
                        >
                          {b}
                        </span>
                      </li>
                    ))}
                  </ul>
                </ChatBarPortalPopover>
              </>
            )}
          </div>
        </>
      ) : (
        /*
         * No repo selected means this build will create one, so this is the only moment
         * the user can decide whether it is published. It is a two-state toggle rather
         * than a checkbox because "unchecked" reads as an absence, and an absence must
         * never be what publishes a repository — here both states are chosen, visible,
         * and labelled.
         */
        <div className="flex items-center gap-1 shrink-0" role="group" aria-label="Visibility for the repository Xroga will create">
          {(['private', 'public'] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={newRepoVisibility === value}
              title={
                value === 'private'
                  ? 'The new repository will be private to your account'
                  : 'The new repository will be visible to anyone on GitHub'
              }
              onClick={() => {
                setNewRepoVisibility(value);
                saveNewRepoVisibility(value);
              }}
              className={cn(
                'rounded px-1.5 py-0.5 border text-[9px] font-semibold transition-colors capitalize',
                newRepoVisibility === value
                  ? value === 'public'
                    ? 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10'
                    : 'border-[var(--accent)]/40 text-[var(--foreground)] bg-[var(--accent)]/10'
                  : 'border-[var(--card-border)] text-[var(--muted)] hover:text-[var(--foreground)]',
              )}
            >
              {value}
            </button>
          ))}
        </div>
      )}

      {(analyzing || repoSummary) && selectedRepo && (
        <span className="text-[9px] text-[var(--muted)] truncate max-w-[200px] sm:max-w-[360px] shrink-0" title={repoSummary ?? undefined}>
          {analyzing ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Scanning repo metadata…
            </span>
          ) : (
            <>
              {repoTech.length > 0 && (
                <span className="text-[var(--accent)] mr-1">{repoTech.slice(0, 2).join(' · ')}</span>
              )}
              <span title="Quick metadata scan (file tree + stack). Full file bodies load when you ask to update.">
                {repoSummary}
              </span>
            </>
          )}
        </span>
      )}
    </div>
  );
}
