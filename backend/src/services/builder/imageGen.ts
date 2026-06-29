import { generateAgnesImage } from '../../lib/agnes.js';
import { generateFalImage } from '../../lib/fal.js';
import { generateImageFlux } from '../../lib/replicate.js';
import { generateImageCloudflare } from '../../lib/cloudflare.js';
import { getApiPriority } from '../../config/apiPriorities.js';
import { callWithFallback } from '../../lib/resilience/callWithFallback.js';
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

const PROVIDER_CALLS: Record<string, (prompt: string) => Promise<string>> = {
  'agnes-image': generateAgnesImage,
  agnes: generateAgnesImage,
  'fal-sdxl': generateFalImage,
  fal: generateFalImage,
  'replicate-sd': generateImageFlux,
  replicate: generateImageFlux,
  cloudflare: generateImageCloudflare,
};

const DEFAULT_IMAGE_CHAIN = ['agnes-image', 'fal-sdxl', 'replicate-sd', 'cloudflare'] as const;

export async function generateImage(userPrompt: string): Promise<ImageGenOutput> {
  const prompt = extractImagePrompt(userPrompt);
  const priority = await getApiPriority('image');
  const chain = priority.length ? priority : [...DEFAULT_IMAGE_CHAIN];

  let providers = chain
    .map((name) => {
      const call = PROVIDER_CALLS[name];
      if (!call) return null;
      return {
        name,
        call: () => call(prompt),
        isValid: (url: string) => Boolean(url?.startsWith('http')),
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  if (!providers.length) {
    providers = [
      { name: 'agnes-image', call: () => generateAgnesImage(prompt), isValid: (u) => Boolean(u) },
      { name: 'replicate-sd', call: () => generateImageFlux(prompt), isValid: (u) => Boolean(u) },
      { name: 'cloudflare', call: () => generateImageCloudflare(prompt), isValid: (u) => Boolean(u) },
    ];
  }

  const { result: imageUrl, provider } = await callWithFallback(
    providers,
    async () => {
      console.error('[ImageGen] All providers failed — using placeholder');
      return `https://placehold.co/1024x1024/1a1a2e/006aff?text=${encodeURIComponent('Xroga Image')}`;
    },
    { apiType: 'image_gen' }
  );

  const normalizedProvider =
    provider === 'agnes-image' || provider === 'agnes'
      ? 'agnes'
      : provider === 'fal-sdxl' || provider === 'fal'
        ? 'fal'
        : provider === 'replicate-sd' || provider === 'replicate'
          ? 'replicate'
          : provider === 'fallback'
            ? 'cloudflare'
            : (provider as ImageGenOutput['provider']);

  return { type: 'image', imageUrl, provider: normalizedProvider, prompt };
}
