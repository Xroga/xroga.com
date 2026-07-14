'use client';

import { ExternalLink, Eye, EyeOff, FolderGit2, Loader2 } from 'lucide-react';
import { useProjectWorkspaceStore } from '@/store/useProjectWorkspaceStore';
import { cn } from '@/lib/utils';

function statusLabel(status: string): string {
  switch (status) {
    case 'updating':
      return 'Updating';
    case 'pushed':
      return 'Pushed';
    case 'live':
      return 'Live';
    case 'degraded':
      return 'Degraded';
    default:
      return 'Idle';
  }
}

/** Persistent project rail — one per repo (Plan A). Not a response card. */
export function ProjectWorkspaceRail() {
  const repo = useProjectWorkspaceStore((s) => s.repo);
  const branch = useProjectWorkspaceStore((s) => s.branch);
  const projectName = useProjectWorkspaceStore((s) => s.projectName);
  const deployUrl = useProjectWorkspaceStore((s) => s.deployUrl);
  const status = useProjectWorkspaceStore((s) => s.status);
  const previewOpen = useProjectWorkspaceStore((s) => s.previewOpen);
  const setPreviewOpen = useProjectWorkspaceStore((s) => s.setPreviewOpen);
  const html = useProjectWorkspaceStore((s) => s.html);

  if (!repo?.includes('/') && !html) return null;

  const label = projectName || (repo ? repo.split('/')[1] : 'Project');

  return (
    <div className="rounded-xl border border-[var(--card-border)]/50 bg-[var(--card)]/55 backdrop-blur-md px-3 py-2 flex flex-wrap items-center gap-2 text-[11px]">
      <FolderGit2 className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[var(--foreground)] truncate">{label}</p>
        <p className="text-[10px] text-[var(--muted)] font-mono truncate">
          {repo ? `${repo} / ${branch}` : 'Local preview'}
        </p>
      </div>
      <span
        className={cn(
          'px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide shrink-0',
          status === 'live' && 'bg-emerald-500/15 text-emerald-600',
          status === 'updating' && 'bg-amber-500/15 text-amber-700',
          status === 'pushed' && 'bg-[var(--accent)]/15 text-[var(--accent)]',
          status === 'idle' && 'bg-[var(--foreground)]/5 text-[var(--muted)]',
          status === 'degraded' && 'bg-rose-500/15 text-rose-500'
        )}
      >
        {status === 'updating' ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> {statusLabel(status)}
          </span>
        ) : (
          statusLabel(status)
        )}
      </span>
      <button
        type="button"
        onClick={() => setPreviewOpen(!previewOpen)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold hover:bg-[var(--foreground)]/5 text-[var(--foreground)]/85"
        title={previewOpen ? 'Hide preview' : 'Show preview'}
      >
        {previewOpen ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        Preview
      </button>
      {deployUrl ? (
        <a
          href={deployUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-semibold text-[#006aff] hover:bg-[#006aff]/10"
        >
          <ExternalLink className="h-3 w-3" />
          Live
        </a>
      ) : null}
    </div>
  );
}
