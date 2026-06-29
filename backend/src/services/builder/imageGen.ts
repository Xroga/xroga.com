import { generateAgnesImage } from '../../lib/agnes.js';
import { generateFalImage } from '../../lib/fal.js';
import { generateImageFlux, upscaleImageReplicate } from '../../lib/replicate.js';
import { generateImageCloudflare } from '../../lib/cloudflare.js';
import { generateLumaImage } from '../../lib/luma.js';
import { generateRunwayImage } from '../../lib/runway.js';
import { generateHailuoImage } from '../../lib/hailuo.js';
import { generateComfyUIImage } from '../../lib/comfyui.js';
import { callWithFallback } from '../../lib/resilience/callWithFallback.js';
import type { ImageGenOutput } from '../../types/features.js';
import { classifyImageQuery } from './image/understanding.js';
import { enhanceImagePrompt } from './image/promptEnhancer.js';
import { pickBestImage } from './image/imageReviewer.js';
import { generateImageFollowUps } from './image/followUps.js';

export class ImageGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

export type ImageProgressStep = 'classifying' | 'enhancing' | 'painting' | 'reviewing' | 'upscaling' | 'complete';

export const IMAGE_PROGRESS_MESSAGES: Record<ImageProgressStep, string> = {
  classifying: '✨ Generating your image…',
  enhancing: '🎨 Enhancing prompt…',
  painting: '🖌️ Xroga is painting…',
  reviewing: '🔍 Final touches…',
  upscaling: '🔍 Final touches…',
  complete: '🎉 Image ready!',
};

