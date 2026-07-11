'use client';

import { useEffect, useState } from 'react';
import { RetroTvErrorPage } from './RetroTvErrorPage';

export function OfflineOverlay() {
  const [offline, setOffline] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOffline(!navigator.onLine);

    const handleOffline = () => setOffline(true);
    const handleOnline = () => setOffline(false);

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!mounted || !offline) return null;

  return (
    <div className="xv-offline-overlay" role="alert" aria-live="assertive">
      <RetroTvErrorPage
        screenText="NO SIGNAL"
        overlayDigits={['O', 'F', 'F']}
        title="Connection lost"
        description="You appear to be offline. Check your internet connection — we'll reconnect automatically when you're back online."
        backHref={undefined}
      />
    </div>
  );
}
