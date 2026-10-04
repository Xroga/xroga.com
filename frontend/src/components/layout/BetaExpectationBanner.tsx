'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Lightbulb, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const DISMISSED_KEY = 'xroga-beta-banner-dismissed';

export function BetaExpectationBanner({ compact = false }: { compact?: boolean }) {
  const [visible, setVisible] = useState(false);
  const [stage, setStage] = useState<'expectations' | 'ideas'>('expectations');

  useEffect(() => {
    if (window.sessionStorage.getItem(DISMISSED_KEY) === '1') return;
    setVisible(true);
    const timer = window.setInterval(
      () => setStage((current) => current === 'expectations' ? 'ideas' : 'expectations'),
      7_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  if (!visible) return null;

  function dismiss() {
    window.sessionStorage.setItem(DISMISSED_KEY, '1');
    setVisible(false);
  }

  return (
    <aside className={cn('xv-beta-banner', compact && 'xv-beta-banner--compact')} aria-live="polite">
      <div key={stage} className="xv-beta-banner__message">
        {stage === 'expectations' ? (
          <span><strong>Xroga is live and open to explore</strong><span aria-hidden="true"> — </span>we’re still building, so some features may not work perfectly yet.</span>
        ) : (
          <span><strong>Have an idea for Xroga?</strong><span aria-hidden="true"> </span>Share it with us — we may build it next.</span>
        )}
      </div>
      {stage === 'ideas' ? (
        <Link href="/community?compose=feedback" className="xv-beta-banner__cta">
          <Lightbulb aria-hidden="true" /> Share Your Idea
        </Link>
      ) : null}
      <button type="button" className="xv-beta-banner__close" onClick={dismiss} aria-label="Dismiss Xroga notice">
        <X aria-hidden="true" />
      </button>
    </aside>
  );
}
