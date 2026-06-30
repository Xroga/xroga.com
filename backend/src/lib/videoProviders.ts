import { filterByVault, recordVaultUsage } from '../services/omniReality/creditVault.js';
import { getApiPriority, VIDEO_API_TIMEOUT_MS } from '../config/apiPriorities.js';
import { logSystemError } from '../services/systemErrorLog.js';
import { getSecret, hasSecret } from '../config/envSecrets.js';
import { generateAgnesVideo } from './agnesVideo.js';
import { generateAgnesImage } from './agnes.js';
import { generateRunwayVideo } from './video/runwayVideo.js';
import { generateLumaVideo } from './video/lumaVideo.js';
import { generateHailuoVideo } from './video/hailuoVideo.js';
import { generateFalVideo } from './video/falVideo.js';
import { generateKlingVideo } from './video/klingVideo.js';
import { isKlingConfigured } from './video/klingAuth.js';
import { generateReplicateVideo } from './video/replicateVideo.js';
import {
  generateCogVideoX,
  generateAnimateDiff,
  generateMinimaxReplicateVideo,
  generateWanReplicateVideo,
} from './video/replicateOssVideo.js';
import { generateComfyUIVideo } from './video/comfyuiVideo.js';
import { generateDeepInfraVideo } from './video/deepinfraVideo.js';
import { generateLumaReplicateVideo } from './video/lumaReplicateVideo.js';
import { generateSlideshowVideo } from './video/slideshow.js';
import { sanitizeVideoPrompt } from './video/videoPrompt.js';
import { generateImage } from '../services/builder/imageGen.js';
import { isFfmpegAvailable } from './video/ffmpegPath.js';

export interface VideoGenerationResult {
  provider: string;
  videoUrl: string;
  durationSeconds: number;
}

export type VideoProviderName =
  | 'runway'
  | 'luma'
  | 'hailuo'
  | 'kling'
  | 'fal'
  | 'replicate-svd'
  | 'replicate-minimax'
  | 'replicate-wan'
  | 'deepinfra'
  | 'luma-replicate'
  | 'cogvideox'
  | 'animatediff'
  | 'agnes'
  | 'morph'
  | 'comfyui'
  | 'slideshow';

type ProviderEntry = {
  name: VideoProviderName;
  configured: boolean;
  call: (
    prompt: string,
    durationSeconds: number,
    options?: { aspectRatio?: '9:16' | '16:9'; userId?: string }
  ) => Promise<string>;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

function providerTimeout(name: VideoProviderName): number {
  if (name === 'agnes') return 180_000;
  if (name === 'slideshow') return 120_000;
  if (name === 'fal' || name === 'hailuo') return 150_000;
  return VIDEO_API_TIMEOUT_MS;
}

async function generateMorphVideo(prompt: string, durationSeconds: number): Promise<string> {
  const apiKey = process.env.MORPH_API_KEY;
  if (!apiKey) throw new Error('MORPH_API_KEY not configured');

  const response = await fetch('https://api.morphstudio.com/v1/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      prompt,
      duration: durationSeconds,
      camera: { pan: true, tilt: true, zoom: true },
    }),
  });

  if (!response.ok) throw new Error(`Morph Studio error: ${response.status}`);

  const data = (await response.json()) as { video_url: string };
  return data.video_url;
}

async function generateImageToSlideshowVideo(
  prompt: string,
  durationSeconds: number,
  options?: { aspectRatio?: '9:16' | '16:9'; userId?: string }
): Promise<string> {
  const clean = sanitizeVideoPrompt(prompt);
  const vertical = options?.aspectRatio === '9:16';
  let imageUrl: string | undefined;
  try {
    const out = await generateImage(`Cinematic film still: ${clean}`, {
      userId: options?.userId,
      fast: true,
      aspectFormat: vertical ? '9:16' : '16:9',
    });
    if (out.type !== 'image_blocked' && out.imageUrl) imageUrl = out.imageUrl;
  } catch {
  }
  if (!imageUrl) {
    try {
      imageUrl = await generateAgnesImage(clean.slice(0, 500));
    } catch {
      /* gradient frame in slideshow */
    }
  }
  return generateSlideshowVideo(clean, durationSeconds, imageUrl, vertical);
}

