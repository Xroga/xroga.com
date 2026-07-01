'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { loadPendingVideoJobs, removePendingVideoJob } from '@/lib/pendingVideoJobs';
import { addMediaItem } from '@/lib/mediaStorage';
import { useAppStore } from '@/store/useAppStore';
import type { ChatMessage } from '@/context/TerminalChatContext';

type JobCompleteHandler = (params: {
  jobId: string;
  assistantMessageId: string;
  output: Record<string, unknown>;
  messages: ChatMessage[];
}) => void;

const POLL_MS = 5000;

export function useBackgroundVideoJobs(
  onJobComplete?: JobCompleteHandler,
  onJobFailed?: (jobId: string, assistantMessageId: string, error: string) => void
) {
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);
  const setNotifications = useAppStore((s) => s.setNotifications);
  const handlerRef = useRef(onJobComplete);
  const failedRef = useRef(onJobFailed);
  handlerRef.current = onJobComplete;
  failedRef.current = onJobFailed;

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
      } catch {
        /* ignore */
      }
    }

    async function pollOnce() {
      const pending = loadPendingVideoJobs();
      if (!pending.length) return;

      for (const job of pending) {
        try {
          const record = await api.videoJobs.get(job.jobId);
          if (record.status === 'processing') continue;

          removePendingVideoJob(job.jobId);

          if (record.status === 'completed' && record.output) {
            const output = record.output as Record<string, unknown>;
            handlerRef.current?.({
              jobId: job.jobId,
              assistantMessageId: job.assistantMessageId,
              output: { ...output, type: 'video_studio', prompt: job.userPrompt },
              messages: [],
            });
            if (typeof output.streamingUrl === 'string') {
              addMediaItem({
                name: String(output.title ?? 'Xroga video').slice(0, 40),
                type: 'video',
                url: output.streamingUrl,
                sourceMessageId: job.assistantMessageId,
                sourcePrompt: job.userPrompt,
              });
            }
            await refreshNotifications();
          } else if (record.status === 'failed') {
            failedRef.current?.(
              job.jobId,
              job.assistantMessageId,
              record.error_message ?? 'Video generation failed'
            );
            await refreshNotifications();
          }
        } catch {
          /* keep polling */
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
