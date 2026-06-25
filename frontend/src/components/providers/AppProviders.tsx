'use client';

import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';

const FETCH_TIMEOUT_MS = 8000;

async function withTimeout<T>(promise: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), ms)
    ),
  ]);
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const setActions = useAppStore((s) => s.setActions);
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);
  const setNotifications = useAppStore((s) => s.setNotifications);

  useEffect(() => {
    async function load() {
      const results = await Promise.allSettled([
        withTimeout(api.actions.balance()),
        withTimeout(api.notifications.unreadCount()),
        withTimeout(api.notifications.list()),
      ]);

      if (results[0].status === 'fulfilled') setActions(results[0].value);
      if (results[1].status === 'fulfilled') setUnreadCount(results[1].value.count);
      if (results[2].status === 'fulfilled') setNotifications(results[2].value.slice(0, 5));
    }
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, [setActions, setUnreadCount, setNotifications]);

  return (
    <>
      {children}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--card)',
            color: 'var(--foreground)',
            border: '1px solid var(--card-border)',
          },
        }}
      />
    </>
  );
}
