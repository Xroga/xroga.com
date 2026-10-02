'use client';

import { ExternalLink, Globe2, Play } from 'lucide-react';
import Image from 'next/image';
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
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
}

function displayDomain(item: WebSourceItem): string {
  return item.siteDomain || domainFromUrl(item.url);
}

function isYoutube(item: WebSourceItem): boolean {
  return item.source === 'youtube' || displayDomain(item).includes('youtube');
}

const externalImageLoader = ({ src }: { src: string }) => src;

function SourceRow({ item }: { item: WebSourceItem }) {
  const domain = displayDomain(item);
  const youtube = isYoutube(item);
  const sourceLabel = youtube && item.channelTitle ? item.channelTitle : domain;

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-w-0 items-start gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--foreground)]/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/45"
    >
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--foreground)]/[0.045]">
        {youtube ? (
          <Play className="h-3 w-3 text-red-500/80" aria-hidden="true" />
        ) : (
          <Image
            src={faviconForDomain(domain)}
            alt=""
            width={16}
            height={16}
            loader={externalImageLoader}
            unoptimized
            className="h-4 w-4 object-contain"
            onError={(event) => {
              (event.target as HTMLImageElement).style.display = 'none';
            }}
          />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[11px] text-[var(--muted)]">{sourceLabel}</span>
          <ExternalLink
            className="h-3 w-3 shrink-0 opacity-35 transition-opacity group-hover:opacity-70"
            aria-hidden="true"
          />
        </span>
        <span className="mt-0.5 block text-[12px] font-medium leading-snug text-[var(--foreground)]/82">
          {item.title}
        </span>
        {item.snippet ? (
          <span className="mt-0.5 block line-clamp-2 text-[11px] leading-relaxed text-[var(--muted)]">
            {item.snippet}
          </span>
        ) : null}
      </span>
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

  return (
    <details className={cn('group/sources mt-3 max-w-2xl', className)}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md px-1 py-1 text-[11px] font-medium text-[var(--foreground)]/55 transition-colors hover:text-[var(--foreground)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/45 [&::-webkit-details-marker]:hidden">
        <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Sources</span>
        <span className="tabular-nums text-[var(--foreground)]/38">{sources.length}</span>
      </summary>
      <div className="mt-1.5 max-w-xl space-y-0.5 border-l border-[var(--border-subtle)] pl-2">
        {sources.map((source) => (
          <SourceRow key={source.url} item={source} />
        ))}
      </div>
    </details>
  );
}
