/** Replicate Stable Video Diffusion — image-to-video with real keyframe */

import { generateAgnesImage } from '../agnes.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';
import { generateSvdFromImage } from './replicateOssVideo.js';
import { generateImage } from '../../services/builder/imageGen.js';

async function resolveKeyframe(prompt: string, userId?: string): Promise<string> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  try {
    return await generateAgnesImage(`Cinematic film still: ${cleanPrompt.slice(0, 400)}`);
  } catch {
    const out = await generateImage(`Cinematic film still: ${cleanPrompt}`, {
      userId,
      fast: true,
      aspectFormat: '16:9',
    });
    if (out.type === 'image_blocked') throw new Error('Keyframe blocked by moderation');
    return out.imageUrl;
  }
}

export async function generateReplicateVideo(
  prompt: string,
  options?: { userId?: string }
): Promise<string> {
  const inputImage = await resolveKeyframe(prompt, options?.userId);
  return generateSvdFromImage(inputImage);
}
