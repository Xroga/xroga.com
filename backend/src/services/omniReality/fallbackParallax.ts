/**
 * Nuclear fallback — 2.5D parallax from a static keyframe.
 * Uses FFmpeg Ken Burns slideshow (always available when FFmpeg exists).
 */

import { generateSlideshowVideo } from '../../lib/video/slideshow.js';
import { generateAgnesImage } from '../../lib/agnes.js';
import { generateImage } from '../builder/imageGen.js';
import type { VideoGenerationResult } from '../../lib/videoProviders.js';

export async function generateParallaxClip(
  prompt: string,
  durationSeconds: number,
  options?: {
    keyframeUrl?: string;
    vertical?: boolean;
    userId?: string;
    runId?: string;
  }
): Promise<VideoGenerationResult> {
  const dur = Math.min(Math.max(durationSeconds, 3), 15);
  let imageUrl = options?.keyframeUrl;

  if (!imageUrl) {
    try {
      imageUrl = await generateAgnesImage(`Cinematic still, ${prompt.slice(0, 400)}`);
    } catch {
      try {
        const out = await generateImage(`Cinematic movie still frame: ${prompt}`, {
          userId: options?.userId,
          runId: options?.runId,
          fast: true,
          aspectFormat: options?.vertical ? '9:16' : '16:9',
        });
        if (out.type !== 'image_blocked') imageUrl = out.imageUrl;
      } catch {
        /* placeholder in slideshow */
      }
    }
  }

  const videoUrl = await generateSlideshowVideo(prompt, dur, imageUrl, options?.vertical ?? false);

  return {
    provider: 'parallax',
    videoUrl,
    durationSeconds: dur,
  };
}
