import { filterByVault, recordVaultUsage } from '../services/omniReality/creditVault.js';
import { getApiPriority, VIDEO_API_TIMEOUT_MS } from '../config/apiPriorities.js';
import { logSystemError } from '../services/systemErrorLog.js';
import { generateAgnesVideo } from './agnesVideo.js';
import { generateAgnesImage } from './agnes.js';
import { generateRunwayVideo } from './video/runwayVideo.js';
import { generateLumaVideo } from './video/lumaVideo.js';
import { generateHailuoVideo } from './video/hailuoVideo.js';
import { generateFalVideo } from './video/falVideo.js';
import { generateReplicateVideo } from './video/replicateVideo.js';
import { generateCogVideoX, generateAnimateDiff } from './video/replicateOssVideo.js';
import { generateComfyUIVideo } from './video/comfyuiVideo.js';
import { generateSlideshowVideo } from './video/slideshow.js';
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
    options?: { aspectRatio?: '9:16' | '16:9' }
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
  return VIDEO_API_TIMEOUT_MS;
}


async function pollKlingTask(taskId: string, apiKey: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const res = await fetch(`https://api.klingai.com/v1/videos/text2video/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = (await res.json()) as {
      data: { task_status: string; task_result?: { videos?: Array<{ url: string }> } };
    };
    if (data.data.task_status === 'succeed' && data.data.task_result?.videos?.[0]?.url) {
      return data.data.task_result.videos[0].url;
    }
    if (data.data.task_status === 'failed') throw new Error('Kling video failed');
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Kling video timed out');
}

async function generateKlingVideo(prompt: string, durationSeconds: number): Promise<string> {
  const apiKey = process.env.KLING_API_KEY;
  if (!apiKey) throw new Error('KLING_API_KEY not configured');

  const response = await fetch('https://api.klingai.com/v1/videos/text2video', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ prompt, duration: String(durationSeconds), mode: 'std' }),
  });

  if (!response.ok) throw new Error(`Kling AI error: ${response.status}`);

  const data = (await response.json()) as { data: { task_id: string } };
  return pollKlingTask(data.data.task_id, apiKey);
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
  options?: { aspectRatio?: '9:16' | '16:9' }
): Promise<string> {
  let imageUrl: string | undefined;
  try {
    imageUrl = await generateAgnesImage(prompt.slice(0, 500));
  } catch {
    /* use placeholder in slideshow */
  }
  return generateSlideshowVideo(prompt, durationSeconds, imageUrl, options?.aspectRatio === '9:16');
}

function buildVideoProviders(): ProviderEntry[] {
  return [
    {
      name: 'agnes',
      configured: Boolean(process.env.AGNES_API_KEY),
      call: generateAgnesVideo,
    },
    {
      name: 'kling',
      configured: Boolean(process.env.KLING_API_KEY),
      call: generateKlingVideo,
    },
    {
      name: 'fal',
      configured: Boolean(process.env.FAL_KEY ?? process.env.FAL_API_KEY),
      call: generateFalVideo,
    },
    {
      name: 'hailuo',
      configured: Boolean(process.env.HAILUO_API_KEY ?? process.env.MINIMAX_API_KEY),
      call: generateHailuoVideo,
    },
    {
      name: 'runway',
      configured: Boolean(process.env.RUNWAY_API_KEY),
      call: generateRunwayVideo,
    },
    {
      name: 'luma',
      configured: Boolean(process.env.LUMA_API_KEY),
      call: generateLumaVideo,
    },
    {
      name: 'cogvideox',
      configured: Boolean(process.env.REPLICATE_API_TOKEN),
      call: (prompt, duration) => generateCogVideoX(prompt, duration),
    },
    {
      name: 'animatediff',
      configured: Boolean(process.env.REPLICATE_API_TOKEN),
      call: (prompt, duration) => generateAnimateDiff(prompt, duration),
    },
    {
      name: 'replicate-svd',
      configured: Boolean(process.env.REPLICATE_API_TOKEN),
      call: (prompt) => generateReplicateVideo(prompt),
    },
    {
      name: 'morph',
      configured: Boolean(process.env.MORPH_API_KEY),
      call: generateMorphVideo,
    },
    {
      name: 'comfyui',
      configured: Boolean(process.env.COMFYUI_URL),
      call: generateComfyUIVideo,
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
  const priorityList = await getApiPriority('video');
  const allProviders = await buildVideoProvidersAsync();
  const providerMap = new Map(allProviders.map((p) => [p.name, p]));

  const premiumSet = new Set(['runway', 'luma']);
  const cheapSet = new Set(['hailuo', 'kling', 'fal', 'replicate-svd', 'cogvideox', 'animatediff', 'agnes', 'morph']);

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
        entry.call(prompt, durationSeconds, { aspectRatio: options?.aspectRatio }),
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
        prompt,
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
}> {
  const tried: string[] = [];
  const errors: Record<string, string> = {};
  const prompt = 'A cat walking on a beach at sunset, cinematic, 2 seconds';

  const chain = await buildVideoProvidersAsync();
  const configured = chain.filter((p) => p.configured);

  for (const p of configured) {
    tried.push(p.name);
    try {
      const url = await withTimeout(p.call(prompt, 3), providerTimeout(p.name), p.name);
      if (isValidVideoUrl(url)) {
        return { ok: true, provider: p.name, tried };
      }
      errors[p.name] = 'Invalid URL returned';
    } catch (err) {
      errors[p.name] = (err as Error).message;
      console.warn(`[VideoSmoke] ${p.name}:`, errors[p.name]);
    }
  }

  return {
    ok: false,
    error: `All video providers failed. ${Object.entries(errors).slice(0, 3).map(([k, v]) => `${k}: ${v.slice(0, 80)}`).join(' | ')}`,
    tried,
  };
}
