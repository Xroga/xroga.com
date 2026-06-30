/**
 * OSS video models via Replicate — delegates to ossVideoRegistry.
 */

import { REPLICATE_OSS_VIDEO_MODELS, runOssReplicateModel } from './ossVideoRegistry.js';
import { runReplicateModel } from './replicateClient.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';

function modelById(id: string) {
  const m = REPLICATE_OSS_VIDEO_MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown OSS model: ${id}`);
  return m;
}

export async function generateWanReplicateVideo(prompt: string, durationSeconds = 5): Promise<string> {
  return runOssReplicateModel(modelById('replicate-wan'), prompt, durationSeconds);
}

export async function generateHunyuanVideo(prompt: string, durationSeconds = 5): Promise<string> {
  return runOssReplicateModel(modelById('hunyuan'), prompt, durationSeconds);
}

export async function generateMochiVideo(prompt: string, durationSeconds = 5): Promise<string> {
  return runOssReplicateModel(modelById('mochi'), prompt, durationSeconds);
}

export async function generateCogVideoX(prompt: string, durationSeconds = 5): Promise<string> {
  return runOssReplicateModel(modelById('cogvideox'), prompt, durationSeconds);
}

export async function generateLtxVideo(prompt: string, durationSeconds = 5): Promise<string> {
  return runOssReplicateModel(modelById('ltx-video'), prompt, durationSeconds);
}

export async function generateVideoCrafter(prompt: string, durationSeconds = 5): Promise<string> {
  return runOssReplicateModel(modelById('videocrafter'), prompt, durationSeconds);
}

export async function generateAnimateDiffVideo(prompt: string, durationSeconds = 5): Promise<string> {
  return runOssReplicateModel(modelById('animatediff'), prompt, durationSeconds);
}

export async function generateZeroscopeVideo(prompt: string, durationSeconds = 5): Promise<string> {
  return runOssReplicateModel(modelById('zeroscope'), prompt, durationSeconds);
}

/** @deprecated alias */
export async function generateAnimateDiff(prompt: string, durationSeconds = 5): Promise<string> {
  return generateAnimateDiffVideo(prompt, durationSeconds);
}

/** MiniMax on Replicate — tried after pure OSS models */
export async function generateMinimaxReplicateVideo(prompt: string, _durationSeconds = 5): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  return runReplicateModel('minimax/video-01', { prompt: cleanPrompt.slice(0, 2000) }, 'MiniMax-Replicate');
}

/** Stable Video Diffusion — image-to-video (OSS) */
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
    'Stable-Video-Diffusion'
  );
}

/** Run every Replicate OSS model sequentially until one succeeds */
export async function tryAllReplicateOssModels(prompt: string, durationSeconds: number): Promise<{ id: string; videoUrl: string } | null> {
  for (const model of REPLICATE_OSS_VIDEO_MODELS) {
    try {
      const videoUrl = await runOssReplicateModel(model, prompt, durationSeconds);
      return { id: model.id, videoUrl };
    } catch (err) {
      console.warn(`[OSS] ${model.id}:`, (err as Error).message.slice(0, 100));
    }
  }
  return null;
}