function buildVideoProviders(): ProviderEntry[] {
  return [
    // OSS workhorse (80%) — tried first
    {
      name: 'replicate-minimax',
      configured: hasSecret('REPLICATE_API_TOKEN'),
      call: (prompt, duration) => generateMinimaxReplicateVideo(prompt, duration),
    },
    {
      name: 'replicate-wan',
      configured: hasSecret('REPLICATE_API_TOKEN'),
      call: (prompt, duration) => generateWanReplicateVideo(prompt, duration),
    },
    {
      name: 'deepinfra',
      configured: hasSecret('DEEPINFRA_API_KEY'),
      call: (prompt, duration) => generateDeepInfraVideo(prompt, duration),
    },
    {
      name: 'cogvideox',
      configured: hasSecret('REPLICATE_API_TOKEN'),
      call: (prompt, duration) => generateCogVideoX(prompt, duration),
    },
    {
      name: 'animatediff',
      configured: hasSecret('REPLICATE_API_TOKEN'),
      call: (prompt, duration) => generateAnimateDiff(prompt, duration),
    },
    {
      name: 'replicate-svd',
      configured: hasSecret('REPLICATE_API_TOKEN'),
      call: (prompt, _duration, opts) => generateReplicateVideo(prompt, { userId: opts?.userId }),
    },
    {
      name: 'agnes',
      configured: hasSecret('AGNES_API_KEY'),
      call: generateAgnesVideo,
    },
    {
      name: 'comfyui',
      configured: Boolean(getSecret('COMFYUI_URL')),
      call: generateComfyUIVideo,
    },
    // Premium (20%)
    {
      name: 'fal',
      configured: hasSecret('FAL_KEY'),
      call: (prompt, duration, opts) => generateFalVideo(prompt, duration, { aspectRatio: opts?.aspectRatio }),
    },
    {
      name: 'hailuo',
      configured: hasSecret('HAILUO_API_KEY'),
      call: (prompt, duration, opts) => generateHailuoVideo(prompt, duration, { aspectRatio: opts?.aspectRatio }),
    },
    {
      name: 'kling',
      configured: isKlingConfigured(),
      call: (prompt, duration, opts) => generateKlingVideo(prompt, duration, { aspectRatio: opts?.aspectRatio }),
    },
    {
      name: 'luma',
      configured: hasSecret('LUMA_API_KEY'),
      call: generateLumaVideo,
    },
    {
      name: 'luma-replicate',
      configured: hasSecret('REPLICATE_API_TOKEN'),
      call: (prompt, duration, opts) => generateLumaReplicateVideo(prompt, duration, { aspectRatio: opts?.aspectRatio }),
    },
    {
      name: 'runway',
      configured: hasSecret('RUNWAY_API_KEY'),
      call: (prompt, duration, opts) => generateRunwayVideo(prompt, duration, { aspectRatio: opts?.aspectRatio, userId: opts?.userId }),
    },
    {
      name: 'morph',
      configured: Boolean(getSecret('MORPH_API_KEY')),
      call: generateMorphVideo,
    },
  ];
}

async function buildVideoProvidersAsync(): Promise<ProviderEntry[]> {
  const providers = buildVideoProviders();
  const ffmpegOk = await isFfmpegAvailable();
  if (ffmpegOk) {
    providers.push({
      name: 'slideshow',
      configured: true,
      call: (prompt, duration, opts) => generateImageToSlideshowVideo(prompt, duration, opts),
    });
  }
  return providers;
}

function isValidVideoUrl(url: string): boolean {
  if (!url?.trim()) return false;
  if (url.includes('simulated') || url.includes('xroga.local')) return false;
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('data:video/')
  );
}

export function getVideoProviderStatus(): { configured: string[]; ready: boolean; keys: Record<string, boolean> } {
  const providers = buildVideoProviders();
  const configured = providers.filter((p) => p.configured && p.name !== 'slideshow').map((p) => p.name);
  const keys: Record<string, boolean> = {};
  for (const p of providers) {
    keys[p.name] = p.configured;
  }
  return { configured, ready: configured.length > 0, keys };
}

