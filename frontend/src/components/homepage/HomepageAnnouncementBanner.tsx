'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

const DISMISS_KEY = 'xroga_early_access_banner_dismissed_v1';

export function HomepageAnnouncementBanner({ href, label }: { href: string; label: string }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  if (dismissed) return null;

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* ignore */
    }
    setDismissed(true);
  }

  return (
    <div className="xv-hc-announcement" data-testid="homepage-announcement">
      <p className="xv-hc-announcement-text">
        <strong>Early Access</strong> — Xroga is in active testing. Build and test for free through August 30, 2026.
      </p>
      <Link href={href} className="xv-hc-announcement-cta">
        {label}
      </Link>
      <button type="button" onClick={dismiss} aria-label="Dismiss announcement" className="xv-hc-announcement-close">
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
