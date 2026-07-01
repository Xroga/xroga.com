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
    const imageUrl = await getImage();
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
    try {
      const raced = await raceVideoProviders(cleanPrompt, dur, {
        aspectRatio,
        userId: options?.userId,
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
      });
      if (i2v?.videoUrl) {
        console.log(`[GuaranteedVideo] Image-to-video winner: ${i2v.provider}`);
        return i2v;
      }
    } catch (err) {
      errors.push(`image-to-video: ${(err as Error).message.slice(0, 80)}`);
    }

    // Full sequential OSS → premium chain before motion fallbacks
    try {
      const api = await tryApiProviders(cleanPrompt, dur, {
        ...options,
        aspectRatio,
        priority: 'cheap',
      });
      if (api.videoUrl) {
        console.log(`[GuaranteedVideo] Full-chain winner: ${api.provider}`);
        return api;
      }
    } catch (err) {
      errors.push(`full-chain: ${(err as Error).message.slice(0, 80)}`);
    }
  } else {
    try {
      const api = await tryApiProviders(cleanPrompt, dur, {
        ...options,
        aspectRatio,
      });
      if (api.videoUrl) return api;
    } catch (err) {
      errors.push(`api: ${(err as Error).message.slice(0, 80)}`);
    }
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
    {
      label: 'placeholder-slideshow',
      fn: async () => {
        try {
          const videoUrl = await generateSlideshowVideo(cleanPrompt, dur, undefined, isVertical);
          return { provider: 'slideshow', videoUrl, durationSeconds: dur };
        } catch (err) {
          errors.push(`placeholder-slideshow: ${(err as Error).message.slice(0, 80)}`);
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
    const videoUrl = await generateMinimalMp4(cleanPrompt, dur);
    console.log('[GuaranteedVideo] Success via ffmpeg-minimal');
    return { provider: 'ffmpeg-minimal', videoUrl, durationSeconds: dur };
  } catch (err) {
    errors.push(`minimal: ${(err as Error).message.slice(0, 80)}`);
  }

  console.log('[GuaranteedVideo] Using embedded static MP4 fallback');
  return { provider: 'static-mp4', videoUrl: getStaticMp4DataUrl(), durationSeconds: dur };
}
