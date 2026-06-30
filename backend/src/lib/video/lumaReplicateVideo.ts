/** Luma Dream Machine via Replicate — fallback when direct LUMA_API_KEY fails */

import { sanitizeVideoPrompt } from './videoPrompt.js';
import { runReplicateModel } from './replicateClient.js';

export async function generateLumaReplicateVideo(
  prompt: string,
  _durationSeconds = 5,
  options?: { aspectRatio?: '9:16' | '16:9' }
): Promise<string> {
  const clean = sanitizeVideoPrompt(prompt);
  return runReplicateModel(
    'luma/dream-machine',
    {
      prompt: clean.slice(0, 2000),
      aspect_ratio: options?.aspectRatio === '9:16' ? '9:16' : '16:9',
    },
    'Luma-Replicate'
  );
}
