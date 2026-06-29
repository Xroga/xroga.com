'use client';

import type { ReactNode } from 'react';
import { Calendar, ExternalLink, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatDay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });
  } catch {
    return '';
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export function SectionCompactCard({
  title,
  subtitle,
  dateIso,
  preview,
  onOpen,
  onDelete,
  openLabel = 'Open in terminal',
  className,
}: {
  title: string;
  subtitle?: string;
  dateIso: string;
  preview?: ReactNode;
  onOpen: () => void;
  onDelete: () => void;
  openLabel?: string;
  className?: string;
}) {
  const day = formatDay(dateIso);
  const date = formatDate(dateIso);

  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] transition hover:border-[var(--accent)]/35 hover:shadow-md',
        className,
      )}
    >
      {preview ? (
        <button type="button" onClick={onOpen} className="relative block w-full text-left">
          {preview}
        </button>
      ) : null}

      <div className="flex flex-1 flex-col gap-2 p-3">
        <button type="button" onClick={onOpen} className="text-left">
          <h3 className="line-clamp-2 text-sm font-semibold text-[var(--text)]">{title}</h3>
          {subtitle ? <p className="mt-0.5 line-clamp-1 text-[11px] text-[var(--text-muted)]">{subtitle}</p> : null}
        </button>

        <div className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          <Calendar className="h-3 w-3 shrink-0" aria-hidden />
          <span>{day}</span>
          <span aria-hidden>·</span>
          <span>{date}</span>
        </div>

        <div className="mt-auto flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[10px] font-semibold text-[var(--text)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            {openLabel}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-500/25 text-red-500 transition hover:bg-red-500/10"
            aria-label="Delete"
            title="Delete permanently"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </article>
  );
}
