/** Fal.ai — multi-model video (MiniMax, Kling, Luma) via single FAL_API_KEY */

import { getSecret } from '../../config/envSecrets.js';

const FAL_MODELS = [
  'fal-ai/minimax/video-01-live',
  'fal-ai/kling-video/v1/standard/text-to-video',
  'fal-ai/luma-dream-machine',
  'fal-ai/wan-t2v',
] as const;

interface FalQueued {
  request_id?: string;
  status_url?: string;
}

async function pollFalModel(
  apiKey: string,
  model: string,
  statusUrl: string
): Promise<string> {
  for (let i = 0; i < 40; i++) {
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

    if (status.status === 'COMPLETED') {
      if (status.video?.url) return status.video.url;
      if (status.response_url) {
        const resultRes = await fetch(status.response_url, {
          headers: { Authorization: `Key ${apiKey}` },
        });
        const result = (await resultRes.json()) as {
          video?: { url?: string };
          video_url?: string;
          output?: { video?: { url?: string } };
        };
        const url =
          result.video?.url ??
          result.video_url ??
          result.output?.video?.url;
        if (url) return url;
      }
      throw new Error(`Fal ${model} completed but no video URL`);
    }
    if (status.status === 'FAILED') throw new Error(`Fal ${model} generation failed`);
    await new Promise((r) => setTimeout(r, 2500));
  }
  throw new Error(`Fal ${model} timed out`);
}

async function tryFalModel(
  apiKey: string,
  model: string,
  prompt: string,
  durationSeconds: number,
  aspectRatio?: '9:16' | '16:9'
): Promise<string> {
  const input: Record<string, unknown> = {
    prompt: prompt.slice(0, 2000),
    duration: Math.min(durationSeconds, 10),
  };
  if (aspectRatio === '9:16') {
    input.aspect_ratio = '9:16';
  } else if (aspectRatio === '16:9') {
    input.aspect_ratio = '16:9';
  }

  const response = await fetch(`https://queue.fal.run/${model}`, {
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
    throw new Error(`Fal ${model} error ${response.status}: ${errText.slice(0, 200)}`);
  }

  const queued = (await response.json()) as FalQueued;
  const statusUrl =
    queued.status_url ??
    (queued.request_id
      ? `https://queue.fal.run/${model}/requests/${queued.request_id}/status`
      : null);
  if (!statusUrl) throw new Error(`Fal ${model} returned no status URL`);

  return pollFalModel(apiKey, model, statusUrl);
}

export async function generateFalVideo(
  prompt: string,
  durationSeconds = 5,
  options?: { aspectRatio?: '9:16' | '16:9' }
): Promise<string> {
  const apiKey = getSecret('FAL_KEY');
  if (!apiKey) throw new Error('FAL_API_KEY not configured');

  const errors: string[] = [];
  for (const model of FAL_MODELS) {
    try {
      return await tryFalModel(apiKey, model, prompt, durationSeconds, options?.aspectRatio);
    } catch (err) {
      errors.push(`${model}: ${(err as Error).message.slice(0, 80)}`);
    }
  }
  throw new Error(`All Fal models failed. ${errors.slice(0, 2).join(' | ')}`);
}
