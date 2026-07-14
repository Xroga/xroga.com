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
    async function load() {
      const results = await Promise.allSettled([
        withTimeout(api.dashboard.summary()),
        withTimeout(api.notifications.unreadCount()),
        withTimeout(api.notifications.list()),
        withTimeout(api.profile.get()),
      ]);

      if (results[0].status === 'fulfilled') {
        const parsed = tokenUsageFromSummary(results[0].value);
        if (parsed.usage) {
          setTokenUsage(parsed.usage);
          setPlanInfo(parsed.planTier, parsed.planName);
        }
        // Do NOT overwrite real usage with DEFAULT (0%) when the payload is unexpected.
      }
      // On summary fetch failure, keep the last known usage — never flash 0% after leave/return.
      if (results[1].status === 'fulfilled') setUnreadCount(results[1].value.count);
      if (results[2].status === 'fulfilled') setNotifications(results[2].value.slice(0, 5));
      if (results[3].status === 'fulfilled') setProfile(results[3].value);
    }
    load();
    const interval = setInterval(load, 120000);
    return () => clearInterval(interval);
  }, [setTokenUsage, setPlanInfo, setUnreadCount, setNotifications, setProfile]);

  return <>{children}</>;
}
