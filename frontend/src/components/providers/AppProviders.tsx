'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useAppStore } from '@/store/useAppStore';

const FETCH_TIMEOUT_MS = 8000;
const DEFAULT_TOKEN_LIMIT = 7_000_000;

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
    async function load() {
      const results = await Promise.allSettled([
        withTimeout(api.dashboard.summary()),
        withTimeout(api.notifications.unreadCount()),
        withTimeout(api.notifications.list()),
        withTimeout(api.profile.get()),
      ]);

      if (results[0].status === 'fulfilled') {
        const summary = results[0].value;
        const { tokens, billing } = summary;
        setTokenUsage({
          inputTokensUsed: tokens.inputUsed,
          outputTokensUsed: tokens.outputUsed,
          totalTokensUsed: tokens.totalUsed,
          inputTokensRemaining: tokens.inputRemaining,
          outputTokensRemaining: tokens.outputRemaining,
          totalTokensRemaining: tokens.totalRemaining,
          percentUsed: tokens.percentUsed,
          quotaPeriodStart: tokens.quotaPeriodStart,
          emergencyTokensAvailable: tokens.emergencyAvailable,
          emergencyTokensClaimedThisMonth: tokens.emergencyClaimed,
          totalLimit: tokens.totalLimit,
        });
        setPlanInfo(billing.planTier, billing.planName);
      } else {
        setTokenUsage({
          inputTokensUsed: 0,
          outputTokensUsed: 0,
          totalTokensUsed: 0,
          inputTokensRemaining: 4_700_000,
          outputTokensRemaining: 2_300_000,
          totalTokensRemaining: DEFAULT_TOKEN_LIMIT,
          percentUsed: 0,
          quotaPeriodStart: new Date().toISOString().slice(0, 10),
          emergencyTokensAvailable: false,
          emergencyTokensClaimedThisMonth: false,
          totalLimit: DEFAULT_TOKEN_LIMIT,
        });
      }
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
