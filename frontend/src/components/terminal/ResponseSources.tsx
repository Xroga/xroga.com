'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { ArrowUpRight, BookOpenText, ChevronRight, X } from 'lucide-react';
import { safeSourceUrl } from '@/lib/xrogaCitations';
import type { WebSourceItem } from './WebSourcesPanel';
import styles from './ResponseSources.module.css';

type NumberedSource = { item: WebSourceItem; number: number; url: string; domain: string };

const externalImageLoader = ({ src }: { src: string }) => src;

function cleanExcerpt(value: string): string {
  const compact = value.replace(/\s+/g, ' ').replace(/^[\s*•-]+/, '').trim();
  return compact.length > 175 ? `${compact.slice(0, 172).trimEnd()}…` : compact;
}

function SourceTile({ source, compact = false }: { source: NumberedSource; compact?: boolean }) {
  const [iconBroken, setIconBroken] = useState(false);
  const thumbnail = source.item.thumbnailUrl ? safeSourceUrl(source.item.thumbnailUrl) : null;
  return <a href={source.url} target="_blank" rel="noopener noreferrer" className={styles.tile} aria-label={`Open source ${source.number}: ${source.item.title}`}>
    {thumbnail ? <span className={styles.thumbnail}><Image src={thumbnail} alt="" width={84} height={72} loader={externalImageLoader} unoptimized /></span>
      : <span className={styles.monogram} aria-hidden="true">{iconBroken ? source.domain.charAt(0).toUpperCase() : <Image src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(source.domain)}&sz=64`} alt="" width={27} height={27} loader={externalImageLoader} unoptimized onError={() => setIconBroken(true)} />}</span>}
    <span className={styles.tileContent}>
      <span className={styles.kicker}><span className={styles.sourceNumber}>{source.number}</span>{source.domain}</span>
      <span className={styles.title}>{source.item.title}</span>
      {!compact && source.item.snippet ? <span className={styles.excerpt}>{cleanExcerpt(source.item.snippet)}</span> : null}
    </span>
    <ArrowUpRight className={styles.arrow} size={17} aria-hidden="true" />
  </a>;
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
      if (event.key === 'Escape') { setOpen(false); return; }
      if (event.key !== 'Tab') return;
      const dialog = document.querySelector<HTMLElement>('[data-response-sources-dialog]');
      const focusables = Array.from(dialog?.querySelectorAll<HTMLElement>('a, button') ?? []);
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
  return <section className={styles.root} aria-label="Sources">
    <div className={styles.header}>
      <div className={styles.headerTitle}><BookOpenText size={17} aria-hidden="true" /><span>Sources</span><span className={styles.count}>{numbered.length}</span></div>
      {numbered.length > 4 ? <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={styles.viewAll}>View all sources <ChevronRight size={16} aria-hidden="true" /></button> : null}
    </div>
    <div className={styles.grid}>{numbered.slice(0, 4).map((source) => <SourceTile key={`${source.number}-${source.url}`} source={source} compact />)}</div>
    {open && typeof document !== 'undefined' ? createPortal(<div className={styles.overlay} role="presentation">
      <button type="button" tabIndex={-1} aria-label="Close sources" onClick={() => setOpen(false)} className={styles.scrim} />
      <aside data-response-sources-dialog role="dialog" aria-modal="true" aria-label="All response sources" className={styles.drawer}>
        <header className={styles.drawerHeader}><div><span className={styles.drawerEyebrow}>Research & evidence</span><h2>All sources <span>({numbered.length})</span></h2><p>Open the original pages behind this answer.</p></div><button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close sources panel" className={styles.close}><X size={20} /></button></header>
        <div className={styles.drawerList}>{numbered.map((source) => <SourceTile key={`${source.number}-${source.url}`} source={source} />)}</div>
      </aside>
    </div>, document.body) : null}
  </section>;
}