export interface ImageGenOptions {
  onProgress?: (step: ImageProgressStep, message: string) => void;
  quality?: 'standard' | 'premium';
  userId?: string;
  runId?: string;
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

type ProviderName =
  | 'fal-sdxl'
  | 'replicate-sd'
  | 'agnes-image'
  | 'luma-image'
  | 'runway-image'
  | 'hailuo-image'
  | 'cloudflare'
  | 'comfyui';

type ProviderEntry = {
  name: ProviderName;
  call: (prompt: string) => Promise<string>;
  configured: boolean;
};

function buildStandardProviders(): ProviderEntry[] {
  return [
    {
      name: 'fal-sdxl',
      configured: Boolean(process.env.FAL_KEY ?? process.env.FAL_API_KEY),
      call: generateFalImage,
    },
    {
      name: 'replicate-sd',
      configured: Boolean(process.env.REPLICATE_API_TOKEN),
      call: generateImageFlux,
    },
    {
      name: 'agnes-image',
      configured: Boolean(process.env.AGNES_API_KEY),
      call: generateAgnesImage,
    },
    {
      name: 'hailuo-image',
      configured: Boolean(process.env.HAILUO_API_KEY ?? process.env.MINIMAX_API_KEY),
      call: generateHailuoImage,
    },
    {
      name: 'cloudflare',
      configured: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
      call: generateImageCloudflare,
    },
    {
      name: 'comfyui',
      configured: Boolean(process.env.COMFYUI_URL),
      call: generateComfyUIImage,
    },
  ];
}

function buildPremiumProviders(): ProviderEntry[] {
  return [
    {
      name: 'luma-image',
      configured: Boolean(process.env.LUMA_API_KEY),
      call: generateLumaImage,
    },
    {
      name: 'runway-image',
      configured: Boolean(process.env.RUNWAY_API_KEY),
      call: generateRunwayImage,
    },
  ];
}

export function getConfiguredImageProviders(): string[] {
  return [...buildPremiumProviders(), ...buildStandardProviders()]
    .filter((p) => p.configured)
    .map((p) => p.name);
}

/** Public-safe diagnostic — which image keys the server sees (not the values). */
export function getImageProviderStatus(): {
  configured: string[];
  keys: Record<string, boolean>;
  ready: boolean;
} {
  const keys = {
    fal: Boolean(process.env.FAL_KEY ?? process.env.FAL_API_KEY),
    replicate: Boolean(process.env.REPLICATE_API_TOKEN),
    agnes: Boolean(process.env.AGNES_API_KEY),
    luma: Boolean(process.env.LUMA_API_KEY),
    runway: Boolean(process.env.RUNWAY_API_KEY),
    hailuo: Boolean(process.env.HAILUO_API_KEY ?? process.env.MINIMAX_API_KEY),
    cloudflare: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
    comfyui: Boolean(process.env.COMFYUI_URL),
    groq: Boolean(process.env.GROQ_API_KEY),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
  };
  const configured = getConfiguredImageProviders();
  return { configured, keys, ready: configured.length > 0 };
}

function normalizeProvider(name: string): ImageGenOutput['provider'] {
  const map: Record<string, ImageGenOutput['provider']> = {
    'fal-sdxl': 'fal',
    'replicate-sd': 'replicate',
    'agnes-image': 'agnes',
    'luma-image': 'luma',
    'runway-image': 'runway',
    'hailuo-image': 'hailuo',
    cloudflare: 'cloudflare',
    comfyui: 'comfyui',
  };
  return map[name] ?? 'fal';
}

async function tryProvider(
  entry: ProviderEntry,
  prompt: string,
  ctx: { userId?: string; runId?: string }
): Promise<string> {
  const { result } = await callWithFallback(
    [{ name: entry.name, call: () => entry.call(prompt), isValid: isValidImageResult }],
    () => {
      throw new ImageGenerationError(`${entry.name} failed`);
    },
    { apiType: 'image_gen', userId: ctx.userId, runId: ctx.runId }
  );
  return result;
}

async function generatePremiumWithVoting(
  prompt: string,
  ctx: { userId?: string; runId?: string }
): Promise<{ imageUrl: string; provider: ImageGenOutput['provider'] }> {
  const premium = buildPremiumProviders().filter((p) => p.configured);
  if (!premium.length) {
    throw new ImageGenerationError('No premium image providers configured');
  }

  const results = await Promise.allSettled(
    premium.map(async (entry) => ({
      provider: normalizeProvider(entry.name),
      imageUrl: await tryProvider(entry, prompt, ctx),
    }))
  );

  const candidates = results
    .filter((r): r is PromiseFulfilledResult<{ provider: ImageGenOutput['provider']; imageUrl: string }> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((c) => isValidImageResult(c.imageUrl));

  if (!candidates.length) {
    throw new ImageGenerationError('Premium providers failed');
  }

  if (candidates.length === 1) {
    return candidates[0]!;
  }

  const winner = await pickBestImage(
    prompt,
    candidates.map((c) => ({ provider: c.provider, imageUrl: c.imageUrl }))
  );
  return { imageUrl: winner.imageUrl, provider: normalizeProvider(winner.provider) };
}

async function generateStandardChain(
  prompt: string,
  ctx: { userId?: string; runId?: string }
): Promise<{ imageUrl: string; provider: ImageGenOutput['provider'] }> {
  const configured = buildStandardProviders().filter((p) => p.configured);

  if (!configured.length) {
    throw new ImageGenerationError(
      'No image API keys configured. Set FAL_KEY, REPLICATE_API_TOKEN, AGNES_API_KEY, or CLOUDFLARE credentials on Fly.io.'
    );
  }

  console.log(`[ImageGen] Standard chain: ${configured.map((p) => p.name).join(' → ')}`);

  const providers = configured.map((p) => ({
    name: p.name,
    call: () => p.call(prompt),
    isValid: isValidImageResult,
  }));

  const { result: imageUrl, provider } = await callWithFallback(
    providers,
    () => {
      throw new ImageGenerationError(
        `All image providers failed (${configured.map((p) => p.name).join(' → ')}). Check API quotas and keys.`
      );
    },
    { apiType: 'image_gen', userId: ctx.userId, runId: ctx.runId }
  );

  return { imageUrl, provider: normalizeProvider(provider) };
}

async function maybeUpscale(imageUrl: string, premium: boolean): Promise<string> {
  if (!premium || !process.env.REPLICATE_API_TOKEN) return imageUrl;
  if (imageUrl.startsWith('data:image/')) return imageUrl;
  try {
    return await upscaleImageReplicate(imageUrl);
  } catch (err) {
    console.warn('[ImageGen] Upscale skipped:', (err as Error).message);
    return imageUrl;
  }
}

function emitProgress(
  options: ImageGenOptions | undefined,
  step: ImageProgressStep
): void {
  options?.onProgress?.(step, IMAGE_PROGRESS_MESSAGES[step]);
}

export async function generateImage(userPrompt: string, options?: ImageGenOptions): Promise<ImageGenOutput> {
  const rawQuery = extractImagePrompt(userPrompt);
  const ctx = { userId: options?.userId, runId: options?.runId };

  emitProgress(options, 'classifying');
  const intent = await classifyImageQuery(rawQuery);
  const quality = options?.quality ?? intent.quality;

  emitProgress(options, 'enhancing');
  const enhanced = await enhanceImagePrompt(intent);
  const imagePrompt = enhanced.prompt;

  emitProgress(options, 'painting');

  let imageUrl: string;
  let provider: ImageGenOutput['provider'];

  if (quality === 'premium' && buildPremiumProviders().some((p) => p.configured)) {
    try {
      emitProgress(options, 'reviewing');
      const premium = await generatePremiumWithVoting(imagePrompt, ctx);
      imageUrl = premium.imageUrl;
      provider = premium.provider;
    } catch (err) {
      console.warn('[ImageGen] Premium voting failed, falling back to standard chain:', (err as Error).message);
      const standard = await generateStandardChain(imagePrompt, ctx);
      imageUrl = standard.imageUrl;
      provider = standard.provider;
    }
  } else {
    const standard = await generateStandardChain(imagePrompt, ctx);
    imageUrl = standard.imageUrl;
    provider = standard.provider;
  }

  if (!isValidImageResult(imageUrl)) {
    throw new ImageGenerationError('Image generation failed — no valid image returned.');
  }

  emitProgress(options, 'upscaling');
  imageUrl = await maybeUpscale(imageUrl, quality === 'premium');

  emitProgress(options, 'reviewing');
  const { followUps, pros, cons } = await generateImageFollowUps(enhanced.prompt, provider);

  emitProgress(options, 'complete');
  console.log(`[ImageGen] Success via ${provider} (quality=${quality})`);

  return {
    type: 'image',
    imageUrl,
    provider,
    prompt: rawQuery,
    enhancedPrompt: enhanced.prompt,
    followUps,
    pros,
    cons,
  };
}
