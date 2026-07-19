'use client';

import { useState } from 'react';
import { ChevronDown, FileCode2, GitBranch, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileTrailItem } from '@/store/useProjectWorkspaceStore';

function DiffBlock({ item }: { item: FileTrailItem }) {
  const [open, setOpen] = useState(false);
  const beforeLines = String(item.before ?? '').split('\n').slice(0, 80);
  const afterLines = String(item.after ?? '').split('\n').slice(0, 80);

  return (
    <div className="rounded-lg border border-[var(--card-border)]/50 bg-[var(--card)]/40 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-[var(--foreground)]/5"
      >
        <FileCode2 className="h-3 w-3 text-[var(--accent)] shrink-0" />
        <span className="font-mono font-semibold truncate flex-1">{item.path}</span>
        <span className="text-[10px] tabular-nums text-emerald-500 shrink-0">+{item.added}</span>
        <span className="text-[10px] tabular-nums text-rose-400 shrink-0">−{item.removed}</span>
        <ChevronDown className={cn('h-3 w-3 text-[var(--muted)] transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border-t border-[var(--card-border)]/40 text-[10px] font-mono max-h-48 overflow-auto">
          <pre className="p-2 bg-rose-500/5 text-[var(--muted)] whitespace-pre-wrap break-all">
            {beforeLines.join('\n') || '(empty)'}
          </pre>
          <pre className="p-2 bg-emerald-500/5 text-[var(--foreground)]/85 whitespace-pre-wrap break-all">
            {afterLines.join('\n') || '(empty)'}
          </pre>
        </div>
      )}
    </div>
  );
}

export function UpdateFileTrail({
  headline,
  changes,
  files,
  statusLine,
  onRollback,
  rollingBack,
}: {
  headline: string;
  changes?: string[];
  files: FileTrailItem[];
  statusLine?: string | null;
  onRollback?: () => void;
  rollingBack?: boolean;
}) {
  return (
    <div className="my-1.5 space-y-2 text-left animate-in fade-in slide-in-from-bottom-1 duration-300">
      <p className="text-[13px] font-medium text-[var(--foreground)]/90">{headline}</p>
      {changes?.length ? (
        <ul className="space-y-0.5 text-[12px] text-[var(--foreground)]/75 list-disc pl-4">
          {changes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
      {files.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wider font-bold text-[var(--muted)] flex items-center gap-1">
            <GitBranch className="h-3 w-3" /> File trail
          </p>
          {files.map((f) => (
            <DiffBlock key={f.path} item={f} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {statusLine ? (
          <p className="text-[11px] text-[var(--muted)] flex-1 min-w-0">{statusLine}</p>
        ) : null}
        {onRollback ? (
          <button
            type="button"
            disabled={rollingBack}
            onClick={onRollback}
            className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-md border border-[var(--card-border)]/60 hover:bg-[var(--foreground)]/5 text-[var(--foreground)]/80 disabled:opacity-50"
          >
            <RotateCcw className={cn('h-3 w-3', rollingBack && 'animate-spin')} />
            {rollingBack ? 'Rolling back…' : 'Undo last update'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
