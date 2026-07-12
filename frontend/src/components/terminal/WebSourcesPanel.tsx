'use client';

import { ExternalLink, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WebSourceItem {
  title: string;
  url: string;
  snippet: string;
  source?: string;
  thumbnailUrl?: string;
  siteDomain?: string;
  channelTitle?: string;
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

function isYoutube(item: WebSourceItem): boolean {
  return item.source === 'youtube' || displayDomain(item).includes('youtube');
}

function SourceCard({ item }: { item: WebSourceItem }) {
  const domain = displayDomain(item);
  const yt = isYoutube(item);
  const channel = item.channelTitle ?? item.snippet.split('—')[0]?.trim();

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex gap-3 rounded-xl border border-[var(--card-border)]/80 bg-[var(--card)]/70 p-3 hover:border-[var(--accent)]/45 hover:bg-[var(--accent)]/[0.04] transition-all shadow-sm"
    >
      {item.thumbnailUrl ? (
        <div className="relative shrink-0">
          <img
            src={item.thumbnailUrl}
            alt=""
            className="w-[4.5rem] h-[3.25rem] rounded-lg object-cover bg-black/20 ring-1 ring-black/10"
          />
          {yt && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="rounded-full bg-black/55 p-1">
                <Play className="w-3 h-3 text-white fill-white" />
              </span>
            </span>
          )}
        </div>
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
          <span className="text-[10px] font-medium text-[var(--muted)] truncate">
            {yt && channel ? channel : domain}
          </span>
          <ExternalLink className="w-3 h-3 opacity-40 group-hover:opacity-80 shrink-0 transition-opacity" />
        </div>
        <p className="text-[13px] font-semibold leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
          {item.title}
        </p>
        {item.snippet && !yt && (
          <p className="text-[11px] text-[var(--muted)] line-clamp-2 mt-1 leading-relaxed">{item.snippet}</p>
        )}
        {yt && item.snippet.includes('—') && (
          <p className="text-[11px] text-[var(--muted)] line-clamp-2 mt-1 leading-relaxed">
            {item.snippet.split('—').slice(1).join('—').trim()}
          </p>
        )}
      </div>
    </a>
  );
}

export function WebSourcesPanel({
  sources,
  className,
}: {
  sources: WebSourceItem[];
  className?: string;
}) {
  if (!sources?.length) return null;

  const youtube = sources.filter(isYoutube).slice(0, 2);
  const web = sources.filter((s) => !isYoutube(s));

  return (
    <div className={cn('mt-4 space-y-3', className)}>
      {youtube.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
            <Play className="w-3 h-3 text-red-500/80" />
            Recommended on YouTube
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {youtube.map((s) => (
              <SourceCard key={s.url} item={s} />
            ))}
          </div>
        </div>
      )}
      {web.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            Sources referenced
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {web.map((s) => (
              <SourceCard key={s.url} item={s} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
