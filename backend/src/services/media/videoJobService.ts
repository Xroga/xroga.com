/**
 * Background video jobs — processing continues if user closes tab.
 */

import { getSupabaseAdmin } from '../../config/supabase.js';
import { produceVideo } from './videoStudio.js';
import { parseVideoDuration } from './videoUtils.js';
import { notifyVideoFailed, notifyVideoReady } from '../notificationService.js';
import type { SwarmProgressEvent } from '../../types/features.js';
import type { VideoStudioOutput } from '../../types/features.js';

export interface StartVideoJobInput {
  userId: string;
  prompt: string;
  projectId?: string;
  runId?: string;
  keyframeUrl?: string;
  metadata?: {
    assistantMessageId?: string;
    userMessageId?: string;
    userPrompt?: string;
  };
  onProgress?: (event: SwarmProgressEvent) => void;
}

export interface VideoJobRecord {
  id: string;
  status: 'processing' | 'completed' | 'failed';
  prompt: string;
  estimated_seconds: number;
  progress: Record<string, unknown>;
  output?: VideoStudioOutput;
  error_message?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  completed_at?: string;
}

const memoryJobs = new Map<string, VideoJobRecord>();
const progressCallbacks = new Map<string, (event: SwarmProgressEvent) => void>();

function isMissingTable(message: string): boolean {
  return /schema cache|could not find the table|does not exist|relation.*does not exist/i.test(message);
}

export function estimateVideoJobSeconds(prompt: string): number {
  const dur = parseVideoDuration(prompt);
  if (dur <= 5) return 90;
  if (dur <= 10) return 120;
  if (dur <= 15) return 180;
  if (dur <= 30) return 240;
  return 300;
}

export function formatEtaLabel(seconds: number): string {
  if (seconds < 60) return `~${seconds}s`;
  const mins = Math.ceil(seconds / 60);
  return mins === 1 ? '~1 min' : `~${mins} min`;
}

function mapProgress(step: string, message: string): Record<string, unknown> {
  const phaseMap: Record<string, number> = {
    scripting: 10,
    rendering: 45,
    audio: 75,
    assembling: 88,
    complete: 100,
  };
  return {
    step,
    message,
    percent: phaseMap[step] ?? 30,
    updatedAt: new Date().toISOString(),
  };
}

async function persistJobPatch(jobId: string, patch: Partial<VideoJobRecord>) {
  const existing = memoryJobs.get(jobId);
  if (existing) {
    memoryJobs.set(jobId, { ...existing, ...patch });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('video_generation_jobs').update(patch).eq('id', jobId);
  if (error && !isMissingTable(error.message)) {
    console.warn('[VideoJob] persist patch:', error.message);
  }
}

async function runVideoJob(jobId: string, input: StartVideoJobInput) {
  const onProgress = progressCallbacks.get(jobId) ?? input.onProgress;

  try {
    const output = await produceVideo(input.userId, input.prompt, {
      projectId: input.projectId,
      runId: input.runId,
      keyframeUrl: input.keyframeUrl,
      onProgress: (step: string, message: string, detail?: string) => {
        const progress = mapProgress(step, detail ?? message);
        void persistJobPatch(jobId, { progress });
        onProgress?.({
          runId: jobId,
          agent: 'omni_reality',
          status: 'building',
          message: detail ?? message,
          videoStep: step as SwarmProgressEvent['videoStep'],
          timestamp: new Date().toISOString(),
        });
      },
      onOmniEvent: (event: { phase: string; message: string; detail?: string }) => {
        onProgress?.({
          runId: jobId,
          agent: 'omni_reality',
          status: 'building',
          message: event.detail ?? event.message,
          omniPhase: event.phase,
          omniDetail: event.detail,
          timestamp: new Date().toISOString(),
        });
      },
    });

    await persistJobPatch(jobId, {
      status: 'completed',
      output,
      progress: mapProgress('complete', 'Your video is ready'),
      completed_at: new Date().toISOString(),
    });

    await notifyVideoReady(input.userId, {
      jobId,
      title: output.title,
      prompt: input.metadata?.userPrompt ?? input.prompt,
      streamingUrl: output.streamingUrl,
      assistantMessageId: input.metadata?.assistantMessageId,
      durationSeconds: output.durationSeconds,
      outputFormat: output.outputFormat,
    });
  } catch (err) {
    const errorMessage = (err as Error).message;
    await persistJobPatch(jobId, {
      status: 'failed',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    });
    await notifyVideoFailed(input.userId, {
      jobId,
      prompt: input.metadata?.userPrompt ?? input.prompt,
      error: errorMessage,
      assistantMessageId: input.metadata?.assistantMessageId,
    });
  } finally {
    progressCallbacks.delete(jobId);
  }
}

export async function startVideoJob(input: StartVideoJobInput): Promise<{
  jobId: string;
  estimatedSeconds: number;
  etaLabel: string;
}> {
  const jobId = crypto.randomUUID();
  const estimatedSeconds = estimateVideoJobSeconds(input.prompt);
  const record: VideoJobRecord = {
    id: jobId,
    status: 'processing',
    prompt: input.prompt,
    estimated_seconds: estimatedSeconds,
    progress: mapProgress('scripting', 'Queued — starting video generation…'),
    metadata: input.metadata ?? {},
    created_at: new Date().toISOString(),
  };

  memoryJobs.set(jobId, record);

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('video_generation_jobs').insert({
    id: jobId,
    user_id: input.userId,
    prompt: input.prompt,
    status: 'processing',
    estimated_seconds: estimatedSeconds,
    keyframe_url: input.keyframeUrl ?? null,
    metadata: input.metadata ?? {},
    progress: record.progress,
  });

  if (error && !isMissingTable(error.message)) {
    console.warn('[VideoJob] insert failed:', error.message);
  }

  if (input.onProgress) {
    progressCallbacks.set(jobId, input.onProgress);
  }

  setImmediate(() => {
    void runVideoJob(jobId, input);
  });

  return { jobId, estimatedSeconds, etaLabel: formatEtaLabel(estimatedSeconds) };
}

export async function getVideoJob(userId: string, jobId: string): Promise<VideoJobRecord | null> {
  const mem = memoryJobs.get(jobId);
  if (mem) return mem;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('video_generation_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as VideoJobRecord;
}

export async function listActiveVideoJobs(userId: string): Promise<VideoJobRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('video_generation_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'processing')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    if (isMissingTable(error.message)) {
      return [...memoryJobs.values()].filter((j) => j.status === 'processing');
    }
    return [];
  }
  return (data ?? []) as VideoJobRecord[];
}
