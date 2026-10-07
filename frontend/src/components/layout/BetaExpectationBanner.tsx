'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { MessageCircle, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DISMISSED_KEY = 'xroga-beta-banner-dismissed';

export function BetaExpectationBanner({ compact = false }: { compact?: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.sessionStorage.getItem(DISMISSED_KEY) === '1') return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  function dismiss() {
    window.sessionStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  return (
    <aside className={cn('xv-beta-banner', compact && 'xv-beta-banner--compact')}>
      <div className="xv-beta-banner__message">
        <span><strong>Early access</strong><span aria-hidden="true"> · </span>Some features are still improving.</span>
      </div>
      <Link href="/community?compose=feedback" className="xv-beta-banner__cta">
        <MessageCircle aria-hidden="true" /> Feedback
      </Link>
      <button type="button" className="xv-beta-banner__close" onClick={dismiss} aria-label="Dismiss Xroga notice">
        <X aria-hidden="true" />
      </button>
    </aside>
  );
}
