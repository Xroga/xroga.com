import { generateAgnesImage } from '../../lib/agnes.js';
import { generateFalImage } from '../../lib/fal.js';
import { generateImageFlux, upscaleImageReplicate } from '../../lib/replicate.js';
import { generateImageCloudflare } from '../../lib/cloudflare.js';
import { generateLumaImage } from '../../lib/luma.js';
import { generateRunwayImage } from '../../lib/runway.js';
import { generateHailuoImage } from '../../lib/hailuo.js';
import { generateComfyUIImage } from '../../lib/comfyui.js';
import { generateOpenAIImage } from '../../lib/openaiImage.js';
import { generateGeminiImage } from '../../lib/geminiImage.js';
import { logSystemError } from '../../services/systemErrorLog.js';
import type { ImageBlockedOutput, ImageGenOutput } from '../../types/features.js';
import { persistImageUrl } from '../../lib/persistImageUrl.js';
import { classifyImageQuery } from './image/understanding.js';
import { enhanceImagePrompt } from './image/promptEnhancer.js';
import { pickBestImage } from './image/imageReviewer.js';
import { generateImageFollowUps } from './image/followUps.js';
import { moderateImagePrompt, parseImageAspectFormat, aspectFormatLabel, aspectFormatPromptSuffix, type ImageAspectFormat } from './image/contentModeration.js';
import { verifyImageMatchesPrompt, verifyImageQuick } from './image/imageVerifier.js';
import { buildImageBlockedOutput } from './image/imageSafetyMessages.js';
import {
  extractSourceImageUrl,
  generateStyleVariants,
  VARIANT_COUNT as STYLE_VARIANT_COUNT,
} from './image/imageStyleTransfer.js';

export class ImageGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImageGenerationError';
  }
}

export type ImageProgressStep =
  | 'classifying'
  | 'enhancing'
  | 'painting'
  | 'reviewing'
  | 'verifying'
  | 'upscaling'
  | 'complete';

export const IMAGE_PROGRESS_MESSAGES: Record<ImageProgressStep, string> = {
  classifying: 'Understanding your request…',
  enhancing: 'Enhancing your prompt…',
  painting: 'Generating your image…',
  reviewing: 'Comparing results…',
  verifying: 'Verifying match to your prompt…',
  upscaling: 'Final touches…',
  complete: 'Image ready!',
};

const EXACT_MATCH_THRESHOLD = 72;
const ACCEPT_THRESHOLD = 60;
const DEFAULT_FOLLOW_UPS = [
  'Make it more photorealistic',
  'Try anime / illustration style',
  'Warmer cinematic lighting',
  'Sharper details and higher contrast',
];

export const VARIANT_COUNT = 4;

export interface ImageGenOptions {
  onProgress?: (step: ImageProgressStep, message: string) => void;
  onImageAttempt?: (attempt: {
    imageUrl: string;
    provider: ImageGenOutput['provider'];
    matchScore: number;
    issues?: string[];
    scoresByVerifier?: Record<string, number>;
    variantLabel?: string;
    variantIndex?: number;
  }) => void;
  quality?: 'standard' | 'premium';
  userId?: string;
  runId?: string;
  /** Skip slow LLM classify/enhance for sub-15s delivery (default true) */
  fast?: boolean;
  /** Output aspect ratio — defaults to 1:1 post if not in prompt */
  aspectFormat?: ImageAspectFormat;
  /** Source photo for style transfer / image edit */
  sourceImageUrl?: string;
}

