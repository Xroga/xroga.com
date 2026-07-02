'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { removePendingVideoJob } from '@/lib/pendingVideoJobs';
import { VideoProductionAnimation } from './VideoProductionAnimation';
import { VideoStudioCard, type VideoOutputData } from './VideoStudioCard';

interface VideoJobPendingCardProps {
  jobId: string;
  message?: string;
  estimatedSeconds?: number;
  startedAt?: number;
  userPrompt?: string;
  messageId?: string;
  onResolved?: (output: VideoOutputData) => void;
  onFailed?: (error: string) => void;
}

export function VideoJobPendingCard({
  jobId,
  message,
  estimatedSeconds = 120,
  startedAt,
  userPrompt,
  messageId,
  onResolved,
  onFailed,
}: VideoJobPendingCardProps) {
  const [resolved, setResolved] = useState<VideoOutputData | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState(message);
  const [percent, setPercent] = useState<number | undefined>();

  useEffect(() => {
    let cancelled = false;

    let attempts = 0;

    async function poll() {
      try {
        const record = await api.videoJobs.get(jobId);
        attempts += 1;
        if (cancelled) return;

        if (!record) {
          if (attempts > 20) {
            setFailed('Video job expired. Please generate your video again.');
          }
          return;
        }

        if (record.progress?.message) {
          setProgressMessage(String(record.progress.message));
        }
        if (typeof record.progress?.percent === 'number') {
          setPercent(record.progress.percent);
        }

        if (record.status === 'completed' && record.output) {
          const out = record.output as Record<string, unknown>;
          if (typeof out.streamingUrl === 'string') {
            const video: VideoOutputData = {
              type: 'video_studio',
              title: typeof out.title === 'string' ? out.title : 'Your video',
              streamingUrl: out.streamingUrl,
              durationSeconds: typeof out.durationSeconds === 'number' ? out.durationSeconds : undefined,
              selectedProvider: typeof out.selectedProvider === 'string' ? out.selectedProvider : undefined,
              prompt: userPrompt,
            };
            removePendingVideoJob(jobId);
            setResolved(video);
            onResolved?.(video);
          }
        } else if (record.status === 'failed') {
          const err = record.error_message ?? 'Video generation failed';
          removePendingVideoJob(jobId);
          setFailed(err);
          onFailed?.(err);
        }
      } catch {
        /* retry */
      }
    }

    void poll();
    const id = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [jobId, onFailed, onResolved, userPrompt]);

  if (resolved) {
    return <VideoStudioCard data={resolved} messageId={messageId} />;
  }

  if (failed) {
    return (
      <p className="text-sm text-red-400 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2">
        {failed}
      </p>
    );
  }

  return (
    <VideoProductionAnimation
      message={progressMessage ?? 'Rendering your video…'}
      estimatedSeconds={estimatedSeconds}
      startedAt={startedAt ?? Date.now()}
      percent={percent}
      backgroundMode
      sublabel="Fetching your video — it will appear here automatically"
    />
  );
}
