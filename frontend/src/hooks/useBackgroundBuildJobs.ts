'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import {
  loadPendingBuildJobsForOwner,
  removePendingBuildJob,
  updatePendingBuildSequence,
  type PendingBuildJob,
} from '@/lib/pendingBuildJobs';
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
  replayedFromStart: boolean;
  events: NonNullable<Awaited<ReturnType<typeof api.swarm.getRun>>['events']>;
}) => void;

type BuildFailedHandler = (
  params: BuildJobIdentity & {
    error: string;
    runId?: string;
    code?: string;
    resumable?: boolean;
  },
) => void;

const POLL_MS = 8000;

export function useBackgroundBuildJobs(
  onBuildComplete?: BuildCompleteHandler,
  onBuildFailed?: BuildFailedHandler,
  onBuildRecovered?: BuildRecoveryHandler,
  ownerId?: string | null,
) {
  const setUnreadCount = useAppStore((s) => s.setUnreadCount);
  const setNotifications = useAppStore((s) => s.setNotifications);
  const completeRef = useRef(onBuildComplete);
  const failedRef = useRef(onBuildFailed);
  const recoveredRef = useRef(onBuildRecovered);
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;
  completeRef.current = onBuildComplete;
  failedRef.current = onBuildFailed;
  recoveredRef.current = onBuildRecovered;

  useEffect(() => {
    if (!ownerId) return;
    let cancelled = false;
    let polling = false;
    const replayedRuns = new Set<string>();
    const stale = () => cancelled || ownerRef.current !== ownerId;

    async function refreshNotifications() {
      try {
        const [count, list] = await Promise.all([
          api.notifications.unreadCount(),
          api.notifications.list(),
        ]);
        if (!stale()) {
          setUnreadCount(count.count);
          setNotifications(list.slice(0, 10));
        }
        return list;
      } catch {
        return [];
      }
    }

    async function pollOnce() {
      if (polling || stale()) return;
      const pending = loadPendingBuildJobsForOwner(ownerId);
      if (!pending.length) return;
      polling = true;
      try {
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
            const replayedFromStart = !replayedRuns.has(job.runId);
            const run = await api.swarm.getRun(job.runId, replayedFromStart ? 0 : job.lastSequence ?? 0);
            if (stale()) return;
            replayedRuns.add(job.runId);
            const events = run.events ?? [];
            if (events.length) {
              recoveredRef.current?.({
                ...identity,
                runId: job.runId,
                status: run.status,
                replayedFromStart,
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
                replayedFromStart,
                events: [],
              });
            }
            if (run.status === 'complete' || run.status === 'completed') {
              removePendingBuildJob(job.assistantMessageId);
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
              completeRef.current?.({
                ...identity,
                runStatus: 'error',
                output: run.output,
              });
            } else if (run.status === 'error' || run.status === 'cancelled') {
              removePendingBuildJob(job.assistantMessageId);

              const output = run.output as
                | {
                    error?: string;
                    code?: string;
                    resumable?: boolean;
                  }
                | null;

              failedRef.current?.({
                ...identity,
                runId: job.runId,
                code: output?.code,
                resumable:
                  output?.code === 'BUILD_INTERRUPTED' &&
                  output?.resumable === true,
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
        if (stale() || !list.length) return;

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
            failedRef.current?.({
              assistantMessageId: job.assistantMessageId,
              userMessageId: job.userMessageId,
              userPrompt: job.userPrompt,
              startedAt: job.startedAt,
              error: match.message,
            });
          }
        }
      } finally {
        polling = false;
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
  }, [ownerId, setNotifications, setUnreadCount]);
}
