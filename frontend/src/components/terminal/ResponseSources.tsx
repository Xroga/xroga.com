'use client';

import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, BookOpenText, ChevronRight, X } from 'lucide-react';
import { safeSourceUrl } from '@/lib/xrogaCitations';
import type { WebSourceItem } from './WebSourcesPanel';

type NumberedSource = { item: WebSourceItem; number: number; url: string; domain: string };

function SourceTile({ source, compact = false }: { source: NumberedSource; compact?: boolean }) {
  return <div className="xv-source-tile group/source relative min-w-0">
    <a href={source.url} target="_blank" rel="noopener noreferrer" className="flex min-h-16 items-center gap-3 rounded-xl border border-[var(--card-border)]/75 bg-[var(--card)]/75 px-3.5 py-3 text-left transition-colors hover:border-blue-500/60 hover:bg-blue-500/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-xs font-bold text-blue-500">{source.number}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-medium text-[var(--muted)]">{source.domain}</span><span className={`${compact ? 'line-clamp-1' : 'line-clamp-2'} block text-sm font-semibold leading-snug text-[var(--foreground)] group-hover/source:text-blue-500`}>{source.item.title}</span></span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-[var(--muted)] group-hover/source:text-blue-500" aria-hidden="true" />
    </a>
    {source.item.snippet ? <div role="tooltip" className="pointer-events-none invisible absolute bottom-[calc(100%+8px)] left-0 z-30 w-[min(21rem,calc(100vw-2rem))] rounded-xl border border-blue-500/30 bg-[var(--card)] p-3.5 text-left opacity-0 shadow-xl transition-opacity group-hover/source:visible group-hover/source:opacity-100 group-focus-within/source:visible group-focus-within/source:opacity-100"><span className="block text-[11px] font-semibold uppercase tracking-wider text-blue-500">Source {source.number} · {source.domain}</span><span className="mt-1 block line-clamp-4 text-xs leading-relaxed text-[var(--foreground)]/80">{source.item.snippet}</span></div> : null}
  </div>;
}

export function ResponseSources({ sources }: { sources: WebSourceItem[] }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const numbered: NumberedSource[] = sources.flatMap((item, index) => {
    const url = safeSourceUrl(item.url);
    if (!url) return [];
    return [{ item, number: index + 1, url, domain: item.siteDomain || new URL(url).hostname.replace(/^www\./i, '') }];
  });

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const trigger = triggerRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab') return;
      const focusables = Array.from(document.querySelectorAll<HTMLElement>('[data-response-sources-dialog] a, [data-response-sources-dialog] button'));
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => { window.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow; trigger?.focus(); };
  }, [open]);

  if (!numbered.length) return null;
  return <section className="xv-response-sources mt-5 max-w-[920px]" aria-label="Sources">
    <div className="mb-2.5 flex items-center justify-between gap-3"><h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted)]"><BookOpenText className="h-4 w-4 text-blue-500" aria-hidden="true" /> Sources <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-blue-500">{numbered.length}</span></h3>{numbered.length > 4 ? <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-blue-500 hover:bg-blue-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500">View all <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" /></button> : null}</div>
    <div className="grid gap-2 sm:grid-cols-2">{numbered.slice(0, 4).map((source) => <SourceTile key={`${source.number}-${source.url}`} source={source} compact />)}</div>
    {open ? <div className="fixed inset-0 z-[100]" role="presentation"><button type="button" tabIndex={-1} aria-label="Close sources" onClick={() => setOpen(false)} className="absolute inset-0 h-full w-full bg-black/60" /><aside data-response-sources-dialog role="dialog" aria-modal="true" aria-label="All response sources" className="absolute inset-y-0 right-0 flex w-full max-w-[430px] flex-col border-l border-[var(--card-border)] bg-[var(--background)] shadow-2xl"><header className="flex items-center justify-between border-b border-[var(--card-border)] p-5"><div><p className="text-[11px] font-semibold uppercase tracking-widest text-blue-500">Evidence</p><h2 className="mt-1 text-lg font-semibold">All sources <span className="text-sm font-normal text-[var(--muted)]">({numbered.length})</span></h2></div><button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close sources panel" className="rounded-lg border border-[var(--card-border)] p-2 hover:bg-blue-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"><X className="h-4 w-4" /></button></header><div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">{numbered.map((source) => <SourceTile key={`${source.number}-${source.url}`} source={source} />)}</div></aside></div> : null}
  </section>;
}
