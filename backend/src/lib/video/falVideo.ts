/** Fal.ai — multi-model video (MiniMax, Kling, Luma, Wan) via single FAL_API_KEY */

import { getSecret } from '../../config/envSecrets.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';

interface FalModelConfig {
  id: string;
  buildInput: (
    prompt: string,
    durationSeconds: number,
    aspectRatio?: '9:16' | '16:9'
  ) => Record<string, unknown>;
}

const FAL_MODELS: FalModelConfig[] = [
  {
    id: 'fal-ai/minimax/video-01-live',
    buildInput: (prompt) => ({ prompt, prompt_optimizer: true }),
  },
  {
    id: 'fal-ai/kling-video/v2/master/text-to-video',
    buildInput: (prompt, durationSeconds, aspectRatio) => ({
      prompt,
      duration: durationSeconds >= 8 ? '10' : '5',
      aspect_ratio: aspectRatio ?? '16:9',
    }),
  },
  {
    id: 'fal-ai/luma-dream-machine',
    buildInput: (prompt, _durationSeconds, aspectRatio) => ({
      prompt,
      aspect_ratio: aspectRatio ?? '16:9',
    }),
  },
  {
    id: 'fal-ai/wan-t2v',
    buildInput: (prompt) => ({ prompt }),
  },
  {
    id: 'fal-ai/kling-video/v1.6/standard/text-to-video',
    buildInput: (prompt, durationSeconds, aspectRatio) => ({
      prompt,
      duration: durationSeconds >= 8 ? '10' : '5',
      aspect_ratio: aspectRatio ?? '16:9',
    }),
  },
];

interface FalQueued {
  request_id?: string;
  status_url?: string;
}

function extractVideoUrl(result: Record<string, unknown>): string | null {
  const video = result.video as { url?: string } | undefined;
  if (video?.url) return video.url;
  if (typeof result.video_url === 'string') return result.video_url;
  const output = result.output as { video?: { url?: string } } | undefined;
  if (output?.video?.url) return output.video.url;
  const data = result.data as { video?: { url?: string } } | undefined;
  if (data?.video?.url) return data.video.url;
  return null;
}

async function pollFalModel(apiKey: string, model: string, statusUrl: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const statusRes = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!statusRes.ok) throw new Error(`Fal status error: ${statusRes.status}`);
    const status = (await statusRes.json()) as {
      status: string;
      response_url?: string;
      video?: { url?: string };
    };

    const done = ['COMPLETED', 'completed', 'OK', 'ok'].includes(status.status);
    const failed = ['FAILED', 'failed', 'ERROR', 'error'].includes(status.status);

    if (done) {
      const direct = status.video?.url;
      if (direct) return direct;
      if (status.response_url) {
        const resultRes = await fetch(status.response_url, {
          headers: { Authorization: `Key ${apiKey}` },
        });
        const result = (await resultRes.json()) as Record<string, unknown>;
        const url = extractVideoUrl(result);
        if (url) return url;
      }
      throw new Error(`Fal ${model} completed but no video URL`);
    }
    if (failed) throw new Error(`Fal ${model} generation failed`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`Fal ${model} timed out`);
}

async function tryFalModel(
  apiKey: string,
  model: FalModelConfig,
  prompt: string,
  durationSeconds: number,
  aspectRatio?: '9:16' | '16:9'
): Promise<string> {
  const input = model.buildInput(prompt, durationSeconds, aspectRatio);

  const response = await fetch(`https://queue.fal.run/${model.id}`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Fal ${model.id} error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const queued = (await response.json()) as FalQueued;
  const statusUrl =
    queued.status_url ??
    (queued.request_id
      ? `https://queue.fal.run/${model.id}/requests/${queued.request_id}/status`
      : null);
  if (!statusUrl) throw new Error(`Fal ${model.id} returned no status URL`);

  return pollFalModel(apiKey, model.id, statusUrl);
}

export async function generateFalVideo(
  prompt: string,
  durationSeconds = 5,
  options?: { aspectRatio?: '9:16' | '16:9' }
): Promise<string> {
  const apiKey = getSecret('FAL_KEY');
  if (!apiKey) throw new Error('FAL_API_KEY not configured');

  const cleanPrompt = sanitizeVideoPrompt(prompt).slice(0, 2000);
  const errors: string[] = [];

  for (const model of FAL_MODELS) {
    try {
      return await tryFalModel(apiKey, model, cleanPrompt, durationSeconds, options?.aspectRatio);
    } catch (err) {
      errors.push(`${model.id}: ${(err as Error).message.slice(0, 80)}`);
    }
  }
  throw new Error(`All Fal models failed. ${errors.slice(0, 2).join(' | ')}`);
}
