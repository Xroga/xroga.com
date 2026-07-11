'use client';

import { useEffect, useRef } from 'react';
import { api, type Notification } from '@/lib/api';
import { showBuildBrowserNotification } from '@/lib/buildBrowserNotify';
import { useAppStore } from '@/store/useAppStore';
import { loadPendingBuildJobs, removePendingBuildJob } from '@/lib/pendingBuildJobs';
import toast from 'react-hot-toast';

const SHOWN_KEY = 'xroga-shown-build-notifications';

function loadShownIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = sessionStorage.getItem(SHOWN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as string[];
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function markShown(id: string) {
  const shown = loadShownIds();
  shown.add(id);
  sessionStorage.setItem(SHOWN_KEY, JSON.stringify(Array.from(shown).slice(-40)));
}

function isBuildNotification(n: Notification): boolean {
  const kind = (n.metadata as Record<string, unknown> | undefined)?.kind;
  return kind === 'build_ready' || kind === 'build_failed';
}

/** Show browser + toast alerts when user returns after a background build completes. */
export function useBuildCompletionAlerts() {
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);
  const setNotifications = useAppStore((s) => s.setNotifications);
  const checkingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAlerts() {
      if (checkingRef.current) return;
      checkingRef.current = true;
      try {
        const [count, list] = await Promise.all([
          api.notifications.unreadCount(),
          api.notifications.list(),
        ]);
        if (cancelled) return;
        setUnreadCount(count.count);
        setNotifications(list.slice(0, 10));

        const shown = loadShownIds();
        for (const n of list) {
          if (!isBuildNotification(n) || n.read || shown.has(n.id)) continue;

          markShown(n.id);
          showBuildBrowserNotification({
            title: n.title,
            body: n.message,
            tag: `build-alert-${n.id}`,
          });

          const meta = n.metadata as Record<string, unknown> | undefined;
          const assistantMessageId =
            typeof meta?.assistantMessageId === 'string' ? meta.assistantMessageId : undefined;

          if (meta?.kind === 'build_ready') {
            toast.success(n.title, { duration: 8000 });
            if (assistantMessageId) removePendingBuildJob(assistantMessageId);
          } else if (meta?.kind === 'build_failed') {
            toast.error(n.message.slice(0, 160), { duration: 10000 });
            if (assistantMessageId) removePendingBuildJob(assistantMessageId);
          }

          void api.notifications.markRead(n.id).catch(() => {});
        }

        const pending = loadPendingBuildJobs();
        if (pending.length > 0) {
          for (const job of pending) {
            const match = list.find((n) => {
              const meta = n.metadata as Record<string, unknown> | undefined;
              return meta?.assistantMessageId === job.assistantMessageId;
            });
            if (match && !shown.has(match.id)) {
              /* handled in loop above on next tick */
            }
          }
        }
      } catch {
        /* ignore */
      } finally {
        checkingRef.current = false;
      }
    }

    void checkAlerts();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void checkAlerts();
    };
    const onFocus = () => void checkAlerts();

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => void checkAlerts(), 12000);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [setNotifications, setUnreadCount]);
}
