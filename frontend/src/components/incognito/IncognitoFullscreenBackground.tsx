'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { useHydrated } from '@/hooks/useHydrated';

const INCOGNITO_GRAY = '#2b2b30';

/** Fixed full-viewport incognito backdrop — solid gray, no image */
export function IncognitoFullscreenBackground() {
  const hydrated = useHydrated();
  const incognitoRaw = usePrivacyStore((s) => s.incognito);
  const incognito = hydrated && incognitoRaw;
  const pathname = usePathname();
  const isDashboard = pathname === '/workspace' || pathname === '/workspace/';
  const active = incognito && isDashboard;

  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.backgroundColor;
    document.body.style.backgroundColor = INCOGNITO_GRAY;
    return () => {
      document.body.style.backgroundColor = prev;
    };
  }, [active]);

  if (!active || typeof document === 'undefined') return null;

  return createPortal(
    <div className="xv-incognito-fullscreen-bg xv-incognito-fullscreen-bg--gray" aria-hidden />,
    document.body
  );
}
