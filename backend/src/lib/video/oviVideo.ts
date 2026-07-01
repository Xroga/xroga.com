/** Ovi — synchronized video + audio (Fal fal-ai/ovi, Replicate character-ai/ovi-i2v) */

import { getSecret, hasSecret } from '../../config/envSecrets.js';
import { generateImage } from '../../services/builder/imageGen.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';
import { runReplicateModel } from './replicateClient.js';

async function pollFalOvi(apiKey: string, statusUrl: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(statusUrl, {
      headers: { Authorization: `Key ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`Fal Ovi status error: ${res.status}`);
    const status = (await res.json()) as {
      status: string;
      response_url?: string;
      video?: { url?: string };
    };
    const done = ['COMPLETED', 'completed', 'OK', 'ok'].includes(status.status);
    const failed = ['FAILED', 'failed', 'ERROR', 'error'].includes(status.status);
    if (done) {
      if (status.video?.url) return status.video.url;
      if (status.response_url) {
        const resultRes = await fetch(status.response_url, {
          headers: { Authorization: `Key ${apiKey}` },
        });
        const result = (await resultRes.json()) as { video?: { url?: string } };
        if (result.video?.url) return result.video.url;
      }
      throw new Error('Fal Ovi completed but no video URL');
    }
    if (failed) throw new Error('Fal Ovi generation failed');
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Fal Ovi timed out');
}

/** Text-to-video with synchronized audio via Fal Ovi */
export async function generateOviFalVideo(
  prompt: string,
  _durationSeconds = 5,
  options?: { userId?: string }
): Promise<string> {
  const apiKey = getSecret('FAL_KEY');
  if (!apiKey) throw new Error('FAL_API_KEY not configured for Ovi');

  const clean = sanitizeVideoPrompt(prompt).slice(0, 1500);
  const response = await fetch('https://queue.fal.run/fal-ai/ovi', {
    method: 'POST',
    headers: {
      Authorization: `Key ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt: clean }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`Fal Ovi error ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }

  const queued = (await response.json()) as { request_id?: string; status_url?: string };
  const statusUrl =
    queued.status_url ??
    (queued.request_id
      ? `https://queue.fal.run/fal-ai/ovi/requests/${queued.request_id}/status`
      : null);
  if (!statusUrl) throw new Error('Fal Ovi returned no status URL');

  return pollFalOvi(apiKey, statusUrl);
}

/** Image+text Ovi via Replicate when Fal unavailable */
export async function generateOviReplicateVideo(
  prompt: string,
  options?: { userId?: string; keyframeUrl?: string }
): Promise<string> {
  if (!hasSecret('REPLICATE_API_TOKEN')) {
    throw new Error('REPLICATE_API_TOKEN not configured for Ovi');
  }

  let imageUrl = options?.keyframeUrl;
  if (!imageUrl) {
    const out = await generateImage(`Cinematic still: ${sanitizeVideoPrompt(prompt)}`, {
      userId: options?.userId,
      fast: true,
    });
    if (out.type === 'image_blocked' || !out.imageUrl) {
      throw new Error('Ovi Replicate needs a keyframe image');
    }
    imageUrl = out.imageUrl;
  }

  return runReplicateModel(
    'character-ai/ovi-i2v',
    { prompt: sanitizeVideoPrompt(prompt).slice(0, 1200), image: imageUrl },
    'Ovi'
  );
}

export async function generateOviVideo(
  prompt: string,
  durationSeconds = 5,
  options?: { userId?: string; keyframeUrl?: string }
): Promise<string> {
  if (hasSecret('FAL_KEY')) {
    try {
      return await generateOviFalVideo(prompt, durationSeconds, options);
    } catch (err) {
      console.warn('[Ovi] Fal failed:', (err as Error).message.slice(0, 100));
    }
  }
  return generateOviReplicateVideo(prompt, options);
}
