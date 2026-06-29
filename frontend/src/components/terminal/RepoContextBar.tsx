'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { ChatBarPortalPopover } from '@/components/ui/ChatBarPortalPopover';
import { cn } from '@/lib/utils';

interface RepoEntry {
  repo: string;
  branches: string[];
}

interface RepoContextBarProps {
  outside?: boolean;
}

export function RepoContextBar({ outside }: RepoContextBarProps) {
  const [repos, setRepos] = useState<RepoEntry[]>([]);
  const [repoIdx, setRepoIdx] = useState(0);
  const [branch, setBranch] = useState('main');
  const [open, setOpen] = useState<'repo' | 'branch' | null>(null);
  const repoBtnRef = useRef<HTMLButtonElement>(null);
  const branchBtnRef = useRef<HTMLButtonElement>(null);

  const current = repos[repoIdx];

  useEffect(() => {
    api.github
      .status()
      .then((s) => {
        if (!s.connected) {
          setRepos([]);
          return;
        }
        const defaultRepo = s.defaultRepo ?? (s.username ? `${s.username}/xroga-app` : null);
        if (defaultRepo) {
          setRepos([{ repo: defaultRepo, branches: ['main', 'develop'] }]);
        }
      })
      .catch(() => setRepos([]));

    const saved = localStorage.getItem('xroga-repo-context');
    if (!saved) return;
    try {
      const p = JSON.parse(saved) as { repoIdx: number; branch: string };
      setRepoIdx(p.repoIdx);
      setBranch(p.branch);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!current) return;
    localStorage.setItem('xroga-repo-context', JSON.stringify({ repoIdx, branch, repo: current.repo }));
    if (!current.branches.includes(branch)) {
      setBranch(current.branches[0]);
    }
  }, [repoIdx, branch, current]);

  if (!current) return null;

  return (
    <div className={cn(
      'flex items-center gap-2 text-[10px] font-mono text-[var(--foreground)] overflow-x-auto scrollbar-hide',
      outside ? 'px-0 py-0' : 'px-2 sm:px-3 py-1 border-0'
    )}>
      <div className="relative shrink-0">
        <button
          ref={repoBtnRef}
          type="button"
          onClick={() => setOpen(open === 'repo' ? null : 'repo')}
          className="flex items-center gap-0.5 bg-transparent border-0 p-0 font-semibold hover:text-[#006aff] transition-colors"
        >
          <span className="truncate max-w-[140px] sm:max-w-[220px]">{current.repo}</span>
          <ChevronDown className="w-3 h-3 opacity-50" />
        </button>
        <ChatBarPortalPopover open={open === 'repo'} onClose={() => setOpen(null)} anchorRef={repoBtnRef} width={220}>
          <ul className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl p-1 max-h-[160px] overflow-y-auto">
            {repos.map((r, i) => (
              <li key={r.repo}>
                <button
                  type="button"
                  onClick={() => { setRepoIdx(i); setBranch(r.branches[0]); setOpen(null); }}
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] hover:bg-white/10 truncate"
                >
                  {r.repo}
                </button>
              </li>
            ))}
          </ul>
        </ChatBarPortalPopover>
      </div>
      <span className="text-[var(--muted)] opacity-40">/</span>
      <div className="relative shrink-0">
        <button
          ref={branchBtnRef}
          type="button"
          onClick={() => setOpen(open === 'branch' ? null : 'branch')}
          className="flex items-center gap-0.5 bg-transparent border-0 p-0 font-semibold hover:text-[#006aff] transition-colors"
        >
          {branch}
          <ChevronDown className="w-3 h-3 opacity-50" />
        </button>
        <ChatBarPortalPopover open={open === 'branch'} onClose={() => setOpen(null)} anchorRef={branchBtnRef} width={160}>
          <ul className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-2xl p-1">
            {current.branches.map((b) => (
              <li key={b}>
                <button type="button" onClick={() => { setBranch(b); setOpen(null); }} className="w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] hover:bg-white/10">
                  {b}
                </button>
              </li>
            ))}
          </ul>
        </ChatBarPortalPopover>
      </div>
    </div>
  );
}