function extractImagePrompt(userPrompt: string): string {
  const patterns = [
    /generate\s+(?:an?\s+)?image\s+of\s+(.+)/i,
    /create\s+(?:an?\s+)?(?:image|picture)\s+of\s+(.+)/i,
    /generate\s+(?:an?\s+)?(.+)/i,
    /create\s+(?:an?\s+)?(.+)/i,
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
  | 'comfyui'
  | 'openai-image'
  | 'gemini-image';

type ProviderEntry = {
  name: ProviderName;
  call: (prompt: string) => Promise<string>;
  configured: boolean;
};

/** Fixed 4-variant slots: Agnes · Cloudflare · Fal AI · Gemini */
const VARIANT_SLOT_PROVIDERS: ProviderName[] = [
  'agnes-image',
  'cloudflare',
  'fal-sdxl',
  'gemini-image',
];

const OTHER_VARIANT_POOL: ProviderName[] = [
  'replicate-sd',
  'openai-image',
  'comfyui',
  'luma-image',
  'hailuo-image',
  'runway-image',
];

const PROVIDER_DISPLAY: Record<ProviderName, string> = {
  'agnes-image': 'Agnes',
  cloudflare: 'Cloudflare',
  'fal-sdxl': 'Fal AI',
  'gemini-image': 'Google Gemini',
  'replicate-sd': 'Replicate',
  'openai-image': 'OpenAI',
  comfyui: 'ComfyUI',
  'luma-image': 'Luma',
  'hailuo-image': 'Hailuo',
  'runway-image': 'Runway',
};

function providerDisplayLabel(name: ProviderName): string {
  return PROVIDER_DISPLAY[name] ?? name;
}

function buildStandardProviders(): ProviderEntry[] {
  /** Free/cheap providers first, paid APIs last */
  return [
    {
      name: 'comfyui',
      configured: Boolean(process.env.COMFYUI_URL),
      call: generateComfyUIImage,
    },
    {
      name: 'cloudflare',
      configured: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
      call: generateImageCloudflare,
    },
    {
      name: 'replicate-sd',
      configured: Boolean(process.env.REPLICATE_API_TOKEN),
      call: generateImageFlux,
    },
    {
      name: 'fal-sdxl',
      configured: Boolean(process.env.FAL_KEY ?? process.env.FAL_API_KEY),
      call: generateFalImage,
    },
    {
      name: 'hailuo-image',
      configured: Boolean(process.env.HAILUO_API_KEY ?? process.env.MINIMAX_API_KEY),
      call: generateHailuoImage,
    },
    {
      name: 'agnes-image',
      configured: Boolean(process.env.AGNES_API_KEY),
      call: generateAgnesImage,
    },
    {
      name: 'openai-image',
      configured: Boolean(process.env.OPENAI_API_KEY),
      call: generateOpenAIImage,
    },
    {
      name: 'gemini-image',
      configured: Boolean(process.env.GEMINI_API_KEY),
      call: generateGeminiImage,
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
    gemini: Boolean(process.env.GEMINI_API_KEY),
    openai: Boolean(process.env.OPENAI_API_KEY),
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
    'openai-image': 'openai',
    'gemini-image': 'gemini',
  };
  return map[name] ?? 'fal';
}

const MAX_PROMPT_CHARS = 900;

function truncatePrompt(prompt: string): string {
  const t = prompt.trim();
  if (t.length <= MAX_PROMPT_CHARS) return t;
  return t.slice(0, MAX_PROMPT_CHARS).trim();
}

const PROVIDER_TIMEOUT_MS: Partial<Record<ProviderName, number>> = {
  cloudflare: 90_000,
  'fal-sdxl': 75_000,
  'replicate-sd': 130_000,
  'agnes-image': 90_000,
  'gemini-image': 38_000,
  'openai-image': 60_000,
  'luma-image': 60_000,
  'hailuo-image': 60_000,
  'runway-image': 60_000,
  comfyui: 60_000,
};

const DEFAULT_PROVIDER_TIMEOUT_MS = 45_000;

type VariantSlotConfig = {
  variantIndex: number;
  label: string;
  providers: ProviderName[];
};

/** Each grid slot has a primary provider plus fallbacks so all 4 columns can fill */
const VARIANT_SLOTS: VariantSlotConfig[] = [
  { variantIndex: 0, label: 'Agnes', providers: ['agnes-image', 'openai-image', 'fal-sdxl'] },
  { variantIndex: 1, label: 'Cloudflare', providers: ['cloudflare', 'fal-sdxl', 'openai-image'] },
  { variantIndex: 2, label: 'Fal AI', providers: ['fal-sdxl', 'replicate-sd', 'openai-image'] },
  { variantIndex: 3, label: 'Google Gemini', providers: ['gemini-image', 'openai-image', 'fal-sdxl', 'luma-image'] },
];

function resolveVariantSlots(registry: Map<ProviderName, ProviderEntry>): VariantSlotConfig[] {
  const geminiReady = registry.get('gemini-image')?.configured;
  return VARIANT_SLOTS.map((slot) => {
    if (slot.variantIndex !== 3 || geminiReady) return slot;
    return {
      ...slot,
      label: 'OpenAI',
      providers: ['openai-image', 'fal-sdxl', 'replicate-sd', 'luma-image'],
    };
  });
}

function buildProviderRegistry(): Map<ProviderName, ProviderEntry> {
  return new Map(buildAllProviders().map((p) => [p.name, p]));
}

function shortImagePrompt(rawQuery: string, basePrompt: string): string {
  const t = (basePrompt || rawQuery).trim();
  if (t.length <= 420) return t;
  return t.slice(0, 420).trim();
}

async function callImageProvider(
  entry: ProviderEntry,
  prompt: string,
  ctx: { userId?: string; runId?: string }
): Promise<string> {
  const safePrompt = truncatePrompt(prompt);
  const timeout = PROVIDER_TIMEOUT_MS[entry.name] ?? DEFAULT_PROVIDER_TIMEOUT_MS;
  const imageUrl = await Promise.race([
    entry.call(safePrompt),
    new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error(`${entry.name} timed out after ${timeout}ms`)), timeout)
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
  step: ImageProgressStep,
  message?: string
): void {
  options?.onProgress?.(step, message ?? IMAGE_PROGRESS_MESSAGES[step]);
}

async function buildPipelinePrompt(
  rawQuery: string,
  basePrompt: string,
  aspectFormat: ImageAspectFormat,
  options?: ImageGenOptions
): Promise<string> {
  const suffix = aspectFormatPromptSuffix(aspectFormat);
  if (options?.fast === false) return `${basePrompt}. ${suffix}`;

  emitProgress(options, 'classifying', 'Groq analyzing your prompt…');
  const intent = await withTimeout(classifyImageQuery(rawQuery), 3_500, {
    subject: rawQuery.slice(0, 120),
    style: 'detailed, high quality',
    quality: 'standard' as const,
    rawQuery,
  });

  emitProgress(options, 'enhancing', 'Building detailed prompt for image AIs…');
  const enhanced = await withTimeout(enhanceImagePrompt(intent), 4_500, {
    prompt: basePrompt,
    negativePrompt: '',
    styleTags: [],
  });

  const text = enhanced.prompt?.trim() || basePrompt;
  return `${text}. ${suffix}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function buildAllProviders(): ProviderEntry[] {
  const seen = new Set<string>();
  const all = [...buildStandardProviders(), ...buildPremiumProviders()];
  return all.filter((p) => {
    if (!p.configured || seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });
}

/** Ultimate fallback order when a slot's primary providers fail */
const GLOBAL_FALLBACK_CHAIN: ProviderName[] = [
  'fal-sdxl',
  'replicate-sd',
  'agnes-image',
  'openai-image',
  'cloudflare',
  'gemini-image',
  'comfyui',
];

function buildSlotProviderChain(slot: VariantSlotConfig): ProviderName[] {
  const seen = new Set<ProviderName>();
  const chain: ProviderName[] = [];
  for (const name of [...slot.providers, ...GLOBAL_FALLBACK_CHAIN]) {
    if (!seen.has(name)) {
      seen.add(name);
      chain.push(name);
    }
  }
  return chain;
}

function pickVariantProviders(all: ProviderEntry[]): ProviderEntry[] {
  const byName = new Map(all.map((p) => [p.name, p]));
  const picked: ProviderEntry[] = [];

  for (const name of VARIANT_SLOT_PROVIDERS) {
    const entry = byName.get(name);
    if (entry?.configured) picked.push(entry);
  }

  for (const name of OTHER_VARIANT_POOL) {
    if (picked.length >= VARIANT_COUNT) break;
    if (picked.some((p) => p.name === name)) continue;
    const entry = byName.get(name);
    if (entry?.configured) picked.push(entry);
  }

  if (picked.length < VARIANT_COUNT) {
    for (const entry of all) {
      if (picked.length >= VARIANT_COUNT) break;
      if (!picked.some((p) => p.name === entry.name)) picked.push(entry);
    }
  }

  return picked.slice(0, VARIANT_COUNT);
}

async function runVariantSlot(
  slot: VariantSlotConfig,
  prompts: { full: string; short: string },
  registry: Map<ProviderName, ProviderEntry>,
  ctx: { userId?: string; runId?: string },
  options?: ImageGenOptions
): Promise<{
  imageUrl: string;
  provider: ImageGenOutput['provider'];
  matchScore: number;
  issues?: string[];
  blocked?: boolean;
  failed?: boolean;
  scoresByVerifier?: Record<string, number>;
  variantLabel: string;
  variantIndex: number;
  usedProvider?: string;
}> {
  const errors: string[] = [];

  for (const name of buildSlotProviderChain(slot)) {
    const entry = registry.get(name);
    if (!entry?.configured) {
      errors.push(`${providerDisplayLabel(name)}: API key not set`);
      continue;
    }

    const useShort = name === 'cloudflare' || name === 'fal-sdxl' || name === 'replicate-sd';
    const prompt = useShort ? prompts.short : prompts.full;

    emitProgress(options, 'painting', `${slot.label} · ${providerDisplayLabel(name)}…`);

    try {
      const rawUrl = await callImageProvider(entry, prompt, ctx);
      const imageUrl = await persistImageUrl(rawUrl, {
        userId: ctx.userId,
        label: `${slot.label}-${name}`.replace(/\s+/g, '-').toLowerCase(),
      });
      const provider = normalizeProvider(name);
      const attempt = {
        imageUrl,
        provider,
        matchScore: 72,
        issues: [] as string[],
        blocked: false,
        scoresByVerifier: {} as Record<string, number>,
        variantLabel: slot.label,
        variantIndex: slot.variantIndex,
        usedProvider: name,
      };

      options?.onImageAttempt?.({
        imageUrl: attempt.imageUrl,
        provider: attempt.provider,
        matchScore: attempt.matchScore,
        variantLabel: slot.label,
        variantIndex: slot.variantIndex,
      });

      console.log(`[ImageGen] slot ${slot.variantIndex} (${slot.label}) ok via ${name}`);
      return attempt;
    } catch (err) {
      const msg = (err as Error).message.slice(0, 120);
      errors.push(`${providerDisplayLabel(name)}: ${msg}`);
      console.warn(`[ImageGen] slot ${slot.variantIndex} ${name} failed:`, msg);
    }
  }

  await logSystemError({
    api: slot.label,
    errorMessage: errors.join(' | ') || 'All providers failed',
    fallbackUsed: 'variant slot fallbacks exhausted',
    severity: 'warning',
    userId: ctx.userId,
    runId: ctx.runId,
    metadata: { apiType: 'image_gen', slot: slot.variantIndex },
  }).catch(() => {});

  return {
    imageUrl: '',
    provider: normalizeProvider(slot.providers[0] ?? 'fal-sdxl'),
    matchScore: 0,
    issues: errors.length ? errors : [`${slot.label}: no providers configured`],
    failed: true,
    variantLabel: slot.label,
    variantIndex: slot.variantIndex,
  };
}

async function generateStyleTransferImage(
  userPrompt: string,
  rawQuery: string,
  sourceUrl: string,
  options: ImageGenOptions | undefined,
  meta: {
    aspectFormat: ImageAspectFormat;
    formatLabel: string;
    isYoutubeThumbnail: boolean;
    ctx: { userId?: string; runId?: string };
  }
): Promise<ImageGenOutput | ImageBlockedOutput> {
  emitProgress(options, 'painting', `Style transfer — ${STYLE_VARIANT_COUNT} modern looks from your photo…`);

  type Attempt = {
    imageUrl: string;
    provider: ImageGenOutput['provider'];
    matchScore: number;
    issues?: string[];
    blocked?: boolean;
    scoresByVerifier?: Record<string, number>;
    variantLabel?: string;
    variantIndex?: number;
  };

  const variants = await generateStyleVariants(sourceUrl, userPrompt, (index, label) => {
    emitProgress(options, 'painting', `Variant ${index + 1}/${STYLE_VARIANT_COUNT}: ${label}…`);
  });

  if (!variants.length) {
    throw new ImageGenerationError('Style transfer failed — try a clearer style description.');
  }

  const attemptResults = await Promise.all(
    variants.map(async (variant, index): Promise<Attempt | null> => {
      emitProgress(options, 'verifying', `Scoring ${variant.variantLabel}…`);
      try {
        const verification = await verifyImageMatchesPrompt(variant.imageUrl, rawQuery);
        if (verification.blockedForSafety) {
          return {
            imageUrl: variant.imageUrl,
            provider: 'fal',
            matchScore: 0,
            issues: verification.issues,
            blocked: true,
            variantLabel: variant.variantLabel,
            variantIndex: index,
          };
        }

        const attempt: Attempt = {
          imageUrl: variant.imageUrl,
          provider: 'fal',
          matchScore: verification.matchScore,
          issues: verification.issues,
          blocked: false,
          scoresByVerifier: verification.scoresByVerifier,
          variantLabel: variant.variantLabel,
          variantIndex: index,
        };

        options?.onImageAttempt?.({
          imageUrl: attempt.imageUrl,
          provider: attempt.provider,
          matchScore: attempt.matchScore,
          issues: attempt.issues,
          scoresByVerifier: attempt.scoresByVerifier,
          variantLabel: attempt.variantLabel,
          variantIndex: attempt.variantIndex,
        });

        return attempt;
      } catch {
        return null;
      }
    })
  );

  const allAttempts = attemptResults.filter((a): a is Attempt => a !== null);
  const safeAttempts = allAttempts.filter((a) => !a.blocked);

  if (!safeAttempts.length) {
    emitProgress(options, 'complete');
    return buildImageBlockedOutput(rawQuery, 'image_blocked', 'Style transfer outputs were blocked by safety review.');
  }

  const winner = [...safeAttempts].sort((a, b) => b.matchScore - a.matchScore)[0]!;
  const serializedAttempts = safeAttempts.map((a) => ({
    imageUrl: a.imageUrl,
    provider: a.provider,
    matchScore: a.matchScore,
    issues: a.issues,
    scoresByVerifier: a.scoresByVerifier,
    selected: a.imageUrl === winner.imageUrl,
    variantLabel: a.variantLabel,
    variantIndex: a.variantIndex,
  }));

  emitProgress(options, 'complete');

  return {
    type: 'image',
    imageUrl: winner.imageUrl,
    provider: winner.provider,
    prompt: rawQuery,
    followUps: ['Make it more photorealistic', 'Try anime / illustration style', 'Warmer cinematic lighting', 'Sharper details and higher contrast'],
    pros: [`${safeAttempts.length} style variants from your upload`, `Best: ${winner.variantLabel ?? winner.provider}`],
    matchScore: winner.matchScore,
    verified: winner.matchScore >= EXACT_MATCH_THRESHOLD,
    aspectFormat: meta.aspectFormat,
    allAttempts: serializedAttempts,
    rejectedImages: serializedAttempts.filter((a) => a.imageUrl !== winner.imageUrl),
    isYoutubeThumbnail: meta.isYoutubeThumbnail,
    variantCount: safeAttempts.length,
    isStyleTransfer: true,
    sourceImageUrl: sourceUrl,
  };
}

export async function generateImage(
  userPrompt: string,
  options?: ImageGenOptions
): Promise<ImageGenOutput | ImageBlockedOutput> {
  const rawQuery = extractImagePrompt(userPrompt);
  const ctx = { userId: options?.userId, runId: options?.runId };

  const moderation = moderateImagePrompt(rawQuery);
  if (!moderation.allowed) {
    return buildImageBlockedOutput(rawQuery, 'prompt_blocked', moderation.reason);
  }

  const aspectFormat = options?.aspectFormat ?? parseImageAspectFormat(rawQuery);
  const formatLabel = aspectFormatLabel(aspectFormat);
  const basePrompt = moderation.sanitizedPrompt ?? rawQuery;
  const imagePrompt = await buildPipelinePrompt(rawQuery, basePrompt, aspectFormat, options);
  const isYoutubeThumbnail = /\b(thumbnail|youtube)\b/i.test(rawQuery);

  const sourceUrl = extractSourceImageUrl(userPrompt, options?.sourceImageUrl);
  if (sourceUrl) {
    return generateStyleTransferImage(userPrompt, rawQuery, sourceUrl, options, {
      aspectFormat,
      formatLabel,
      isYoutubeThumbnail,
      ctx,
    });
  }

  emitProgress(options, 'painting', `Format: ${formatLabel} — generating ${VARIANT_COUNT} variants…`);

  const registry = buildProviderRegistry();
  if (!registry.size) {
    throw new ImageGenerationError('No image API keys configured on the server.');
  }

  const activeSlots = resolveVariantSlots(registry);

  const promptBundle = {
    full: imagePrompt,
    short: shortImagePrompt(rawQuery, basePrompt),
  };

  console.log(
    `[ImageGen] ${VARIANT_COUNT} slots (${formatLabel}): ${activeSlots.map((s) => s.label).join(', ')}`
  );

  type Attempt = {
    imageUrl: string;
    provider: ImageGenOutput['provider'];
    matchScore: number;
    issues?: string[];
    blocked?: boolean;
    failed?: boolean;
    scoresByVerifier?: Record<string, number>;
    variantLabel?: string;
    variantIndex?: number;
    usedProvider?: string;
  };

  const attemptResults = await Promise.all(
    activeSlots.map((slot) => runVariantSlot(slot, promptBundle, registry, ctx, options))
  );

  const allAttempts = attemptResults;
  const safeAttempts = allAttempts.filter((a) => a.imageUrl && !a.blocked && !a.failed);

  if (!allAttempts.length) {
    try {
      const fallback = await generateStandardChain(imagePrompt, rawQuery, ctx);
      emitProgress(options, 'verifying', 'Final safety check…');
      const finalCheck = await verifyImageMatchesPrompt(fallback.imageUrl, rawQuery);
      if (finalCheck.blockedForSafety) {
        emitProgress(options, 'complete');
        return buildImageBlockedOutput(
          rawQuery,
          'image_blocked',
          'Fallback image was blocked by AI safety review.'
        );
      }
      emitProgress(options, 'complete');
      return {
        type: 'image',
        imageUrl: fallback.imageUrl,
        provider: fallback.provider,
        prompt: rawQuery,
        followUps: DEFAULT_FOLLOW_UPS,
        pros: ['Generated via fallback chain', `Format: ${formatLabel}`],
        verified: false,
        aspectFormat,
        isYoutubeThumbnail,
      };
    } catch {
      throw new ImageGenerationError(
        'All image providers failed. Try a more specific description.'
      );
    }
  }

  if (!safeAttempts.length) {
    emitProgress(options, 'complete');
    return buildImageBlockedOutput(
      rawQuery,
      'image_blocked',
      'All AI-generated images were blocked by safety review before display.'
    );
  }

  const pool = safeAttempts;
  let winner = [...pool].sort((a, b) => b.matchScore - a.matchScore)[0]!;

  if (options?.fast === false) {
    emitProgress(options, 'verifying', 'Final safety check on best image…');
    const winnerRecheck = await verifyImageMatchesPrompt(winner.imageUrl, rawQuery);
    if (winnerRecheck.blockedForSafety) {
      const remaining = pool.filter((a) => a.imageUrl !== winner.imageUrl);
      const alternate = remaining.sort((a, b) => b.matchScore - a.matchScore)[0];
      if (!alternate) {
        emitProgress(options, 'complete');
        return buildImageBlockedOutput(
          rawQuery,
          'image_blocked',
          'Best image failed final safety review — nothing safe to display.'
        );
      }
      winner = alternate;
    } else {
      winner = { ...winner, matchScore: winnerRecheck.matchScore, issues: winnerRecheck.issues };
    }
  }

  const serializedAttempts = activeSlots.map((slot, i) => {
    const a = attemptResults[i]!;
    return {
      imageUrl: a.imageUrl,
      provider: a.provider,
      matchScore: a.matchScore,
      issues: a.issues,
      scoresByVerifier: a.scoresByVerifier,
      selected: a.imageUrl === winner.imageUrl && !a.failed && !a.blocked,
      variantLabel: a.variantLabel ?? slot.label,
      variantIndex: a.variantIndex ?? slot.variantIndex,
      failed: a.failed,
      blocked: a.blocked,
    };
  }).filter((a) => Boolean(a.imageUrl) && !a.failed && !a.blocked);

  const others = serializedAttempts.filter((a) => a.imageUrl !== winner.imageUrl);

  emitProgress(options, 'complete');

  return {
    type: 'image',
    imageUrl: winner.imageUrl,
    provider: winner.provider,
    prompt: rawQuery,
    enhancedPrompt: imagePrompt !== rawQuery ? imagePrompt : undefined,
    followUps: DEFAULT_FOLLOW_UPS,
    pros: [
      `${safeAttempts.length}/${VARIANT_COUNT} AI variants — best: ${winner.variantLabel ?? winner.provider}`,
      `Format: ${formatLabel}`,
    ],
    cons:
      winner.matchScore < EXACT_MATCH_THRESHOLD
        ? ['No exact match — see all AI attempts below']
        : undefined,
    matchScore: winner.matchScore,
    verified: winner.matchScore >= EXACT_MATCH_THRESHOLD,
    aspectFormat,
    allAttempts: serializedAttempts,
    rejectedImages: others,
    isYoutubeThumbnail,
    variantCount: serializedAttempts.length,
  };
}

/** Live smoke test — tries each configured provider with a tiny prompt. */
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
        return { ok: true, provider: entry.name, imageUrl: imageUrl.slice(0, 120), tried, errors };
      }
      errors[entry.name] = 'Invalid URL returned';
    } catch (err) {
      errors[entry.name] = (err as Error).message;
      console.warn(`[ImageSmoke] ${entry.name}:`, errors[entry.name]);
    }
  }

  return { ok: false, error: 'All smoke-test providers failed', tried, errors };
}

/** Diagnostic — test every configured provider independently (always returns per-provider errors). */
export async function smokeTestAllImageProviders(): Promise<{
  prompt: string;
  results: Array<{
    provider: string;
    ok: boolean;
    imageUrl?: string;
    error?: string;
    ms: number;
  }>;
}> {
  const prompt = 'a red circle on white background, minimal test';
  const chain = [...buildStandardProviders(), ...buildPremiumProviders()].filter((p) => p.configured);
  const seen = new Set<string>();
  const unique = chain.filter((p) => {
    if (seen.has(p.name)) return false;
    seen.add(p.name);
    return true;
  });

  const results = await Promise.all(
    unique.map(async (entry) => {
      const started = Date.now();
      try {
        const imageUrl = await entry.call(prompt);
        const ms = Date.now() - started;
        if (!isValidImageResult(imageUrl)) {
          return { provider: entry.name, ok: false, error: 'Invalid URL returned', ms };
        }
        return { provider: entry.name, ok: true, imageUrl: imageUrl.slice(0, 120), ms };
      } catch (err) {
        return {
          provider: entry.name,
          ok: false,
          error: (err as Error).message,
          ms: Date.now() - started,
        };
      }
    })
  );

  return { prompt, results };
}

/** Full pipeline smoke — classify, enhance, generate (matches user flow). */
export async function smokeTestFullPipeline(
  userPrompt = 'generate a cyberpunk cat image'
): Promise<{ ok: boolean; provider?: string; imageUrl?: string; error?: string }> {
  try {
    const result = await generateImage(userPrompt);
    if (result.type === 'image_blocked') {
      return { ok: false, error: result.detail ?? 'Image blocked by safety review' };
    }
    return {
      ok: true,
      provider: result.provider,
      imageUrl: result.imageUrl.slice(0, 120),
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
