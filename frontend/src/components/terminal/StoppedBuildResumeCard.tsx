'use client';

import { FolderGit2, GitBranch, Play, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SwarmTodoItem } from '@/lib/swarm';

export interface StoppedBuildMeta {
  originalPrompt: string;
  githubRepoName?: string | null;
  todos?: SwarmTodoItem[];
  phase?: number | null;
  activityLog?: string[];
}

interface StoppedBuildResumeCardProps {
  meta: StoppedBuildMeta;
  onRetry: () => void;
  className?: string;
}

/** Shown when user stops a build — keeps the project visible with Retry (continue, not rebuild). */
export function StoppedBuildResumeCard({ meta, onRetry, className }: StoppedBuildResumeCardProps) {
  const done = meta.todos?.filter((t) => t.status === 'done').length ?? 0;
  const total = meta.todos?.length ?? 0;
  const title = meta.originalPrompt.replace(/\s+/g, ' ').trim().slice(0, 72);

  return (
    <div
      className={cn(
        'rounded-xl border border-amber-500/35 bg-amber-500/8 px-3.5 py-3 space-y-2.5',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            Build stopped — saved to continue later
          </p>
          <p className="text-sm font-medium text-[var(--foreground)] truncate" title={meta.originalPrompt}>
            {title || 'Stopped project'}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted)]">
            {meta.githubRepoName ? (
              <span className="inline-flex items-center gap-1">
                <FolderGit2 className="h-3 w-3" />
                {meta.githubRepoName}
              </span>
            ) : (
              <span>No GitHub repo yet — Retry will continue the same request</span>
            )}
            {total > 0 && (
              <span>
                Progress {done}/{total} steps
              </span>
            )}
            {meta.phase != null && (
              <span className="inline-flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                Phase {meta.phase}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
      <p className="text-[11px] text-[var(--muted)] leading-relaxed">
        Retry continues from your GitHub files and last checkpoint — it does not rebuild the whole site from scratch.
      </p>
      {meta.todos && meta.todos.length > 0 && (
        <ul className="space-y-1 max-h-28 overflow-y-auto pr-1">
          {meta.todos.map((t) => (
            <li key={t.id} className="text-[11px] flex items-center gap-1.5 text-[var(--muted)]">
              <span
                className={cn(
                  'h-1.5 w-1.5 rounded-full shrink-0',
                  t.status === 'done' && 'bg-emerald-500',
                  t.status === 'active' && 'bg-amber-500',
                  t.status === 'pending' && 'bg-[var(--muted)]/40',
                  t.status === 'skipped' && 'bg-amber-500/50'
                )}
              />
              <span
                className={cn(
                  t.status === 'done' && 'line-through opacity-70',
                  t.status === 'skipped' && 'opacity-80'
                )}
              >
                {t.label}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
        <Play className="h-3 w-3" />
        Also available anytime from the sidebar Projects history
      </div>
    </div>
  );
}
