/**
 * LTX Video on HuggingFace — verified working free text-to-video (no API keys).
 * Always try this first before other OSS endpoints.
 */

import { callGradioSpace, videoUrlFromGradioResult } from './gradioSpaceClient.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';
import type { VideoGenerationResult } from '../videoProviders.js';

const LTX_SPACE = 'Lightricks/ltx-video-distilled';
const LTX_API = '/text_to_video';
const LTX_TIMEOUT_MS = 150_000;
const LTX_MAX_ATTEMPTS = 2;

async function wakeLtxSpace(): Promise<void> {
  const host = 'lightricks-ltx-video-distilled.hf.space';
  for (let i = 0; i < 3; i++) {
    try {
      await fetch(`https://${host}/`, { method: 'GET', signal: AbortSignal.timeout(12_000) });
    } catch {
      /* best-effort */
    }
    if (i < 2) await new Promise((r) => setTimeout(r, 3000));
  }
}

export async function generateLtxHfVideo(
  prompt: string,
  durationSeconds: number,
  aspectRatio: '9:16' | '16:9' = '16:9'
): Promise<VideoGenerationResult> {
  const clean = sanitizeVideoPrompt(prompt);
  const vertical = aspectRatio === '9:16';
  const dur = Math.min(Math.max(durationSeconds, 2), 4);

  const data = [
    clean.slice(0, 800),
    'worst quality, inconsistent motion, blurry, jittery, distorted',
    null,
    null,
    vertical ? 704 : 512,
    vertical ? 512 : 704,
    'text-to-video',
    dur,
    9,
    42,
    true,
    1,
    true,
  ];

  let lastErr = 'unknown';
  for (let attempt = 0; attempt < LTX_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      console.warn(`[LTX-HF] Retry ${attempt + 1}/${LTX_MAX_ATTEMPTS}`);
      await wakeLtxSpace();
    }

    try {
      const result = await callGradioSpace({
        spaceId: LTX_SPACE,
        apiName: LTX_API,
        data,
        label: 'hf-ltx-video',
        timeoutMs: LTX_TIMEOUT_MS,
      });

      const videoUrl = videoUrlFromGradioResult(result, LTX_SPACE);
      return { provider: 'hf-ltx-video', videoUrl, durationSeconds: dur };
    } catch (err) {
      lastErr = (err as Error).message;
      console.warn(`[LTX-HF] attempt ${attempt + 1}:`, lastErr.slice(0, 120));
    }
  }

  throw new Error(`LTX HF failed after ${LTX_MAX_ATTEMPTS} attempts: ${lastErr}`);
}
