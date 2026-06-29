import { generateAgnesImage } from '../../lib/agnes.js';
import { generateFalImage } from '../../lib/fal.js';
import { generateImageFlux, upscaleImageReplicate } from '../../lib/replicate.js';
import { generateImageCloudflare } from '../../lib/cloudflare.js';
import { generateLumaImage } from '../../lib/luma.js';
import { generateRunwayImage } from '../../lib/runway.js';
import { generateHailuoImage } from '../../lib/hailuo.js';
import { generateComfyUIImage } from '../../lib/comfyui.js';
import { logSystemError } from '../../services/systemErrorLog.js';
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
  classifying: 'Understanding your request…',
  enhancing: 'Enhancing your prompt…',
  painting: 'Generating your image…',
  reviewing: 'Final touches…',
  upscaling: 'Final touches…',
  complete: 'Image ready!',
};

const DEFAULT_FOLLOW_UPS = ['Make it 4K', 'Change style to anime', 'Generate variations'];
const DEFAULT_PROS = ['Creative result'];

export interface ImageGenOptions {
  onProgress?: (step: ImageProgressStep, message: string) => void;
  quality?: 'standard' | 'premium';
  userId?: string;
  runId?: string;
  /** Skip slow LLM classify/enhance for sub-15s delivery (default true) */
  fast?: boolean;
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

const MAX_PROMPT_CHARS = 900;

function truncatePrompt(prompt: string): string {
  const t = prompt.trim();
  if (t.length <= MAX_PROMPT_CHARS) return t;
  return t.slice(0, MAX_PROMPT_CHARS).trim();
}

const PROVIDER_TIMEOUT_MS = 12_000;

async function callImageProvider(
  entry: ProviderEntry,
  prompt: string,
  ctx: { userId?: string; runId?: string }
): Promise<string> {
  const safePrompt = truncatePrompt(prompt);
  const imageUrl = await Promise.race([
    entry.call(safePrompt),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error(`${entry.name} timed out`)), PROVIDER_TIMEOUT_MS)
    ),
  ]);
  if (!isValidImageResult(imageUrl)) {
    throw new ImageGenerationError(`${entry.name} returned invalid image URL`);
  }
  return imageUrl;
}

