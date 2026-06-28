'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { INCOGNITO_BG_URL } from '@/lib/incognito';

/** Fixed full-viewport incognito backdrop — portaled to document.body */
export function IncognitoFullscreenBackground() {
  const incognito = usePrivacyStore((s) => s.incognito);
  const pathname = usePathname();
  const isDashboard = pathname === '/dashboard' || pathname === '/dashboard/';
  const active = incognito && isDashboard;

  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = '#000';
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, [active]);

  if (!active || typeof document === 'undefined') return null;

  return createPortal(
    <div className="xv-incognito-fullscreen-bg" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={INCOGNITO_BG_URL}
        alt=""
        className="xv-incognito-fullscreen-bg__image"
        fetchPriority="high"
      />
      <div className="xv-incognito-fullscreen-bg__shade" />
      <div className="xv-incognito-fullscreen-bg__vignette" />
    </div>,
    document.body
  );
}