/** Direct provider loop — no circuit breaker (same lesson as imageGen). */
export async function generateVideoWithFallback(
  prompt: string,
  durationSeconds: number,
  options?: {
    priority?: 'premium' | 'cheap' | 'auto';
    userId?: string;
    runId?: string;
    keyframeUrl?: string;
    aspectRatio?: '9:16' | '16:9';
  }
): Promise<VideoGenerationResult> {
  const cleanPrompt = sanitizeVideoPrompt(prompt);
  const priorityList = await getApiPriority('video');
  const allProviders = await buildVideoProvidersAsync();
  const providerMap = new Map(allProviders.map((p) => [p.name, p]));

  const premiumSet = new Set(['runway', 'luma']);
  const cheapSet = new Set([
    'replicate-minimax', 'replicate-wan', 'deepinfra', 'cogvideox', 'animatediff',
    'replicate-svd', 'agnes', 'comfyui', 'luma-replicate', 'hailuo', 'kling', 'fal', 'morph',
  ]);

  let orderedNames = priorityList.filter((name) => providerMap.has(name as VideoProviderName));

  if (options?.priority === 'premium') {
    orderedNames = orderedNames.filter((n) => premiumSet.has(n) || n === 'slideshow');
  } else if (options?.priority === 'cheap') {
    orderedNames = orderedNames.filter((n) => cheapSet.has(n) || n === 'comfyui' || n === 'slideshow');
  }

  orderedNames.push('slideshow');

  orderedNames = filterByVault(orderedNames);

  const errors: string[] = [];

  for (const name of orderedNames) {
    const entry = providerMap.get(name as VideoProviderName);
    if (!entry?.configured) continue;

    try {
      const videoUrl = await withTimeout(
        entry.call(cleanPrompt, durationSeconds, {
          aspectRatio: options?.aspectRatio,
          userId: options?.userId,
        }),
        providerTimeout(name as VideoProviderName),
        name
      );
      if (!isValidVideoUrl(videoUrl)) {
        errors.push(`${name}: invalid URL`);
        continue;
      }

      recordVaultUsage(name);

      return { provider: name, videoUrl, durationSeconds };
    } catch (err) {
      const msg = (err as Error).message;
      errors.push(`${name}: ${msg.slice(0, 100)}`);
      await logSystemError({
        api: name,
        errorMessage: msg,
        fallbackUsed: 'trying next video provider',
        severity: 'warning',
        userId: options?.userId,
        runId: options?.runId,
        metadata: { apiType: 'video' },
      });
    }
  }

  if (providerMap.has('slideshow')) {
    try {
      const slideshowUrl = await generateSlideshowVideo(
        cleanPrompt,
        durationSeconds,
        options?.keyframeUrl,
        options?.aspectRatio === '9:16'
      );
      if (isValidVideoUrl(slideshowUrl)) {
        return { provider: 'slideshow', videoUrl: slideshowUrl, durationSeconds };
      }
    } catch (err) {
      errors.push(`slideshow: ${(err as Error).message.slice(0, 100)}`);
    }
  }

  throw new Error(
    `All video providers failed. ${errors.slice(0, 4).join(' | ')}`
  );
}

/** Legacy parallel generation — now uses single best-result fallback chain per scene */
export async function generateVideosParallel(
  scenePrompt: string,
  durationSeconds: number,
  options?: { userId?: string; runId?: string; priority?: 'premium' | 'cheap' | 'auto' }
): Promise<VideoGenerationResult[]> {
  const result = await generateVideoWithFallback(scenePrompt, durationSeconds, options);
  return [result];
}

export async function smokeTestVideoGeneration(): Promise<{
  ok: boolean;
  provider?: string;
  error?: string;
  tried: string[];
  errors?: Record<string, string>;
}> {
  const tried: string[] = [];
  const errors: Record<string, string> = {};
  const prompt = 'A cat walking on a beach at sunset, cinematic, 2 seconds';

  const chain = await buildVideoProvidersAsync();
  const ossOrder = ['replicate-minimax', 'replicate-wan', 'deepinfra', 'cogvideox', 'animatediff', 'replicate-svd'] as const;
  const configured = chain.filter((p) => p.configured && p.name !== 'slideshow');
  const ordered = [
    ...ossOrder.map((n) => configured.find((p) => p.name === n)).filter(Boolean),
    ...configured.filter((p) => !ossOrder.includes(p.name as typeof ossOrder[number])),
  ] as typeof configured;

  for (const p of ordered) {
    tried.push(p.name);
    try {
      const url = await withTimeout(p.call(prompt, 3), providerTimeout(p.name), p.name);
      if (isValidVideoUrl(url)) {
        return { ok: true, provider: p.name, tried, errors };
      }
      errors[p.name] = 'Invalid URL returned';
    } catch (err) {
      errors[p.name] = (err as Error).message;
      console.warn(`[VideoSmoke] ${p.name}:`, errors[p.name]);
    }
  }

  return {
    ok: false,
    error: `All video providers failed. ${Object.entries(errors).slice(0, 4).map(([k, v]) => `${k}: ${v.slice(0, 80)}`).join(' | ')}`,
    tried,
    errors,
  };
}
