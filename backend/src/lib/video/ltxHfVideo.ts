/**
 * LTX Video on HuggingFace — verified working free text-to-video (no API keys).
 * Always try this first before other OSS endpoints.
 */

import { callGradioSpace, videoUrlFromGradioResult } from './gradioSpaceClient.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';
import type { VideoGenerationResult } from '../videoProviders.js';

const LTX_SPACE = 'Lightricks/ltx-video-distilled';
const LTX_API = '/text_to_video';
const LTX_TIMEOUT_MS = 120_000;

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

  const result = await callGradioSpace({
    spaceId: LTX_SPACE,
    apiName: LTX_API,
    data,
    label: 'hf-ltx-video',
    timeoutMs: LTX_TIMEOUT_MS,
  });

  const videoUrl = videoUrlFromGradioResult(result, LTX_SPACE);
  return { provider: 'hf-ltx-video', videoUrl, durationSeconds: dur };
}
