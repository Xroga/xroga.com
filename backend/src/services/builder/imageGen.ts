import { generateImageFlux } from '../../lib/replicate.js';
import { generateImageCloudflare } from '../../lib/cloudflare.js';
import type { ImageGenOutput } from '../../types/features.js';

function extractImagePrompt(userPrompt: string): string {
  const patterns = [
    /generate\s+(?:an?\s+)?image\s+of\s+(.+)/i,
    /create\s+(?:an?\s+)?(?:image|picture)\s+of\s+(.+)/i,
    /draw\s+(.+)/i,
    /image:\s*(.+)/i,
  ];

  for (const pattern of patterns) {
    const match = userPrompt.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return userPrompt;
}

export async function generateImage(userPrompt: string): Promise<ImageGenOutput> {
  const prompt = extractImagePrompt(userPrompt);

  try {
    const imageUrl = await generateImageFlux(prompt);
    return { type: 'image', imageUrl, provider: 'replicate', prompt };
  } catch (replicateErr) {
    console.error('[ImageGen] Replicate failed, falling back to Cloudflare:', (replicateErr as Error).message);

    try {
      const imageUrl = await generateImageCloudflare(prompt);
      return { type: 'image', imageUrl, provider: 'cloudflare', prompt };
    } catch (cfErr) {
      console.error('[ImageGen] Cloudflare fallback failed:', (cfErr as Error).message);
      throw new Error('All image generation providers failed');
    }
  }
}
