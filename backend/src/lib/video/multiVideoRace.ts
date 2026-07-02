/**
 * Multi-AI video race — LTX HF first (verified free T2V), then Replicate OSS, then cinematic parallax.
 */

import { sanitizeVideoPrompt } from './videoPrompt.js';
import { generateLtxHfVideo } from './ltxHfVideo.js';
import { generateParallaxClip } from '../../services/omniReality/fallbackParallax.js';
import { getStaticMp4DataUrl } from './staticMp4.js';
import { hasSecret } from '../../config/envSecrets.js';
import { generateLtxVideo } from './replicateOssVideo.js';
import type { VideoGenerationResult } from '../videoProviders.js';

const MAX_VARIANTS = 3;
const LTX_TIMEOUT_MS = 155_000;

export interface MultiVideoRaceOptions {
  userId?: string;
  aspectRatio?: '9:16' | '16:9';
  scenePriority?: string;
  keyframeUrl?: string;
  maxVariants?: number;
  /** Pre-started LTX promise from early parallel kick-off */
  earlyLtx?: Promise<VideoGenerationResult | null>;
}

export interface MultiVideoRaceResult {
  videos: VideoGenerationResult[];
  primary: VideoGenerationResult;
  attemptedProviders: string[];
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out`)), ms)
    ),
  ]);
}

const OSS_PROVIDERS = new Set([
  'hf-ltx-video', 'ltx-video', 'hf-spaces',
  'deepinfra', 'agnes', 'comfyui', 'replicate-wan', 'hunyuan', 'mochi', 'cogvideox',
  'open-sora', 'pyramid-flow', 'allegro', 'kandinsky', 'videocrafter', 'animatediff', 'zeroscope',
]);

export function isRealOssVideoProvider(provider: string): boolean {
  return OSS_PROVIDERS.has(provider) || provider.startsWith('hf-');
}

async function tryLtxHf(
  prompt: string,
  dur: number,
  aspectRatio: '9:16' | '16:9',
  earlyLtx?: Promise<VideoGenerationResult | null>
): Promise<VideoGenerationResult | null> {
  if (earlyLtx) {
    try {
      const early = await earlyLtx;
      if (early?.videoUrl) return early;
    } catch {
      /* fall through to fresh attempt */
    }
  }

  try {
    return await withTimeout(
      generateLtxHfVideo(prompt, dur, aspectRatio),
      LTX_TIMEOUT_MS,
      'ltx-hf'
    );
  } catch (err) {
    console.warn('[MultiVideoRace] LTX HF:', (err as Error).message.slice(0, 120));
    return null;
  }
}

async function tryReplicateLtx(
  prompt: string,
  dur: number
): Promise<VideoGenerationResult | null> {
  if (!hasSecret('REPLICATE_API_TOKEN')) return null;
  try {
    const videoUrl = await withTimeout(
      generateLtxVideo(prompt, dur),
      90_000,
      'replicate-ltx'
    );
    return { provider: 'ltx-video', videoUrl, durationSeconds: dur };
  } catch (err) {
    console.warn('[MultiVideoRace] Replicate LTX:', (err as Error).message.slice(0, 100));
    return null;
  }
}

/**
 * Run OSS text-to-video; return 1–3 playable videos.
 * LTX HuggingFace is the primary free path — never burn minutes on dead HF mirrors.
 */
export async function raceMultipleOssVideos(
  prompt: string,
  durationSeconds: number,
  options?: MultiVideoRaceOptions
): Promise<MultiVideoRaceResult> {
  const dur = Math.min(Math.max(durationSeconds, 3), 30);
  const maxVariants = options?.maxVariants ?? MAX_VARIANTS;
  const aspectRatio = options?.aspectRatio ?? '16:9';
  const clean = sanitizeVideoPrompt(prompt);
  const attemptedProviders: string[] = [];
  const videos: VideoGenerationResult[] = [];

  const ltx = await tryLtxHf(clean, dur, aspectRatio, options?.earlyLtx);
  if (ltx?.videoUrl) {
    attemptedProviders.push(ltx.provider);
    videos.push(ltx);
    console.log('[MultiVideoRace] LTX HF winner');
  }

  if (videos.length < maxVariants) {
    const rep = await tryReplicateLtx(clean, dur);
    if (rep?.videoUrl && !videos.some((v) => v.videoUrl === rep.videoUrl)) {
      attemptedProviders.push(rep.provider);
      videos.push(rep);
      console.log('[MultiVideoRace] Replicate LTX winner');
    }
  }

  if (videos.length === 0) {
    try {
      const parallax = await generateParallaxClip(clean, dur, {
        keyframeUrl: options?.keyframeUrl,
        vertical: aspectRatio === '9:16',
        userId: options?.userId,
      });
      attemptedProviders.push(parallax.provider);
      videos.push(parallax);
      console.log('[MultiVideoRace] Parallax fallback (Pollinations image + Ken Burns)');
    } catch (err) {
      console.warn('[MultiVideoRace] parallax failed:', (err as Error).message);
    }
  }

  if (videos.length === 0) {
    attemptedProviders.push('static-mp4');
    videos.push({
      provider: 'static-mp4',
      videoUrl: getStaticMp4DataUrl(),
      durationSeconds: dur,
    });
  }

  const primary = videos.find((v) => isRealOssVideoProvider(v.provider)) ?? videos[0]!;
  const sorted = [primary, ...videos.filter((v) => v.videoUrl !== primary.videoUrl)].slice(0, maxVariants);

  return { videos: sorted, primary: sorted[0]!, attemptedProviders };
}
