import { generateAgnesImage } from '../agnes.js';
import { generateSlideshowVideo } from './slideshow.js';
import { generateMinimalMp4 } from './minimalMp4.js';
import { getStaticMp4DataUrl } from './staticMp4.js';
import { generateVideoWithFallback } from '../videoProviders.js';
import { raceVideoProviders, isFastClip } from './fastVideoRace.js';
import { tryImageToVideo } from './imageToVideo.js';
import { generateImage } from '../../services/builder/imageGen.js';
import { parseVideoFormat } from '../../services/media/videoUtils.js';
import type { VideoGenerationResult } from '../videoProviders.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';

export interface GuaranteedVideoOptions {
  userId?: string;
  runId?: string;
  keyframeUrl?: string;
  priority?: 'premium' | 'cheap' | 'auto';
  aspectRatio?: '9:16' | '16:9';
  scenePriority?: string;
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
    aspectRatio: options?.aspectRatio,
  });
}

async function tryImageSlideshow(
  prompt: string,
  durationSeconds: number,
  getImage: () => Promise<string>,
  errors: string[],
  label: string,
  vertical: boolean
): Promise<VideoGenerationResult | null> {
  try {
    const imageUrl = (await getImage())?.trim();
    if (!imageUrl) {
      errors.push(`${label}: no keyframe image`);
      return null;
    }
    const videoUrl = await generateSlideshowVideo(prompt, durationSeconds, imageUrl, vertical);
    return { provider: 'slideshow-ai-image', videoUrl, durationSeconds };
  } catch (err) {
    errors.push(`${label}: ${(err as Error).message.slice(0, 80)}`);
    return null;
  }
}

/**
 * ALWAYS returns a playable video URL.
 * Chain: API providers → slideshow fallbacks → FFmpeg minimal MP4 → embedded static MP4
 */
export async function generateGuaranteedVideo(
  prompt: string,
  durationSeconds: number,
  options?: GuaranteedVideoOptions
): Promise<VideoGenerationResult> {
  const errors: string[] = [];
  const dur = Math.min(Math.max(durationSeconds, 3), 30);
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  const isVertical = parseVideoFormat(prompt) === 'shorts_reels';
  const aspectRatio = isVertical ? '9:16' as const : '16:9' as const;

  if (isFastClip(dur)) {
    if (options?.keyframeUrl) {
      try {
        const i2vFirst = await tryImageToVideo(cleanPrompt, dur, {
          userId: options?.userId,
          aspectRatio,
          keyframeUrl: options.keyframeUrl,
        });
        if (i2vFirst?.videoUrl) {
          console.log(`[GuaranteedVideo] User-frame i2v winner: ${i2vFirst.provider}`);
          return i2vFirst;
        }
      } catch (err) {
        errors.push(`user-i2v: ${(err as Error).message.slice(0, 80)}`);
      }
    }

    try {
      const raced = await raceVideoProviders(cleanPrompt, dur, {
        aspectRatio,
        userId: options?.userId,
        scenePriority: options?.scenePriority,
        keyframeUrl: options?.keyframeUrl,
      });
      if (raced?.videoUrl) {
        console.log(`[GuaranteedVideo] Fast race winner: ${raced.provider}`);
        return raced;
      }
    } catch (err) {
      errors.push(`fast-race: ${(err as Error).message.slice(0, 80)}`);
    }

    try {
      const i2v = await tryImageToVideo(cleanPrompt, dur, {
        userId: options?.userId,
        aspectRatio,
        keyframeUrl: options?.keyframeUrl,
      });
      if (i2v?.videoUrl) {
        console.log(`[GuaranteedVideo] Image-to-video winner: ${i2v.provider}`);
        return i2v;
      }
    } catch (err) {
      errors.push(`image-to-video: ${(err as Error).message.slice(0, 80)}`);
    }

    try {
      const videoUrl = await generateMinimalMp4(cleanPrompt, dur, { vertical: isVertical });
      console.log('[GuaranteedVideo] Fast clip — ffmpeg-minimal');
      return { provider: 'ffmpeg-minimal', videoUrl, durationSeconds: dur };
    } catch (err) {
      errors.push(`minimal-fast: ${(err as Error).message.slice(0, 80)}`);
    }

    console.log('[GuaranteedVideo] Fast clip — static MP4');
    return { provider: 'static-mp4', videoUrl: getStaticMp4DataUrl(), durationSeconds: dur };
  }

  try {
    const api = await tryApiProviders(cleanPrompt, dur, {
      ...options,
      aspectRatio,
    });
    if (api.videoUrl) return api;
  } catch (err) {
    errors.push(`api: ${(err as Error).message.slice(0, 80)}`);
  }

  const slideshowAttempts: Array<{ label: string; fn: () => Promise<VideoGenerationResult | null> }> = [
    {
      label: 'agnes-image',
      fn: () =>
        tryImageSlideshow(cleanPrompt, dur, () => generateAgnesImage(cleanPrompt.slice(0, 500)), errors, 'agnes-image', isVertical),
    },
    {
      label: 'image-gen',
      fn: () =>
        tryImageSlideshow(prompt, dur, async () => {
          const out = await generateImage(`Cinematic still frame: ${cleanPrompt}`, {
            userId: options?.userId,
            runId: options?.runId,
            fast: true,
            aspectFormat: isVertical ? '9:16' : '16:9',
          });
          if (out.type === 'image_blocked') return '';
          return out.imageUrl;
        }, errors, 'image-gen', isVertical),
    },
    {
      label: 'keyframe',
      fn: () =>
        options?.keyframeUrl
          ? tryImageSlideshow(cleanPrompt, dur, async () => options.keyframeUrl!, errors, 'keyframe', isVertical)
          : Promise.resolve(null),
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
    const videoUrl = await generateMinimalMp4(cleanPrompt, dur, { vertical: isVertical });
    console.log('[GuaranteedVideo] Success via ffmpeg-minimal');
    return { provider: 'ffmpeg-minimal', videoUrl, durationSeconds: dur };
  } catch (err) {
    errors.push(`minimal: ${(err as Error).message.slice(0, 80)}`);
  }

  console.log('[GuaranteedVideo] Using embedded static MP4 fallback');
  return { provider: 'static-mp4', videoUrl: getStaticMp4DataUrl(), durationSeconds: dur };
}
