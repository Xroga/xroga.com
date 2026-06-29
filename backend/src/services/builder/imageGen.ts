import { generateAgnesImage } from '../../lib/agnes.js';
import { generateFalImage } from '../../lib/fal.js';
import { generateOpenAIImage } from '../../lib/openaiImage.js';
import { generateImageFlux } from '../../lib/replicate.js';
import { generateImageCloudflare } from '../../lib/cloudflare.js';
import { callWithFallback } from '../../lib/resilience/callWithFallback.js';
import type { ImageGenOutput } from '../../types/features.js';

export class ImageGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

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

export function isValidImageResult(url: string): boolean {
  if (!url?.trim()) return false;
  if (url.includes('placehold.co') || url.includes('placeholder')) return false;
  return url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:image/');
}

type ProviderEntry = { name: string; call: () => Promise<string>; configured: boolean };

function buildProviderList(): ProviderEntry[] {
  return [
    {
      name: 'openai-dalle',
      configured: Boolean(process.env.OPENAI_API_KEY),
      call: async () => generateOpenAIImage(''),
    },
    {
      name: 'agnes-image',
      configured: Boolean(process.env.AGNES_API_KEY),
      call: async () => generateAgnesImage(''),
    },
    {
      name: 'fal-sdxl',
      configured: Boolean(process.env.FAL_KEY ?? process.env.FAL_API_KEY),
      call: async () => generateFalImage(''),
    },
    {
      name: 'replicate-sd',
      configured: Boolean(process.env.REPLICATE_API_TOKEN),
      call: async () => generateImageFlux(''),
    },
    {
      name: 'cloudflare',
      configured: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
      call: async () => generateImageCloudflare(''),
    },
  ];
}

export function getConfiguredImageProviders(): string[] {
  return buildProviderList().filter((p) => p.configured).map((p) => p.name);
}

export async function generateImage(userPrompt: string): Promise<ImageGenOutput> {
  const prompt = extractImagePrompt(userPrompt);
  const configured = buildProviderList().filter((p) => p.configured);

  if (!configured.length) {
    throw new ImageGenerationError(
      'No image API keys configured on the server. Set OPENAI_API_KEY, AGNES_API_KEY, REPLICATE_API_TOKEN, FAL_KEY, or CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN on Fly.io.'
    );
  }

  console.log(`[ImageGen] Trying providers: ${configured.map((p) => p.name).join(', ')}`);

  const providers = configured.map((p) => ({
    name: p.name,
    call: () => {
      if (p.name === 'openai-dalle') return generateOpenAIImage(prompt);
      if (p.name === 'agnes-image') return generateAgnesImage(prompt);
      if (p.name === 'fal-sdxl') return generateFalImage(prompt);
      if (p.name === 'replicate-sd') return generateImageFlux(prompt);
      return generateImageCloudflare(prompt);
    },
    isValid: isValidImageResult,
  }));

  const { result: imageUrl, provider, usedFallback } = await callWithFallback(
    providers,
    () => {
      throw new ImageGenerationError(
        `All image providers failed (${configured.map((p) => p.name).join(' → ')}). Check API quotas and keys on Fly.io.`
      );
    },
    { apiType: 'image_gen' }
  );

  if (usedFallback || !isValidImageResult(imageUrl)) {
    throw new ImageGenerationError('Image generation failed — no valid image returned from any provider.');
  }

  const normalizedProvider =
    provider === 'agnes-image'
      ? 'agnes'
      : provider === 'fal-sdxl'
        ? 'fal'
        : provider === 'replicate-sd'
          ? 'replicate'
          : provider === 'openai-dalle'
            ? 'openai'
            : provider === 'cloudflare'
              ? 'cloudflare'
              : (provider as ImageGenOutput['provider']);

  console.log(`[ImageGen] Success via ${normalizedProvider}`);

  return { type: 'image', imageUrl, provider: normalizedProvider, prompt };
}