async function tryProviderChain(
  entries: ProviderEntry[],
  prompts: string[],
  ctx: { userId?: string; runId?: string }
): Promise<{ imageUrl: string; provider: ImageGenOutput['provider'] }> {
  const errors: string[] = [];

  for (const prompt of prompts) {
    for (const entry of entries) {
      try {
        const imageUrl = await callImageProvider(entry, prompt, ctx);
        console.log(`[ImageGen] Success via ${entry.name}`);
        return { imageUrl, provider: normalizeProvider(entry.name) };
      } catch (err) {
        const msg = (err as Error).message;
        errors.push(`${entry.name}: ${msg}`);
        console.warn(`[ImageGen] ${entry.name} failed:`, msg);
        await logSystemError({
          api: entry.name,
          errorMessage: msg,
          fallbackUsed: 'trying next provider',
          severity: 'warning',
          userId: ctx.userId,
          runId: ctx.runId,
          metadata: { apiType: 'image_gen', promptLen: prompt.length },
        }).catch(() => {});
      }
    }
  }

  throw new ImageGenerationError(
    `All image providers failed (${entries.map((e) => e.name).join(' → ')}). ${errors.slice(-3).join(' | ')}`
  );
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
      imageUrl: await callImageProvider(entry, prompt, ctx),
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
  rawFallback: string,
  ctx: { userId?: string; runId?: string }
): Promise<{ imageUrl: string; provider: ImageGenOutput['provider'] }> {
  const configured = buildStandardProviders().filter((p) => p.configured);

  if (!configured.length) {
    throw new ImageGenerationError(
      'No image API keys configured. Set FAL_KEY, REPLICATE_API_TOKEN, AGNES_API_KEY, or CLOUDFLARE credentials on Fly.io.'
    );
  }

  console.log(`[ImageGen] Standard chain: ${configured.map((p) => p.name).join(' → ')}`);

  const prompts = prompt.trim() === rawFallback.trim() ? [prompt] : [prompt, rawFallback];
  return tryProviderChain(configured, prompts, ctx);
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

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

export async function generateImage(userPrompt: string, options?: ImageGenOptions): Promise<ImageGenOutput> {
  const rawQuery = extractImagePrompt(userPrompt);
  const ctx = { userId: options?.userId, runId: options?.runId };
  const useFast = options?.fast !== false;
  let imagePrompt = rawQuery;
  let enhancedPrompt: string | undefined;
  const effectiveQuality = options?.quality ?? 'standard';

  if (!useFast) {
    emitProgress(options, 'classifying');
    const intent = await withTimeout(
      classifyImageQuery(rawQuery),
      2500,
      { subject: rawQuery, style: 'detailed, high quality', quality: 'standard' as const, rawQuery }
    );
    emitProgress(options, 'enhancing');
    const enhanced = await withTimeout(
      enhanceImagePrompt(intent),
      3500,
      { prompt: rawQuery, negativePrompt: '', styleTags: [] }
    );
    imagePrompt = enhanced.prompt || rawQuery;
    if (enhanced.prompt !== rawQuery) enhancedPrompt = enhanced.prompt;
  }

  emitProgress(options, 'painting');

  let imageUrl: string;
  let provider: ImageGenOutput['provider'];

  if (effectiveQuality === 'premium' && buildPremiumProviders().some((p) => p.configured)) {
    try {
      emitProgress(options, 'reviewing');
      const premium = await generatePremiumWithVoting(imagePrompt, ctx);
      imageUrl = premium.imageUrl;
      provider = premium.provider;
    } catch (err) {
      console.warn('[ImageGen] Premium voting failed, falling back to standard chain:', (err as Error).message);
      const standard = await generateStandardChain(imagePrompt, rawQuery, ctx);
      imageUrl = standard.imageUrl;
      provider = standard.provider;
    }
  } else {
    const standard = await generateStandardChain(imagePrompt, rawQuery, ctx);
    imageUrl = standard.imageUrl;
    provider = standard.provider;
  }

  if (!isValidImageResult(imageUrl)) {
    throw new ImageGenerationError('Image generation failed — no valid image returned.');
  }

  if (!useFast && effectiveQuality === 'premium') {
    emitProgress(options, 'upscaling');
    imageUrl = await maybeUpscale(imageUrl, true);
  }

  emitProgress(options, 'complete');
  console.log(`[ImageGen] Success via ${provider} (fast=${useFast})`);

  const meta = useFast
    ? { followUps: DEFAULT_FOLLOW_UPS, pros: DEFAULT_PROS, cons: [] as string[] }
    : await withTimeout(generateImageFollowUps(imagePrompt, provider), 3000, {
        followUps: DEFAULT_FOLLOW_UPS,
        pros: DEFAULT_PROS,
        cons: [],
      });

  return {
    type: 'image',
    imageUrl,
    provider,
    prompt: rawQuery,
    enhancedPrompt,
    followUps: meta.followUps,
    pros: meta.pros,
    cons: meta.cons.length ? meta.cons : undefined,
  };
}

/** Live smoke test — tries Fal then Replicate with a tiny prompt (for /health/smoke-image). */
export async function smokeTestImageGeneration(): Promise<{
  ok: boolean;
  provider?: string;
  imageUrl?: string;
  error?: string;
  tried: string[];
  errors?: Record<string, string>;
}> {
  const tried: string[] = [];
  const errors: Record<string, string> = {};
  const prompt = 'a red circle on white background, minimal test';

  const chain = buildStandardProviders().filter((p) => p.configured);
  if (!chain.length) {
    return { ok: false, error: 'No image providers configured', tried };
  }

  for (const entry of chain) {
    tried.push(entry.name);
    try {
      const imageUrl = await entry.call(prompt);
      if (isValidImageResult(imageUrl)) {
        return { ok: true, provider: entry.name, imageUrl: imageUrl.slice(0, 120), tried };
      }
      errors[entry.name] = 'Invalid URL returned';
    } catch (err) {
      errors[entry.name] = (err as Error).message;
      console.warn(`[ImageSmoke] ${entry.name}:`, errors[entry.name]);
    }
  }

  return { ok: false, error: 'All smoke-test providers failed', tried, errors };
}

/** Full pipeline smoke — classify, enhance, generate (matches user flow). */
export async function smokeTestFullPipeline(
  userPrompt = 'generate a cyberpunk cat image'
): Promise<{ ok: boolean; provider?: string; imageUrl?: string; error?: string }> {
  try {
    const result = await generateImage(userPrompt);
    return {
      ok: true,
      provider: result.provider,
      imageUrl: result.imageUrl.slice(0, 120),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
