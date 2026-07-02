/**
 * Fast video path — ALL open-source models first, premium APIs last.
 * Fast clips (≤15s) use parallel racing + capped sequential attempts so users
 * always get a video within ~2 minutes instead of timing out on 20+ providers.
 */

import { hasSecret, getSecret } from '../../config/envSecrets.js';
import { REPLICATE_OSS_VIDEO_MODELS, runOssReplicateModel } from './ossVideoRegistry.js';
import { generateMinimaxReplicateVideo } from './replicateOssVideo.js';
import { generateLtxHfVideo } from './ltxHfVideo.js';
import { generateDeepInfraVideo } from './deepinfraVideo.js';
import { generateAgnesVideo } from '../agnesVideo.js';
import { generateComfyUIVideo } from './comfyuiVideo.js';
import { generateFalVideo } from './falVideo.js';
import { generateHailuoVideo } from './hailuoVideo.js';
import { generateLumaVideo } from './lumaVideo.js';
import { generateLumaReplicateVideo } from './lumaReplicateVideo.js';
import { generateRunwayVideo } from './runwayVideo.js';
import { isKlingConfigured } from './klingAuth.js';
import { generateKlingVideo } from './klingVideo.js';
import { generateOviVideo } from './oviVideo.js';
import { generateSkyReelsVideo } from './piapiVideo.js';
import { generateViaHfSpaces } from './videoOrchestrator.js';
import type { VideoGenerationResult } from '../videoProviders.js';

const DEFAULT_TIMEOUT_MS = 90_000;
const FAST_CLIP_TIMEOUT_MS = 45_000;
const FAST_CLIP_PARALLEL = 4;
const FAST_CLIP_MAX_SEQUENTIAL = 4;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

type Racer = { name: string; run: () => Promise<string> };

export interface FastVideoRaceOptions {
  aspectRatio?: '9:16' | '16:9';
  userId?: string;
  scenePriority?: string;
  keyframeUrl?: string;
}

function buildHfSpaceRacers(
  prompt: string,
  durationSeconds: number,
  options?: FastVideoRaceOptions
): Racer[] {
  return [
    {
      name: 'hf-spaces',
      run: async () => {
        const result = await withTimeout(
          generateViaHfSpaces(prompt, durationSeconds, {
            userId: options?.userId,
            aspectRatio: options?.aspectRatio,
            scenePriority: options?.scenePriority,
            keyframeUrl: options?.keyframeUrl,
            maxAttempts: isFastClip(durationSeconds) ? 8 : 15,
          }),
          isFastClip(durationSeconds) ? 70_000 : 120_000,
          'hf-spaces'
        );
        return result.videoUrl;
      },
    },
  ];
}

function buildOssRacers(
  prompt: string,
  durationSeconds: number,
  options?: FastVideoRaceOptions
): Racer[] {
  const racers: Racer[] = [];

  racers.push({
    name: 'hf-ltx-video',
    run: async () => {
      const result = await withTimeout(
        generateLtxHfVideo(prompt, durationSeconds, options?.aspectRatio ?? '16:9'),
        150_000,
        'hf-ltx-video'
      );
      return result.videoUrl;
    },
  });

  racers.push(...buildHfSpaceRacers(prompt, durationSeconds, options));

  if (hasSecret('DEEPINFRA_API_KEY')) {
    racers.push({ name: 'deepinfra', run: () => generateDeepInfraVideo(prompt, durationSeconds) });
  }
  if (hasSecret('AGNES_API_KEY')) {
    racers.push({ name: 'agnes', run: () => generateAgnesVideo(prompt, durationSeconds) });
  }
  if (getSecret('COMFYUI_URL')) {
    racers.push({ name: 'comfyui', run: () => generateComfyUIVideo(prompt, durationSeconds) });
  }

  if (hasSecret('REPLICATE_API_TOKEN')) {
    for (const model of REPLICATE_OSS_VIDEO_MODELS) {
      racers.push({
        name: model.id,
        run: () => runOssReplicateModel(model, prompt, durationSeconds),
      });
    }
    racers.push({ name: 'replicate-minimax', run: () => generateMinimaxReplicateVideo(prompt, durationSeconds) });
  }

  if (hasSecret('PIAPI_API_KEY')) {
    racers.push({
      name: 'skyreels',
      run: () =>
        generateSkyReelsVideo(prompt, {
          userId: options?.userId,
          aspectRatio: options?.aspectRatio,
        }),
    });
  }
  if (hasSecret('FAL_KEY') || hasSecret('REPLICATE_API_TOKEN')) {
    racers.push({
      name: 'ovi',
      run: () => generateOviVideo(prompt, durationSeconds, { userId: options?.userId }),
    });
  }

  return racers;
}

