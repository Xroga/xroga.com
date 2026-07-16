'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';
import { usePrivacyStore } from '@/store/usePrivacyStore';
import { tokenUsageFromSummary } from '@/lib/tokenUsageFromSummary';

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
  const setTokenUsage = useAppStore((s) => s.setTokenUsage);
  const setPlanInfo = useAppStore((s) => s.setPlanInfo);
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);
  const setNotifications = useAppStore((s) => s.setNotifications);
  const setProfile = useAppStore((s) => s.setProfile);

  useEffect(() => {
    usePrivacyStore.getState().setXrogaAutoMode(true);
    usePrivacyStore.getState().setConfirmationMode('auto');
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCore() {
      // Tokens first — everything else can wait so refresh feels instant
      try {
        const summary = await withTimeout(api.dashboard.summary());
        if (cancelled) return;
        const parsed = tokenUsageFromSummary(summary);
        if (parsed.usage) {
          setTokenUsage(parsed.usage);
          setPlanInfo(parsed.planTier, parsed.planName);
        }
      } catch {
        /* keep last known usage */
      }
    }

    async function loadSecondary() {
      const results = await Promise.allSettled([
        withTimeout(api.notifications.unreadCount()),
        withTimeout(api.notifications.list()),
        withTimeout(api.profile.get()),
      ]);
      if (cancelled) return;
      if (results[0].status === 'fulfilled') setUnreadCount(results[0].value.count);
      if (results[1].status === 'fulfilled') setNotifications(results[1].value.slice(0, 5));
      if (results[2].status === 'fulfilled') setProfile(results[2].value);
    }

    void loadCore().then(() => {
      if (cancelled) return;
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (
          window as Window & { requestIdleCallback: (cb: () => void) => number }
        ).requestIdleCallback(() => void loadSecondary());
      } else {
        globalThis.setTimeout(() => void loadSecondary(), 400);
      }
    });

    const interval = setInterval(() => {
      void loadCore();
      void loadSecondary();
    }, 180000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setTokenUsage, setPlanInfo, setUnreadCount, setNotifications, setProfile]);

  return <>{children}</>;
}
