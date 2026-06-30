/**
 * Image-to-video pipeline — uses working image APIs + Replicate SVD / Runway gen4_turbo.
 * Reliable when text-to-video APIs are locked or out of credits.
 */

import { generateImage } from '../../services/builder/imageGen.js';
import { generateAgnesImage } from '../agnes.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';
import { generateSvdFromImage } from './replicateOssVideo.js';
import { generateRunwayVideo } from './runwayVideo.js';
import { hasSecret } from '../../config/envSecrets.js';
import type { VideoGenerationResult } from '../videoProviders.js';

async function generateKeyframe(
  prompt: string,
  vertical: boolean,
  userId?: string
): Promise<string> {
  const clean = sanitizeVideoPrompt(prompt);
  const aspect = vertical ? '9:16' as const : '16:9' as const;
  try {
    return await generateAgnesImage(`Cinematic film still, ${clean.slice(0, 400)}`);
  } catch {
    const out = await generateImage(`Cinematic film still: ${clean}`, {
      userId,
      fast: true,
      aspectFormat: aspect,
    });
    if (out.type === 'image_blocked') throw new Error('Scene blocked by content policy');
    if (!out.imageUrl) throw new Error('Image generation returned no URL');
    return out.imageUrl;
  }
}

/** Keyframe + Replicate SVD — works with REPLICATE_API_TOKEN only */
export async function generateImageToVideoSvd(
  prompt: string,
  durationSeconds: number,
  options?: { userId?: string; aspectRatio?: '9:16' | '16:9' }
): Promise<VideoGenerationResult> {
  if (!hasSecret('REPLICATE_API_TOKEN')) throw new Error('REPLICATE_API_TOKEN not configured');
  const vertical = options?.aspectRatio === '9:16';
  const keyframe = await generateKeyframe(prompt, vertical, options?.userId);
  const videoUrl = await generateSvdFromImage(keyframe);
  return { provider: 'replicate-svd', videoUrl, durationSeconds };
}

/** Keyframe + Runway gen4_turbo image-to-video */
export async function generateImageToVideoRunway(
  prompt: string,
  durationSeconds: number,
  options?: { userId?: string; aspectRatio?: '9:16' | '16:9' }
): Promise<VideoGenerationResult> {
  if (!hasSecret('RUNWAY_API_KEY')) throw new Error('RUNWAY_API_KEY not configured');
  const videoUrl = await generateRunwayVideo(prompt, durationSeconds, {
    aspectRatio: options?.aspectRatio,
    userId: options?.userId,
  });
  return { provider: 'runway-i2v', videoUrl, durationSeconds };
}

/** Try image-to-video paths — high success when image APIs work */
export async function tryImageToVideo(
  prompt: string,
  durationSeconds: number,
  options?: { userId?: string; aspectRatio?: '9:16' | '16:9' }
): Promise<VideoGenerationResult | null> {
  const attempts: Array<() => Promise<VideoGenerationResult>> = [];

  if (hasSecret('REPLICATE_API_TOKEN')) {
    attempts.push(() => generateImageToVideoSvd(prompt, durationSeconds, options));
  }
  if (hasSecret('RUNWAY_API_KEY')) {
    attempts.push(() => generateImageToVideoRunway(prompt, durationSeconds, options));
  }

  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      console.warn('[ImageToVideo]', (err as Error).message);
    }
  }
  return null;
}
