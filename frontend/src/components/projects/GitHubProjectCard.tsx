'use client';

import Image from 'next/image';
import { Calendar, ExternalLink, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getIntegrationLogo } from '@/lib/integrationLogos';
import type { Project } from '@/lib/api';

function formatRelative(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 48) return `${hours}h ago`;
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function GitHubProjectCard({
  project,
  onContinue,
  onDelete,
  onOpenRepo,
  compact = false,
  className,
}: {
  project: Project;
  onContinue: () => void;
  onDelete: () => void;
  onOpenRepo?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const repo = project.github_repo_name ?? 'GitHub repo';
  const updated = project.updated_at || project.created_at;
  const githubLogo = getIntegrationLogo('github');

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card)] transition hover:border-[var(--accent)]/40 hover:shadow-md',
        compact ? 'text-[11px]' : '',
        className,
      )}
    >
      <div
        className={cn(
          'relative flex items-center gap-2 border-b border-[var(--card-border)]/60 bg-gradient-to-r from-[var(--accent)]/10 via-transparent to-emerald-500/5',
          compact ? 'px-2.5 py-2' : 'px-3 py-2.5',
        )}
      >
        {githubLogo ? (
          <Image src={githubLogo} alt="" width={18} height={18} className="shrink-0 opacity-90" />
        ) : (
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-[var(--foreground)] text-[10px] font-bold text-[var(--background)]">
            GH
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-[10px] font-semibold text-emerald-400/90">
          {repo}
        </span>
        <span className="shrink-0 text-[9px] text-[var(--muted)] font-mono">main</span>
        {project.github_repo_url && onOpenRepo ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenRepo();
            }}
            className="shrink-0 rounded p-1 text-[var(--muted)] hover:text-[var(--accent)]"
            title="Open on GitHub"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>

      <div className={cn('flex flex-1 flex-col gap-2', compact ? 'p-2.5' : 'p-3')}>
        <button type="button" onClick={onContinue} className="text-left">
          <h3 className={cn('line-clamp-2 font-semibold text-[var(--foreground)]', compact ? 'text-xs' : 'text-sm')}>
            {project.name}
          </h3>
          <p className="mt-0.5 line-clamp-1 capitalize text-[10px] text-[var(--muted)]">{project.type}</p>
        </button>

        <div className="flex items-center gap-1.5 text-[10px] text-[var(--muted)]">
          <Calendar className="h-3 w-3 shrink-0" aria-hidden />
          <span>Updated {formatRelative(updated)}</span>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onContinue}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-2 py-1.5 text-[10px] font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            Continue
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-500/25 text-red-500 transition hover:bg-red-500/10"
            aria-label="Delete project"
            title="Remove from Xroga (GitHub repo unchanged)"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}
