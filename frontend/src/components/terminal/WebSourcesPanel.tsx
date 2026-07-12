'use client';

import { ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WebSourceItem {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  thumbnailUrl?: string;
  siteDomain?: string;
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return 'source';
  }
}

function faviconForDomain(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function displayDomain(item: WebSourceItem): string {
  return item.siteDomain || domainFromUrl(item.url);
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
    <div className={cn('mt-4 space-y-2.5', className)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
        Sources referenced
      </p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {sources.map((s) => {
          const domain = displayDomain(s);
          const showThumb = s.thumbnailUrl && domain.includes('youtube');
          return (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex gap-3 rounded-xl border border-[var(--card-border)]/80 bg-[var(--card)]/70 p-3 hover:border-[var(--accent)]/45 hover:bg-[var(--accent)]/[0.04] transition-all shadow-sm"
            >
              {showThumb ? (
                <img
                  src={s.thumbnailUrl}
                  alt=""
                  className="w-[4.5rem] h-[3.25rem] rounded-lg object-cover shrink-0 bg-black/20 ring-1 ring-black/10"
                />
              ) : (
                <div className="w-11 h-11 rounded-lg bg-white dark:bg-white/10 flex items-center justify-center shrink-0 ring-1 ring-black/5 dark:ring-white/10 overflow-hidden">
                  <img
                    src={faviconForDomain(domain)}
                    alt=""
                    className="w-6 h-6 object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-medium text-[var(--muted)] truncate">{domain}</span>
                  <ExternalLink className="w-3 h-3 opacity-40 group-hover:opacity-80 shrink-0 transition-opacity" />
                </div>
                <p className="text-[13px] font-semibold leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                  {s.title}
                </p>
                {s.snippet && (
                  <p className="text-[11px] text-[var(--muted)] line-clamp-2 mt-1 leading-relaxed">{s.snippet}</p>
                )}
                <p className="text-[10px] text-[var(--accent)]/70 truncate mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {s.url}
                </p>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
