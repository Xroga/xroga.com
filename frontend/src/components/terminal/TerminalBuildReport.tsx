'use client';

import { useState } from 'react';
import { ChevronDown, ExternalLink, FileCode2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileTrailItem } from '@/store/useProjectWorkspaceStore';
import { BuildTodoList } from './BuildTodoList';
import type { SwarmTodoItem } from '@/lib/swarm';

export interface TerminalBuildReportData {
  headline: string;
  projectName?: string;
  userPrompt?: string;
  changes?: string[];
  files?: FileTrailItem[];
  statusLines?: string[];
  githubUrl?: string | null;
  deployUrl?: string | null;
  completedTodos?: SwarmTodoItem[];
  qaIssues?: string[];
  isUpdate?: boolean;
  onRollback?: () => void;
  rollingBack?: boolean;
}

function DiffBlock({ item }: { item: FileTrailItem }) {
  const [open, setOpen] = useState(false);
  const beforeLines = String(item.before ?? '').split('\n').slice(0, 60);
  const afterLines = String(item.after ?? '').split('\n').slice(0, 60);

  return (
    <div className="font-mono text-[11px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 py-1 text-left hover:text-[var(--accent)]"
      >
        <FileCode2 className="h-3 w-3 text-[var(--accent)] shrink-0" />
        <span className="truncate flex-1">{item.path}</span>
        <span className="text-emerald-500 tabular-nums shrink-0">+{item.added ?? 0}</span>
        <span className="text-rose-400 tabular-nums shrink-0">−{item.removed ?? 0}</span>
        <ChevronDown className={cn('h-3 w-3 text-[var(--muted)] transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-5 pb-2 text-[10px]">
          <pre className="text-[var(--muted)] whitespace-pre-wrap break-all max-h-40 overflow-auto">
            {beforeLines.join('\n') || '(empty)'}
          </pre>
          <pre className="text-[var(--foreground)]/85 whitespace-pre-wrap break-all max-h-40 overflow-auto">
            {afterLines.join('\n') || '(empty)'}
          </pre>
        </div>
      )}
    </div>
  );
}

/** Terminal-native build/update report — no card chrome. */
export function TerminalBuildReport({
  headline,
  projectName,
  userPrompt,
  changes,
  files,
  statusLines,
  githubUrl,
  deployUrl,
  completedTodos,
  qaIssues,
  isUpdate,
  onRollback,
  rollingBack,
}: TerminalBuildReportData) {
  return (
    <div className="my-1.5 space-y-2 text-left font-mono text-[12px] leading-relaxed animate-in fade-in duration-300">
      <p className="text-[13px] font-sans font-medium text-[var(--foreground)]">{headline}</p>
      {projectName ? (
        <p className="text-[var(--muted)]">
          <span className="text-[var(--foreground)]/50">project</span> {projectName}
        </p>
      ) : null}
      {userPrompt ? (
        <p className="text-[var(--foreground)]/80 font-sans text-[12px]">
          <span className="text-[var(--muted)] font-mono mr-2">{isUpdate ? 'update' : 'asked'}</span>
          {userPrompt}
        </p>
      ) : null}

      {changes?.length ? (
        <ul className="space-y-0.5 text-[var(--foreground)]/75 list-none pl-0">
          {changes.map((c) => (
            <li key={c} className="before:content-['›'] before:mr-2 before:text-[var(--accent)]">
              {c}
            </li>
          ))}
        </ul>
      ) : null}

      {files && files.length > 0 ? (
        <div className="space-y-0.5 border-l border-[var(--foreground)]/10 pl-3">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted)]">files</p>
          {files.map((f) => (
            <DiffBlock key={f.path} item={f} />
          ))}
        </div>
      ) : null}

      {qaIssues && qaIssues.length > 0 ? (
        <div className="text-[var(--muted)]">
          <p className="text-[10px] uppercase tracking-wider">qa</p>
          {qaIssues.slice(0, 4).map((i) => (
            <p key={i}>· {i}</p>
          ))}
        </div>
      ) : null}

      {completedTodos && completedTodos.length > 0 ? (
        <BuildTodoList todos={completedTodos} showProgress={false} />
      ) : null}

      {statusLines?.length ? (
        <div className="text-[11px] text-[var(--muted)] space-y-0.5">
          {statusLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3 pt-0.5 font-sans text-[11px]">
        {githubUrl ? (
          <a
            href={githubUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
          >
            GitHub <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        {deployUrl ? (
          <a
            href={deployUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
          >
            Live on Vercel <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
        {onRollback ? (
          <button
            type="button"
            disabled={rollingBack}
            onClick={onRollback}
            className="inline-flex items-center gap-1 text-[var(--foreground)]/70 hover:text-[var(--foreground)] disabled:opacity-50"
          >
            <RotateCcw className={cn('h-3 w-3', rollingBack && 'animate-spin')} />
            {rollingBack ? 'Rolling back…' : 'Undo last update'}
          </button>
        ) : null}
      </div>

      <p className="text-[11px] text-[var(--muted)] font-sans">
        {deployUrl
          ? 'Live preview opens your Vercel domain — also in the project panel.'
          : 'Preview is in the project panel — not a separate card.'}
      </p>
    </div>
  );
}
