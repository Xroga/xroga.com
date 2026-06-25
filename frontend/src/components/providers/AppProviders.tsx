'use client';

import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';

export function AppProviders({ children }: { children: React.ReactNode }) {
  const setActions = useAppStore((s) => s.setActions);
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);
  const setNotifications = useAppStore((s) => s.setNotifications);

  useEffect(() => {
    async function load() {
      try {
        const [balance, notifCount, notifications] = await Promise.all([
          api.actions.balance(),
          api.notifications.unreadCount(),
          api.notifications.list(),
        ]);
        setActions(balance);
        setUnreadCount(notifCount.count);
        setNotifications(notifications.slice(0, 5));
      } catch {
        // API may be unavailable without credentials
      }
    }
    load();
    const interval = setInterval(load, 60000);
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
