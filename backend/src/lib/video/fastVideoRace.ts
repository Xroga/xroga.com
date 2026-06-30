/**
 * Fast video path — OSS providers tried sequentially for short clips (≤15s).
 * Avoids Replicate 429 bursts from parallel predictions on one token.
 */

import { hasSecret } from '../../config/envSecrets.js';
import { generateMinimaxReplicateVideo, generateWanReplicateVideo, generateCogVideoX, generateZeroscopeVideo } from './replicateOssVideo.js';
import { generateDeepInfraVideo } from './deepinfraVideo.js';
import { generateAgnesVideo } from '../agnesVideo.js';
import { generateFalVideo } from './falVideo.js';
import { generateHailuoVideo } from './hailuoVideo.js';
import { generateLumaVideo } from './lumaVideo.js';
import { generateLumaReplicateVideo } from './lumaReplicateVideo.js';
import { generateRunwayVideo } from './runwayVideo.js';
import { isKlingConfigured } from './klingAuth.js';
import { generateKlingVideo } from './klingVideo.js';
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

function buildOssRacers(
  prompt: string,
  durationSeconds: number,
  userId?: string
): Racer[] {
  const racers: Racer[] = [];

  // DeepInfra + Agnes first — separate quotas from Replicate
  if (hasSecret('DEEPINFRA_API_KEY')) {
    racers.push({ name: 'deepinfra', run: () => generateDeepInfraVideo(prompt, durationSeconds) });
  }
  if (hasSecret('AGNES_API_KEY')) {
    racers.push({ name: 'agnes', run: () => generateAgnesVideo(prompt, durationSeconds) });
  }

  // Replicate OSS models one-at-a-time (shared rate limit / credits)
  if (hasSecret('REPLICATE_API_TOKEN')) {
    racers.push({ name: 'replicate-wan', run: () => generateWanReplicateVideo(prompt, durationSeconds) });
    racers.push({ name: 'replicate-minimax', run: () => generateMinimaxReplicateVideo(prompt, durationSeconds) });
    racers.push({ name: 'cogvideox', run: () => generateCogVideoX(prompt, durationSeconds) });
    racers.push({ name: 'zeroscope', run: () => generateZeroscopeVideo(prompt, durationSeconds) });
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

/** First successful provider wins; returns null if all fail */
export async function raceVideoProviders(
  prompt: string,
  durationSeconds: number,
  options?: { aspectRatio?: '9:16' | '16:9'; userId?: string }
): Promise<VideoGenerationResult | null> {
  const ossRacers = buildOssRacers(prompt, durationSeconds, options?.userId);
  const premiumRacers = buildPremiumRacers(prompt, durationSeconds, options?.aspectRatio, options?.userId);

  if (ossRacers.length === 0 && premiumRacers.length === 0) return null;

  const ossWinner = await trySequential(ossRacers, durationSeconds);
  if (ossWinner) {
    console.log(`[FastVideoRace] OSS winner: ${ossWinner.provider}`);
    return ossWinner;
  }

  console.warn('[FastVideoRace] OSS exhausted, trying premium providers…');
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
