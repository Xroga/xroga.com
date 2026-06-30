/**
 * OSS video models via Replicate — MiniMax, Wan, CogVideoX workhorse tier.
 */

import { sanitizeVideoPrompt } from './videoPrompt.js';
import { runReplicateModel } from './replicateClient.js';

/** MiniMax video-01 via Replicate */
export async function generateMinimaxReplicateVideo(prompt: string, _durationSeconds = 5): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  return runReplicateModel('minimax/video-01', { prompt: cleanPrompt.slice(0, 2000) }, 'MiniMax-Replicate');
}

/** Wan 2.1 text-to-video */
export async function generateWanReplicateVideo(prompt: string, _durationSeconds = 5): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  return runReplicateModel(
    'wavespeedai/wan-2.1-t2v-480p',
    { prompt: cleanPrompt.slice(0, 1000) },
    'Wan-2.1'
  );
}

/** CogVideoX text-to-video */
export async function generateCogVideoX(prompt: string, _durationSeconds = 5): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  return runReplicateModel(
    'thudm/cogvideox-2b',
    {
      prompt: cleanPrompt.slice(0, 1000),
      num_inference_steps: 30,
      guidance_scale: 7,
    },
    'CogVideoX'
  );
}

/** AnimateDiff motion from prompt */
export async function generateAnimateDiff(prompt: string, _durationSeconds = 5): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  return runReplicateModel(
    'lucataco/animate-diff',
    {
      prompt: cleanPrompt.slice(0, 800),
      n_prompt: 'blurry, low quality, extra limbs, warping',
      num_inference_steps: 25,
    },
    'AnimateDiff'
  );
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
