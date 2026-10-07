'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const TOP_NOTICE_DURATION_MS = 5_000;
const CORNER_NOTICE_SCROLL_Y = 96;

export function BetaExpectationBanner({ compact = false }: { compact?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [topExpired, setTopExpired] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setVisible(true);
    if (compact) return;

    const syncScrollState = () => setScrolled(window.scrollY > CORNER_NOTICE_SCROLL_Y);
    const timer = window.setTimeout(() => setTopExpired(true), TOP_NOTICE_DURATION_MS);
    syncScrollState();
    window.addEventListener('scroll', syncScrollState, { passive: true });

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('scroll', syncScrollState);
    };
  }, [compact]);

  if (!visible || (!compact && topExpired && !scrolled)) return null;

  function dismiss() {
    setVisible(false);
  }

  return (
    <aside
      className={cn(
        'xv-beta-banner',
        compact && 'xv-beta-banner--compact',
        !compact && !scrolled && 'xv-beta-banner--top',
        !compact && scrolled && 'xv-beta-banner--corner',
      )}
      aria-label="Xroga early access notice"
    >
      <AlertTriangle className="xv-beta-banner__alert-icon" aria-hidden="true" />
      <div className="xv-beta-banner__message">
        <span><strong>Early access</strong><span aria-hidden="true"> · </span>Xroga is live while we finish a few features.</span>
      </div>
      <Link href="/community?compose=feedback" className="xv-beta-banner__cta">
        <MessageCircle aria-hidden="true" /> Report an issue
      </Link>
      <button type="button" className="xv-beta-banner__close" onClick={dismiss} aria-label="Dismiss Xroga notice">
        <X aria-hidden="true" />
      </button>
    </aside>
  );
}
