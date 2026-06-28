'use client';

import { useEffect, useState } from 'react';
import { GitBranch, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Provider = 'github' | 'gitlab';

const MOCK_REPOS: Record<Provider, { repo: string; branches: string[] }[]> = {
  github: [
    { repo: 'xroga/xroga-app', branches: ['main', 'develop', 'feature/ai-swarm'] },
    { repo: 'you/my-project', branches: ['main', 'staging'] },
  ],
  gitlab: [
    { repo: 'team/xroga-core', branches: ['main', 'release'] },
  ],
};

export function RepoContextBar() {
  const [provider, setProvider] = useState<Provider>('github');
  const [repoIdx, setRepoIdx] = useState(0);
  const [branch, setBranch] = useState('main');
  const [open, setOpen] = useState<'repo' | 'branch' | null>(null);

  const repos = MOCK_REPOS[provider];
  const current = repos[repoIdx] ?? repos[0];

  useEffect(() => {
    const saved = localStorage.getItem('xroga-repo-context');
    if (!saved) return;
    try {
      const p = JSON.parse(saved) as { provider: Provider; repoIdx: number; branch: string };
      setProvider(p.provider);
      setRepoIdx(p.repoIdx);
      setBranch(p.branch);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    localStorage.setItem('xroga-repo-context', JSON.stringify({ provider, repoIdx, branch }));
  }, [provider, repoIdx, branch]);

  return (
    <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 border-b border-[var(--card-border)]/25 text-[10px] font-mono overflow-x-auto scrollbar-hide">
      <div className="flex rounded-lg border border-[var(--card-border)]/50 overflow-hidden shrink-0">
        {(['github', 'gitlab'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { setProvider(p); setRepoIdx(0); setBranch(MOCK_REPOS[p][0]?.branches[0] ?? 'main'); }}
            className={cn('px-2 py-1 font-bold capitalize', provider === p ? 'bg-[#006aff]/20 text-[#006aff]' : 'text-[var(--muted)]')}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="relative shrink-0">
        <button type="button" onClick={() => setOpen(open === 'repo' ? null : 'repo')} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-[var(--card-border)]/40 hover:border-[#006aff]/40">
          <span className="truncate max-w-[120px] sm:max-w-[200px]">{current?.repo}</span>
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
        {open === 'repo' && (
          <>
            <div className="fixed inset-0 z-[80]" onClick={() => setOpen(null)} aria-hidden />
            <ul className="absolute bottom-full left-0 mb-1 z-[90] min-w-[180px] rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-xl p-1">
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
          </>
        )}
      </div>
      <GitBranch className="w-3 h-3 text-[var(--muted)] shrink-0" />
      <div className="relative shrink-0">
        <button type="button" onClick={() => setOpen(open === 'branch' ? null : 'branch')} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-[var(--card-border)]/40">
          {branch}
          <ChevronDown className="w-3 h-3 opacity-60" />
        </button>
        {open === 'branch' && (
          <>
            <div className="fixed inset-0 z-[80]" onClick={() => setOpen(null)} aria-hidden />
            <ul className="absolute bottom-full left-0 mb-1 z-[90] min-w-[120px] rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-xl p-1">
              {current?.branches.map((b) => (
                <li key={b}>
                  <button type="button" onClick={() => { setBranch(b); setOpen(null); }} className="w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] hover:bg-white/10">
                    {b}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}
