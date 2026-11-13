'use client';

import React, { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { citationMetadata, safeSourceUrl, sourceClickUrl, type CitationSource } from '@/lib/xrogaCitations';
import { GoogleIcon } from '../auth/AuthGoogleIcon';
import { useInlineCitation } from './ResponseSourceScope';
import { SourceLogo } from './SourceLogo';
import styles from './SourceCitation.module.css';

export type CitationPage = Pick<CitationSource, 'title' | 'url' | 'siteName'>;

function CitationIcon({ domain, size }: { domain: string; size: number }) {
  // Reuse the existing Google mark only for these exact Google-owned sites.
  return ['google.com', 'support.google.com', 'ads.google.com'].includes(domain)
    ? <span className={styles.mark} style={{ width: size, height: size }}><GoogleIcon /></span>
    : <SourceLogo domain={domain} size={size} />;
}

export function SourceCitation({ source, number, label, showTitle = false, referral = false }: {
  source: CitationPage;
  number?: number;
  label?: ReactNode;
  showTitle?: boolean;
  referral?: boolean;
}) {
  const id = useId();
  const link = useRef<HTMLAnchorElement>(null);
  const preview = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const url = safeSourceUrl(source.url);
  useInlineCitation(showTitle ? null : url);
  const keepOpen = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const dismiss = () => { keepOpen(); closeTimer.current = setTimeout(() => setOpen(false), 160); };

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  useEffect(() => {
    if (!open || !link.current || !preview.current) return;
    const anchor = link.current;
    const card = preview.current;
    const position = () => {
      const bounds = anchor.getBoundingClientRect();
      const theme = anchor.closest<HTMLElement>('[data-theme]')?.dataset.theme;
      card.dataset.theme = theme ? (/^(dark|black|gray)$/.test(theme) ? 'dark' : 'light') : '';
      const viewport = window.visualViewport;
      const { clientWidth, clientHeight } = document.documentElement;
      const edge = 8;
      const gap = 6;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportRight = viewportLeft + (viewport?.width ?? clientWidth);
      const viewportBottom = viewportTop + (viewport?.height ?? clientHeight);
      card.style.maxWidth = `min(17rem, ${Math.max(0, viewportRight - viewportLeft - 2 * edge)}px)`;
      const { width, height } = card.getBoundingClientRect();
      const below = bounds.bottom + gap;
      const above = bounds.top - height - gap;
      const top = below + height <= viewportBottom - edge ? below : above;
      if (bounds.bottom <= viewportTop || bounds.top >= viewportBottom ||
          bounds.right <= viewportLeft || bounds.left >= viewportRight || top < viewportTop + edge) {
        setOpen(false);
        return;
      }
      const left = getComputedStyle(anchor).direction === 'rtl' ? bounds.right - width : bounds.left;
      card.style.left = Math.max(viewportLeft + edge, Math.min(left, viewportRight - width - edge)) + 'px';
      card.style.top = top + 'px';
      card.style.visibility = 'visible';
    };
    const onScroll = () => setOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', onScroll, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', onScroll);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', onScroll, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', onScroll);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, url]);

  if (!url) return <>{label ?? (number ? `[${number}]` : source.title)}</>;
  const { domain, site, title } = citationMetadata(source, url);
  return <>
    <a ref={link} data-source-citation className={`${styles.chip} ${label || showTitle ? styles.named : ''}`}
      href={(referral ? sourceClickUrl(url) : url) ?? url} target="_blank" rel="noopener noreferrer"
      aria-label={number ? `Open source ${number}: ${title}` : `${label ? 'Open link' : 'Open source'}: ${title}`}
      aria-describedby={open ? id : undefined}
      onPointerEnter={event => { if (event.pointerType !== 'touch') { keepOpen(); setOpen(true); } }}
      onPointerLeave={() => { if (document.activeElement !== link.current) dismiss(); }}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) { keepOpen(); setOpen(true); } }}
      onBlur={dismiss}>
      <CitationIcon domain={domain} size={13} />
      <span className={styles.label}>{label ?? (showTitle ? title : site)}</span>
    </a>
    {open && createPortal(
      <span className={styles.preview} id={id} ref={preview} role="tooltip"
        onPointerEnter={keepOpen} onPointerLeave={() => { if (document.activeElement !== link.current) dismiss(); }}>
        <span className={styles.site}><CitationIcon domain={domain} size={16} /><span>{site}</span></span>
        {title !== site ? <strong>{title}</strong> : null}
      </span>, document.body,
    )}
  </>;
}
