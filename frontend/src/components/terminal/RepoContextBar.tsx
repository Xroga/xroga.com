'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { api, type GitHubRepo } from '@/lib/api';
import { getCachedRepoAnalysis, setCachedRepoAnalysis } from '@/lib/repoAnalysisCache';
import { ChatBarPortalPopover } from '@/components/ui/ChatBarPortalPopover';
import { GITHUB_CONNECTED_EVENT } from '@/lib/githubEvents';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'xroga-repo-context';

interface RepoContextBarProps {
  outside?: boolean;
}

export function RepoContextBar({ outside }: RepoContextBarProps) {
  const [connected, setConnected] = useState(false);
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('main');
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [repoSummary, setRepoSummary] = useState<string | null>(null);
  const [repoTech, setRepoTech] = useState<string[]>([]);
  const [open, setOpen] = useState<'repo' | 'branch' | null>(null);
  const repoAnchorRef = useRef<HTMLSpanElement>(null);
  const branchAnchorRef = useRef<HTMLSpanElement>(null);

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
      const result = await api.github.analyzeRepo(fullName);
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

  const refresh = useCallback(async () => {
    setLoadingRepos(true);
    try {
      const status = await api.github.status();
      if (!status.connected) {
        setConnected(false);
        setRepos([]);
        setSelectedRepo(null);
        return;
      }
      setConnected(true);

      const { repos: list } = await api.github.listRepos();
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

      const defaultRepo =
        (savedRepo && list.some((r) => r.fullName === savedRepo) ? savedRepo : null) ??
        (status.defaultRepo && list.some((r) => r.fullName === status.defaultRepo) ? status.defaultRepo : null) ??
        list[0]?.fullName ??
        null;

      setSelectedRepo(defaultRepo);
      if (defaultRepo) {
        const meta = list.find((r) => r.fullName === defaultRepo);
        const branch = await loadBranches(defaultRepo, savedBranch ?? meta?.defaultBranch);
        void analyzeRepo(defaultRepo, branch, false);
      }
    } catch {
      setConnected(false);
      setRepos([]);
    } finally {
      setLoadingRepos(false);
    }
  }, [loadBranches, analyzeRepo]);

  useEffect(() => {
    void refresh();
    const onConnected = () => void refresh();
    window.addEventListener(GITHUB_CONNECTED_EVENT, onConnected);
    return () => window.removeEventListener(GITHUB_CONNECTED_EVENT, onConnected);
  }, [refresh]);

  useEffect(() => {
    if (!selectedRepo) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ repo: selectedRepo, branch: selectedBranch })
    );
  }, [selectedRepo, selectedBranch]);

  async function selectRepo(fullName: string) {
    setSelectedRepo(fullName);
    setOpen(null);
    const meta = repos.find((r) => r.fullName === fullName);
    const branch = await loadBranches(fullName, meta?.defaultBranch);
    void analyzeRepo(fullName, branch, false);
    try {
      await api.github.updateSettings('manual', fullName);
    } catch { /* non-blocking */ }
  }

  async function selectBranch(name: string) {
    setSelectedBranch(name);
    setOpen(null);
  }

  if (!connected && !loadingRepos) return null;

  if (loadingRepos && !selectedRepo) {
    return (
      <div className={cn('flex items-center gap-1.5 text-[10px] font-mono text-[var(--muted)]', outside ? 'py-0' : 'py-1')}>
        <Loader2 className="w-3 h-3 animate-spin opacity-60" />
        <span>Loading repositories…</span>
      </div>
    );
  }

  if (!selectedRepo) return null;

  const textTriggerClass =
    'inline-flex items-center gap-0.5 cursor-pointer select-none font-semibold text-[var(--foreground)] hover:text-[#006aff] transition-colors outline-none';

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-[10px] font-mono text-[var(--foreground)] overflow-x-auto scrollbar-hide',
        outside ? 'px-0 py-0' : 'px-2 sm:px-3 py-1 border-0'
      )}
    >
      <div className="relative shrink-0">
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
          <span className="truncate max-w-[140px] sm:max-w-[220px]">{selectedRepo}</span>
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
      </div>

      <span className="text-[var(--muted)] opacity-40">/</span>

      <div className="relative shrink-0">
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
      </div>

      {(analyzing || repoSummary) && (
        <span className="text-[9px] text-[var(--muted)] truncate max-w-[200px] sm:max-w-[360px] shrink-0" title={repoSummary ?? undefined}>
          {analyzing ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              Reading repository…
            </span>
          ) : (
            <>
              {repoTech.length > 0 && (
                <span className="text-[var(--accent)] mr-1">{repoTech.slice(0, 2).join(' · ')}</span>
              )}
              {repoSummary}
            </>
          )}
        </span>
      )}
    </div>
  );
}
