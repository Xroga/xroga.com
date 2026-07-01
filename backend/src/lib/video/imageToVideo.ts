/**
 * Image-to-video pipeline — user reference frame + OSS SVD / Runway gen4_turbo.
 */

import { generateImage } from '../../services/builder/imageGen.js';
import { generateAgnesImage } from '../agnes.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';
import { generateSvdFromImage } from './replicateOssVideo.js';
import { generateRunwayImageToVideo } from './runwayVideo.js';
import { generateViaHfSpaces } from './videoOrchestrator.js';
import { hasSecret } from '../../config/envSecrets.js';
import type { VideoGenerationResult } from '../videoProviders.js';

async function generateKeyframe(
  prompt: string,
  vertical: boolean,
  userId?: string
): Promise<string> {
  const clean = sanitizeVideoPrompt(prompt);
  const aspect = vertical ? ('9:16' as const) : ('16:9' as const);
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

/** User or AI keyframe + Replicate SVD */
export async function generateImageToVideoSvd(
  prompt: string,
  durationSeconds: number,
  options?: { userId?: string; aspectRatio?: '9:16' | '16:9'; keyframeUrl?: string }
): Promise<VideoGenerationResult> {
  if (!hasSecret('REPLICATE_API_TOKEN')) throw new Error('REPLICATE_API_TOKEN not configured');
  const vertical = options?.aspectRatio === '9:16';
  const keyframe =
    options?.keyframeUrl ?? (await generateKeyframe(prompt, vertical, options?.userId));
  const videoUrl = await generateSvdFromImage(keyframe);
  return { provider: options?.keyframeUrl ? 'replicate-svd-i2v' : 'replicate-svd', videoUrl, durationSeconds };
}

/** User or AI keyframe + Runway gen4_turbo image-to-video */
export async function generateImageToVideoRunway(
  prompt: string,
  durationSeconds: number,
  options?: { userId?: string; aspectRatio?: '9:16' | '16:9'; keyframeUrl?: string }
): Promise<VideoGenerationResult> {
  const videoUrl = await generateRunwayImageToVideo(prompt, durationSeconds, {
    aspectRatio: options?.aspectRatio,
    userId: options?.userId,
    keyframeUrl: options?.keyframeUrl,
  });
  return { provider: options?.keyframeUrl ? 'runway-i2v' : 'runway-i2v', videoUrl, durationSeconds };
}

/** HF Spaces image-conditioned models when user supplies a frame */
async function tryHfSpacesImageToVideo(
  prompt: string,
  durationSeconds: number,
  options: { userId?: string; aspectRatio?: '9:16' | '16:9'; keyframeUrl: string }
): Promise<VideoGenerationResult | null> {
  try {
    const result = await generateViaHfSpaces(prompt, durationSeconds, {
      userId: options.userId,
      aspectRatio: options.aspectRatio,
      keyframeUrl: options.keyframeUrl,
    });
    return { provider: 'hf-spaces-i2v', videoUrl: result.videoUrl, durationSeconds };
  } catch (err) {
    console.warn('[ImageToVideo] HF Spaces i2v:', (err as Error).message);
    return null;
  }
}

/**
 * Image-to-video — prefers user-uploaded reference frame when provided.
 */
export async function tryImageToVideo(
  prompt: string,
  durationSeconds: number,
  options?: { userId?: string; aspectRatio?: '9:16' | '16:9'; keyframeUrl?: string }
): Promise<VideoGenerationResult | null> {
  const userFrame = options?.keyframeUrl?.trim();

  if (userFrame) {
    const hf = await tryHfSpacesImageToVideo(prompt, durationSeconds, {
      userId: options?.userId,
      aspectRatio: options?.aspectRatio,
      keyframeUrl: userFrame,
    });
    if (hf) return hf;

    if (hasSecret('REPLICATE_API_TOKEN')) {
      try {
        return await generateImageToVideoSvd(prompt, durationSeconds, { ...options, keyframeUrl: userFrame });
      } catch (err) {
        console.warn('[ImageToVideo] SVD user frame:', (err as Error).message);
      }
    }
    if (hasSecret('RUNWAY_API_KEY')) {
      try {
        return await generateImageToVideoRunway(prompt, durationSeconds, { ...options, keyframeUrl: userFrame });
      } catch (err) {
        console.warn('[ImageToVideo] Runway user frame:', (err as Error).message);
      }
    }
  }

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
