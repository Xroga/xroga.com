'use client';

import { useEffect, useState } from 'react';
import { Loader2, WifiOff } from 'lucide-react';

type ConnectionState = 'online' | 'offline' | 'reconnecting';

export function OfflineOverlay() {
  const [connection, setConnection] = useState<ConnectionState>('online');

  useEffect(() => {
    setConnection(navigator.onLine ? 'online' : 'offline');

    const handleOffline = () => setConnection('offline');
    const handleOnline = () => {
      setConnection('reconnecting');
      window.dispatchEvent(new CustomEvent('xroga-network-restored'));
      window.setTimeout(() => setConnection('online'), 1800);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (connection === 'online') return null;

  return (
    <div
      className="xv-connection-indicator"
      data-state={connection}
      role="status"
      aria-live="polite"
      data-testid="connection-indicator"
    >
      {connection === 'offline' ? (
        <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Loader2
          className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      )}
      <span>
        {connection === 'offline'
          ? 'Offline â€” your workspace and draft remain available.'
          : 'Reconnecting to live workâ€¦'}
      </span>
    </div>
  );
}
