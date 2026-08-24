'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import {
  loadPendingBuildJobs,
  removePendingBuildJob,
  updatePendingBuildSequence,
  type PendingBuildJob,
} from '@/lib/pendingBuildJobs';
import { showBuildBrowserNotification } from '@/lib/buildBrowserNotify';
import { useAppStore } from '@/store/useAppStore';
import { isRecoverableBuildOutput } from '@/lib/recoveredBuildOutput';

type BuildJobIdentity = Pick<
  PendingBuildJob,
  'assistantMessageId' | 'userMessageId' | 'userPrompt' | 'startedAt'
>;

type BuildCompleteHandler = (params: BuildJobIdentity & {
  output: Record<string, unknown>;
  runStatus: 'complete' | 'error';
}) => void;

type BuildRecoveryHandler = (params: BuildJobIdentity & {
  runId: string;
  status: string;
  events: NonNullable<Awaited<ReturnType<typeof api.swarm.getRun>>['events']>;
}) => void;

type BuildFailedHandler = (params: BuildJobIdentity & { error: string }) => void;

const POLL_MS = 8000;

export function useBackgroundBuildJobs(
  onBuildComplete?: BuildCompleteHandler,
  onBuildFailed?: BuildFailedHandler,
  onBuildRecovered?: BuildRecoveryHandler,
) {
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);
  const setNotifications = useAppStore((s) => s.setNotifications);
  const completeRef = useRef(onBuildComplete);
  const failedRef = useRef(onBuildFailed);
  const recoveredRef = useRef(onBuildRecovered);
  completeRef.current = onBuildComplete;
  failedRef.current = onBuildFailed;
  recoveredRef.current = onBuildRecovered;

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

      const legacyJobs: typeof pending = [];
      for (const job of pending) {
        const identity: BuildJobIdentity = {
          assistantMessageId: job.assistantMessageId,
          userMessageId: job.userMessageId,
          userPrompt: job.userPrompt,
          startedAt: job.startedAt,
        };
        if (!job.runId) {
          legacyJobs.push(job);
          continue;
        }
        try {
          const run = await api.swarm.getRun(job.runId, job.lastSequence ?? 0);
          const events = run.events ?? [];
          if (events.length) {
            recoveredRef.current?.({
              ...identity,
              runId: job.runId,
              status: run.status,
              events,
            });
            updatePendingBuildSequence(
              job.assistantMessageId,
              run.lastSequence ?? events[events.length - 1].sequence,
            );
          } else if (run.status === 'running') {
            recoveredRef.current?.({
              ...identity,
              runId: job.runId,
              status: run.status,
              events: [],
            });
          }
          if (run.status === 'complete' || run.status === 'completed') {
            removePendingBuildJob(job.assistantMessageId);
            showBuildBrowserNotification({
              title: 'Your Xroga project is complete!',
              body: 'The persisted build finished while you were away.',
              tag: `build-${job.runId}`,
            });
            completeRef.current?.({
              ...identity,
              runStatus: 'complete',
              output: (run.output && typeof run.output === 'object'
                ? run.output
                : {
                    type: 'chat',
                    content: 'The build completed, but its persisted result is unavailable.',
                  }) as Record<string, unknown>,
            });
          } else if (run.status === 'error' && isRecoverableBuildOutput(run.output)) {
            removePendingBuildJob(job.assistantMessageId);
            showBuildBrowserNotification({
              title: 'Your Xroga build finished with evidence',
              body: 'The generated work was restored. Review the exact shipping blocker in Workspace.',
              tag: `build-evidence-${job.runId}`,
            });
            completeRef.current?.({
              ...identity,
              runStatus: 'error',
              output: run.output,
            });
          } else if (run.status === 'error' || run.status === 'cancelled') {
            removePendingBuildJob(job.assistantMessageId);
            const output = run.output as { error?: string } | null;
            failedRef.current?.({
              ...identity,
              error:
                run.status === 'cancelled'
                  ? 'Build stopped.'
                  : output?.error ?? 'Build failed.',
            });
          }
        } catch {
          // A transient status-read failure is not a build failure. Keep the durable
          // run in local storage and try again on the next visibility/interval tick.
        }
      }

      if (!legacyJobs.length) return;
      const list = await refreshNotifications();
      if (!list.length) return;

      for (const job of legacyJobs) {
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
            userMessageId: job.userMessageId,
            userPrompt: job.userPrompt,
            startedAt: job.startedAt,
            runStatus: 'complete',
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
          failedRef.current?.({
            assistantMessageId: job.assistantMessageId,
            userMessageId: job.userMessageId,
            userPrompt: job.userPrompt,
            startedAt: job.startedAt,
            error: match.message,
          });
        }
      }
    }

    void pollOnce();
    const interval = setInterval(() => {
      void pollOnce();
    }, POLL_MS);
    const onNetworkRestored = () => void pollOnce();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void pollOnce();
    };
    window.addEventListener('xroga-network-restored', onNetworkRestored);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      window.removeEventListener('xroga-network-restored', onNetworkRestored);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [setNotifications, setUnreadCount]);
}
