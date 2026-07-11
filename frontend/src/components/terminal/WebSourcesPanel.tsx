'use client';

import { ExternalLink, Globe, Video } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WebSourceItem {
  title: string;
  url: string;
  snippet: string;
  source: 'searxng' | 'tavily' | 'youtube' | string;
  thumbnailUrl?: string;
}

function sourceIcon(source: string) {
  if (source === 'youtube') return Video;
  return Globe;
}

function sourceLabel(source: string) {
  if (source === 'youtube') return 'YouTube';
  if (source === 'tavily') return 'Tavily';
  if (source === 'searxng') return 'Web';
  return 'Source';
}

export function WebSourcesPanel({
  sources,
  className,
}: {
  sources: WebSourceItem[];
  className?: string;
}) {
  if (!sources?.length) return null;

  return (
    <div className={cn('mt-3 space-y-2', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        Live sources
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {sources.slice(0, 6).map((s) => {
          const Icon = sourceIcon(s.source);
          return (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex gap-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card)]/60 p-2.5 hover:border-[var(--accent)]/40 transition-colors"
            >
              {s.thumbnailUrl ? (
                <img
                  src={s.thumbnailUrl}
                  alt=""
                  className="w-14 h-10 rounded-lg object-cover shrink-0 bg-black/20"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-[var(--accent)]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] font-semibold uppercase text-[var(--accent)]">
                    {sourceLabel(s.source)}
                  </span>
                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 shrink-0" />
                </div>
                <p className="text-xs font-medium line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                  {s.title}
                </p>
                {s.snippet && (
                  <p className="text-[10px] text-[var(--muted)] line-clamp-2 mt-0.5">{s.snippet}</p>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
