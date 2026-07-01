/**
 * Fast video path — ALL open-source models first, premium APIs last.
 */

import { hasSecret, getSecret } from '../../config/envSecrets.js';
import { REPLICATE_OSS_VIDEO_MODELS, runOssReplicateModel } from './ossVideoRegistry.js';
import { generateMinimaxReplicateVideo } from './replicateOssVideo.js';
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

const FAST_TIMEOUT_MS = 110_000;

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
        const result = await generateViaHfSpaces(prompt, durationSeconds, {
          userId: options?.userId,
          aspectRatio: options?.aspectRatio,
          scenePriority: options?.scenePriority,
        });
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

  // ── Tier 0: HuggingFace community GPUs ($0, round-robin) ──
  racers.push(...buildHfSpaceRacers(prompt, durationSeconds, options));

  // ── Tier 1: separate OSS hosts (API keys) ──
  if (hasSecret('DEEPINFRA_API_KEY')) {
    racers.push({ name: 'deepinfra', run: () => generateDeepInfraVideo(prompt, durationSeconds) });
  }
  if (hasSecret('AGNES_API_KEY')) {
    racers.push({ name: 'agnes', run: () => generateAgnesVideo(prompt, durationSeconds) });
  }
  if (getSecret('COMFYUI_URL')) {
    racers.push({ name: 'comfyui', run: () => generateComfyUIVideo(prompt, durationSeconds) });
  }

  // ── Tier 2: Replicate OSS models (all 15 families) ──
  if (hasSecret('REPLICATE_API_TOKEN')) {
    for (const model of REPLICATE_OSS_VIDEO_MODELS) {
      racers.push({
        name: model.id,
        run: () => runOssReplicateModel(model, prompt, durationSeconds),
      });
    }
    racers.push({ name: 'replicate-minimax', run: () => generateMinimaxReplicateVideo(prompt, durationSeconds) });
  }

  // ── Tier 3: optional OSS gateways ──
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

async function trySequential(
  group: Racer[],
  durationSeconds: number
): Promise<VideoGenerationResult | null> {
  for (const r of group) {
    try {
      const videoUrl = await withTimeout(r.run(), FAST_TIMEOUT_MS, r.name);
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
  const ossRacers = buildOssRacers(prompt, durationSeconds, options);
  const premiumRacers = buildPremiumRacers(prompt, durationSeconds, options?.aspectRatio, options?.userId);

  if (ossRacers.length === 0 && premiumRacers.length === 0) return null;

  const ossWinner = await trySequential(ossRacers, durationSeconds);
  if (ossWinner) {
    console.log(`[FastVideoRace] OSS winner: ${ossWinner.provider}`);
    return ossWinner;
  }

  console.warn('[FastVideoRace] All OSS models exhausted — trying premium APIs as last resort…');
  const premiumWinner = await trySequential(premiumRacers, durationSeconds);
  if (premiumWinner) {
    console.log(`[FastVideoRace] Premium winner: ${premiumWinner.provider}`);
    return premiumWinner;
  }

  return null;
}

export function isFastClip(durationSeconds: number): boolean {
  return durationSeconds <= 15;
}
