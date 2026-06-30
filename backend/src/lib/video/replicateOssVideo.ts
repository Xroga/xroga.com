/**
 * OSS video models via Replicate — Wan 2.2, CogVideoX, Zeroscope workhorse tier.
 */

import { sanitizeVideoPrompt } from './videoPrompt.js';
import { runReplicateModel } from './replicateClient.js';

/** Wan 2.2 fast text-to-video (replaces deprecated wan-2.1 path) */
export async function generateWanReplicateVideo(prompt: string, _durationSeconds = 5): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  return runReplicateModel(
    'wan-video/wan-2.2-t2v-fast',
    { prompt: cleanPrompt.slice(0, 1000) },
    'Wan-2.2'
  );
}

/** MiniMax video-01 via Replicate */
export async function generateMinimaxReplicateVideo(prompt: string, _durationSeconds = 5): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  return runReplicateModel('minimax/video-01', { prompt: cleanPrompt.slice(0, 2000) }, 'MiniMax-Replicate');
}

/** CogVideoX text-to-video */
export async function generateCogVideoX(prompt: string, _durationSeconds = 5): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  return runReplicateModel(
    'thudm/cogvideox-t2v',
    { prompt: cleanPrompt.slice(0, 1000) },
    'CogVideoX'
  );
}

/** Zeroscope v2 XL — lightweight OSS text-to-video */
export async function generateZeroscopeVideo(prompt: string, _durationSeconds = 5): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  return runReplicateModel(
    'anotherjesse/zeroscope-v2-xl',
    { prompt: cleanPrompt.slice(0, 800) },
    'Zeroscope'
  );
}

/** @deprecated use generateZeroscopeVideo — kept for provider registry alias */
export async function generateAnimateDiff(prompt: string, durationSeconds = 5): Promise<string> {
  return generateZeroscopeVideo(prompt, durationSeconds);
}

/** Stable Video Diffusion — image-to-video */
export async function generateSvdFromImage(imageUrl: string): Promise<string> {
  return runReplicateModel(
    'stability-ai/stable-video-diffusion',
    {
      cond_aug: 0.02,
      decoding_t: 14,
      input_image: imageUrl,
      video_length: '25_frames_with_svd',
      sizing_strategy: 'maintain_aspect_ratio',
      motion_bucket_id: 127,
      frames_per_second: 6,
    },
    'Replicate-SVD'
  );
}
