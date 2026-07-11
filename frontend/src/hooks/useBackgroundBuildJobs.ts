'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { loadPendingBuildJobs, removePendingBuildJob } from '@/lib/pendingBuildJobs';
import { showBuildBrowserNotification } from '@/lib/buildBrowserNotify';
import { useAppStore } from '@/store/useAppStore';

type BuildCompleteHandler = (params: {
  assistantMessageId: string;
  output: Record<string, unknown>;
}) => void;

const POLL_MS = 8000;

export function useBackgroundBuildJobs(
  onBuildComplete?: BuildCompleteHandler,
  onBuildFailed?: (assistantMessageId: string, error: string) => void
) {
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);
  const setNotifications = useAppStore((s) => s.setNotifications);
  const completeRef = useRef(onBuildComplete);
  const failedRef = useRef(onBuildFailed);
  completeRef.current = onBuildComplete;
  failedRef.current = onBuildFailed;

  useEffect(() => {
    let cancelled = false;

    async function refreshNotifications() {
      try {
        const [count, list] = await Promise.all([
          api.notifications.unreadCount(),
          api.notifications.list(),
        ]);
        if (!cancelled) {
          setUnreadCount(count.count);
          setNotifications(list.slice(0, 10));
        }
        return list;
      } catch {
        return [];
      }
    }

    async function pollOnce() {
      const pending = loadPendingBuildJobs();
      if (!pending.length) return;

      const list = await refreshNotifications();
      if (!list.length) return;

      for (const job of pending) {
        const match = list.find((n) => {
          const meta = n.metadata as Record<string, unknown> | undefined;
          return meta?.assistantMessageId === job.assistantMessageId;
        });
        if (!match) continue;

        const meta = match.metadata as Record<string, unknown> | undefined;
        const kind = meta?.kind;

        if (kind === 'build_ready') {
          removePendingBuildJob(job.assistantMessageId);
          showBuildBrowserNotification({
            title: match.title,
            body: match.message,
            tag: `build-${job.assistantMessageId}`,
          });
          completeRef.current?.({
            assistantMessageId: job.assistantMessageId,
            output: {
              type: 'landing_page',
              projectName: meta?.projectName,
              githubRepoUrl: meta?.githubRepoUrl,
              deployUrl: meta?.deployUrl,
              fileCount: meta?.fileCount,
              generatedFiles: undefined,
            },
          });
        } else if (kind === 'build_failed') {
          removePendingBuildJob(job.assistantMessageId);
          showBuildBrowserNotification({
            title: match.title,
            body: match.message,
            tag: `build-fail-${job.assistantMessageId}`,
          });
          failedRef.current?.(job.assistantMessageId, match.message);
        }
      }
    }

    void pollOnce();
    const interval = setInterval(() => {
      void pollOnce();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [setNotifications, setUnreadCount]);
}