function buildPremiumRacers(
  prompt: string,
  durationSeconds: number,
  aspectRatio?: '9:16' | '16:9',
  userId?: string
): Racer[] {
  const racers: Racer[] = [];

  if (hasSecret('FAL_KEY')) {
    racers.push({ name: 'fal', run: () => generateFalVideo(prompt, durationSeconds, { aspectRatio }) });
  }
  if (hasSecret('HAILUO_API_KEY')) {
    racers.push({ name: 'hailuo', run: () => generateHailuoVideo(prompt, durationSeconds, { aspectRatio }) });
  }
  if (isKlingConfigured()) {
    racers.push({ name: 'kling', run: () => generateKlingVideo(prompt, durationSeconds, { aspectRatio }) });
  }
  if (hasSecret('LUMA_API_KEY')) {
    racers.push({ name: 'luma', run: () => generateLumaVideo(prompt, durationSeconds, { aspectRatio }) });
  }
  if (hasSecret('REPLICATE_API_TOKEN')) {
    racers.push({ name: 'luma-replicate', run: () => generateLumaReplicateVideo(prompt, durationSeconds, { aspectRatio }) });
  }
  if (hasSecret('RUNWAY_API_KEY')) {
    racers.push({ name: 'runway', run: () => generateRunwayVideo(prompt, durationSeconds, { aspectRatio, userId }) });
  }

  return racers;
}

async function tryParallelRace(
  group: Racer[],
  durationSeconds: number,
  count: number,
  timeoutMs: number
): Promise<VideoGenerationResult | null> {
  const batch = group.slice(0, count);
  if (batch.length === 0) return null;

  try {
    const winner = await Promise.any(
      batch.map((r) =>
        withTimeout(r.run(), timeoutMs, r.name).then((videoUrl) => ({
          provider: r.name,
          videoUrl,
          durationSeconds,
        }))
      )
    );
    return winner;
  } catch {
    for (const r of batch) {
      try {
        const videoUrl = await withTimeout(r.run(), timeoutMs, r.name);
        return { provider: r.name, videoUrl, durationSeconds };
      } catch (err) {
        console.warn(`[FastVideoRace] parallel-fallback ${r.name}:`, (err as Error).message.slice(0, 120));
      }
    }
    return null;
  }
}

async function trySequential(
  group: Racer[],
  durationSeconds: number,
  maxAttempts: number,
  timeoutMs: number,
  startIndex = 0
): Promise<VideoGenerationResult | null> {
  const slice = group.slice(startIndex, startIndex + maxAttempts);
  for (const r of slice) {
    try {
      const videoUrl = await withTimeout(r.run(), timeoutMs, r.name);
      return { provider: r.name, videoUrl, durationSeconds };
    } catch (err) {
      console.warn(`[FastVideoRace] ${r.name}:`, (err as Error).message.slice(0, 120));
    }
  }
  return null;
}

/** OSS models first; premium only if every open-source path fails */
export async function raceVideoProviders(
  prompt: string,
  durationSeconds: number,
  options?: FastVideoRaceOptions
): Promise<VideoGenerationResult | null> {
  const fastClip = isFastClip(durationSeconds);
  const timeoutMs = fastClip ? FAST_CLIP_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
  const maxSequential = fastClip ? FAST_CLIP_MAX_SEQUENTIAL : 8;

  const ossRacers = buildOssRacers(prompt, durationSeconds, options);
  const premiumRacers = buildPremiumRacers(prompt, durationSeconds, options?.aspectRatio, options?.userId);

  if (ossRacers.length === 0 && premiumRacers.length === 0) return null;

  if (fastClip && ossRacers.length > 0) {
    const parallelWinner = await tryParallelRace(ossRacers, durationSeconds, FAST_CLIP_PARALLEL, timeoutMs);
    if (parallelWinner) {
      console.log(`[FastVideoRace] OSS parallel winner: ${parallelWinner.provider}`);
      return parallelWinner;
    }
  }

  const ossWinner = await trySequential(ossRacers, durationSeconds, maxSequential, timeoutMs, fastClip ? FAST_CLIP_PARALLEL : 0);
  if (ossWinner) {
    console.log(`[FastVideoRace] OSS winner: ${ossWinner.provider}`);
    return ossWinner;
  }

  console.warn('[FastVideoRace] OSS exhausted — trying premium APIs…');

  if (fastClip && premiumRacers.length > 0) {
    const premiumParallel = await tryParallelRace(premiumRacers, durationSeconds, 2, timeoutMs);
    if (premiumParallel) {
      console.log(`[FastVideoRace] Premium parallel winner: ${premiumParallel.provider}`);
      return premiumParallel;
    }
  }

  const premiumWinner = await trySequential(
    premiumRacers,
    durationSeconds,
    fastClip ? 3 : maxSequential,
    timeoutMs,
    fastClip ? 2 : 0
  );
  if (premiumWinner) {
    console.log(`[FastVideoRace] Premium winner: ${premiumWinner.provider}`);
    return premiumWinner;
  }

  return null;
}

export function isFastClip(durationSeconds: number): boolean {
  return durationSeconds <= 15;
}
