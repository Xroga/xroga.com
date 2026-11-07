'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { ArrowUpRight, BookOpenText, Check, ChevronRight, Copy, X } from 'lucide-react';
import { safeSourceUrl, sourceClickUrl } from '@/lib/xrogaCitations';
import type { WebSourceItem } from './WebSourcesPanel';
import { SourceLogo } from './SourceLogo';
import styles from './ResponseSources.module.css';

type VerifiedSource = { item: WebSourceItem; url: string; domain: string };

const externalImageLoader = ({ src }: { src: string }) => src;

function cleanExcerpt(value: string): string {
  const compact = value.replace(/\s+/g, ' ').replace(/^[\s*•-]+/, '').trim();
  return compact.length > 175 ? `${compact.slice(0, 172).trimEnd()}…` : compact;
}

function SourceTile({ source, compact = false }: { source: VerifiedSource; compact?: boolean }) {
  const [copied, setCopied] = useState(false);
  const thumbnail = source.item.thumbnailUrl ? safeSourceUrl(source.item.thumbnailUrl) : null;
  return <article className={styles.tile}>
    {thumbnail?.startsWith('https://') ? <span className={styles.thumbnail}><Image src={thumbnail} alt="Source page preview" width={84} height={72} loader={externalImageLoader} unoptimized /></span>
      : <SourceLogo domain={source.domain} size={42} className={styles.sourceLogo} />}
    <div className={styles.tileContent}>
      <span className={styles.kicker}><SourceLogo domain={source.domain} size={16} />{source.domain}</span>
      <a className={styles.title} href={sourceClickUrl(source.url) ?? source.url} target="_blank" rel="noopener noreferrer" aria-label={`Visit source: ${source.item.title}`}>{source.item.title}</a>
      {!compact && source.item.snippet ? <p className={styles.excerpt}>{cleanExcerpt(source.item.snippet)}</p> : null}
      {!compact ? <div className={styles.tileActions}><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(source.item.snippet || source.item.title); setCopied(true); } catch { setCopied(false); } }}><span>{copied ? <Check size={13} /> : <Copy size={13} />}</span>{copied ? 'Copied' : 'Copy excerpt'}</button><a href={sourceClickUrl(source.url) ?? source.url} target="_blank" rel="noopener noreferrer">Visit source <ArrowUpRight size={14} /></a></div> : null}
    </div>
    {compact ? <ArrowUpRight className={styles.arrow} size={17} aria-hidden="true" /> : null}
  </article>;
}

export function ResponseSources({ sources }: { sources: WebSourceItem[] }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const verified: VerifiedSource[] = sources.flatMap((item) => {
    const url = safeSourceUrl(item.url);
    if (!url) return [];
    return [{ item, url, domain: item.siteDomain || new URL(url).hostname.replace(/^www\./i, '') }];
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

  if (!verified.length) return null;
  return <section className={styles.root} aria-label="Sources">
    <div className={styles.header}>
      <div className={styles.headerTitle}><BookOpenText size={17} aria-hidden="true" /><span>Sources</span><span className={styles.count}>{verified.length}</span></div>
      {verified.length > 4 ? <button ref={triggerRef} type="button" onClick={() => setOpen(true)} className={styles.viewAll}>View all sources <ChevronRight size={16} aria-hidden="true" /></button> : null}
    </div>
    <div className={styles.grid}>{verified.slice(0, 4).map((source) => <SourceTile key={source.url} source={source} compact />)}</div>
    {open && typeof document !== 'undefined' ? createPortal(<div className={styles.overlay} role="presentation">
      <button type="button" tabIndex={-1} aria-label="Close sources" onClick={() => setOpen(false)} className={styles.scrim} />
      <aside data-response-sources-dialog role="dialog" aria-modal="true" aria-label="All response sources" className={styles.drawer}>
        <header className={styles.drawerHeader}><div><span className={styles.drawerEyebrow}>Research & evidence</span><h2>All sources <span>({verified.length})</span></h2><p>Read, copy, or visit the original pages behind this answer.</p></div><button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label="Close sources panel" className={styles.close}><X size={20} /></button></header>
        <div className={styles.drawerList}>{verified.map((source) => <SourceTile key={source.url} source={source} />)}</div>
      </aside>
    </div>, document.body) : null}
  </section>;
}
