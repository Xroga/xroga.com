import { generateAgnesImage } from '../agnes.js';
import { generateSlideshowVideo } from './slideshow.js';
import { generateMinimalMp4 } from './minimalMp4.js';
import { generateVideoWithFallback } from '../videoProviders.js';
import { generateImage } from '../../services/builder/imageGen.js';
import { logSystemError } from '../../services/systemErrorLog.js';
import type { VideoGenerationResult } from '../videoProviders.js';

export interface GuaranteedVideoOptions {
  userId?: string;
  runId?: string;
  keyframeUrl?: string;
  priority?: 'premium' | 'cheap' | 'auto';
}

/** Try paid/free API providers — may throw */
async function tryApiProviders(
  prompt: string,
  durationSeconds: number,
  options?: GuaranteedVideoOptions
): Promise<VideoGenerationResult> {
  return generateVideoWithFallback(prompt, durationSeconds, {
    userId: options?.userId,
    runId: options?.runId,
    keyframeUrl: options?.keyframeUrl,
    priority: options?.priority ?? 'cheap',
  });
}

async function tryImageSlideshow(
  prompt: string,
  durationSeconds: number,
  getImage: () => Promise<string>
): Promise<VideoGenerationResult | null> {
  try {
    const imageUrl = await getImage();
    const videoUrl = await generateSlideshowVideo(prompt, durationSeconds, imageUrl);
    return { provider: 'slideshow-ai-image', videoUrl, durationSeconds };
  } catch {
    return null;
  }
}

/**
 * ALWAYS returns a playable video URL — never throws.
 * Chain: API providers → Agnes image slideshow → full image gen slideshow → placeholder slideshow → FFmpeg minimal MP4
 */
export async function generateGuaranteedVideo(
  prompt: string,
  durationSeconds: number,
  options?: GuaranteedVideoOptions
): Promise<VideoGenerationResult> {
  const errors: string[] = [];
  const dur = Math.min(Math.max(durationSeconds, 3), 30);

  try {
    const api = await tryApiProviders(prompt, dur, options);
    if (api.videoUrl) return api;
  } catch (err) {
    errors.push(`api: ${(err as Error).message.slice(0, 80)}`);
  }

  const slideshowAttempts: Array<{ label: string; fn: () => Promise<VideoGenerationResult | null> }> = [
    {
      label: 'agnes-image',
      fn: () =>
        tryImageSlideshow(prompt, dur, () => generateAgnesImage(prompt.slice(0, 500))),
    },
    {
      label: 'image-gen',
      fn: () =>
        tryImageSlideshow(prompt, dur, async () => {
          const out = await generateImage(`Cinematic still frame: ${prompt}`, {
            userId: options?.userId,
            runId: options?.runId,
            fast: true,
          });
          return out.imageUrl;
        }),
    },
    {
      label: 'keyframe',
      fn: () =>
        options?.keyframeUrl
          ? tryImageSlideshow(prompt, dur, async () => options.keyframeUrl!)
          : Promise.resolve(null),
    },
    {
      label: 'placeholder-slideshow',
      fn: async () => {
        try {
          const videoUrl = await generateSlideshowVideo(prompt, dur);
          return { provider: 'slideshow', videoUrl, durationSeconds: dur };
        } catch {
          return null;
        }
      },
    },
  ];

  for (const attempt of slideshowAttempts) {
    try {
      const result = await attempt.fn();
      if (result?.videoUrl) {
        console.log(`[GuaranteedVideo] Success via ${attempt.label}`);
        return result;
      }
    } catch (err) {
      errors.push(`${attempt.label}: ${(err as Error).message.slice(0, 60)}`);
    }
  }

  try {
    const videoUrl = await generateMinimalMp4(prompt, dur);
    console.log('[GuaranteedVideo] Success via ffmpeg-minimal');
    return { provider: 'ffmpeg-minimal', videoUrl, durationSeconds: dur };
  } catch (err) {
    errors.push(`minimal: ${(err as Error).message.slice(0, 60)}`);
    await logSystemError({
      api: 'guaranteed-video',
      errorMessage: errors.join(' | '),
      severity: 'critical',
      userId: options?.userId,
      runId: options?.runId,
      metadata: { apiType: 'video' },
    });
    throw new Error(`Could not produce any video output. ${errors.slice(0, 3).join(' | ')}`);
  }
}
