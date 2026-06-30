/**
 * Fast video path — OSS providers race first for short clips (≤15s).
 * Target: real MP4 in under 2 minutes without premium API credits.
 */

import { hasSecret } from '../../config/envSecrets.js';
import { generateMinimaxReplicateVideo, generateWanReplicateVideo, generateCogVideoX, generateAnimateDiff } from './replicateOssVideo.js';
import { generateDeepInfraVideo } from './deepinfraVideo.js';
import { tryImageToVideo } from './imageToVideo.js';
import { generateReplicateVideo } from './replicateVideo.js';
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

function buildRacers(
  prompt: string,
  durationSeconds: number,
  aspectRatio?: '9:16' | '16:9',
  userId?: string
): Racer[] {
  const racers: Racer[] = [];

  // ── OSS / free (80%) — tried first in parallel ──
  if (hasSecret('REPLICATE_API_TOKEN')) {
    racers.push({ name: 'replicate-minimax', run: () => generateMinimaxReplicateVideo(prompt, durationSeconds) });
    racers.push({ name: 'replicate-wan', run: () => generateWanReplicateVideo(prompt, durationSeconds) });
    racers.push({ name: 'cogvideox', run: () => generateCogVideoX(prompt, durationSeconds) });
    racers.push({ name: 'animatediff', run: () => generateAnimateDiff(prompt, durationSeconds) });
    racers.push({ name: 'replicate-svd', run: () => generateReplicateVideo(prompt, { userId }) });
  }
  if (hasSecret('DEEPINFRA_API_KEY')) {
    racers.push({ name: 'deepinfra', run: () => generateDeepInfraVideo(prompt, durationSeconds) });
  }

  // ── Premium (20%) — only if OSS racers all fail ──
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

/** First successful provider wins; returns null if all fail */
export async function raceVideoProviders(
  prompt: string,
  durationSeconds: number,
  options?: { aspectRatio?: '9:16' | '16:9'; userId?: string }
): Promise<VideoGenerationResult | null> {
  const racers = buildRacers(prompt, durationSeconds, options?.aspectRatio, options?.userId);
  if (racers.length === 0) return null;

  const ossNames = new Set(['replicate-minimax', 'replicate-wan', 'cogvideox', 'animatediff', 'replicate-svd', 'deepinfra']);
  const ossRacers = racers.filter((r) => ossNames.has(r.name));
  const premiumRacers = racers.filter((r) => !ossNames.has(r.name));

  const race = async (group: Racer[]): Promise<VideoGenerationResult | null> => {
    if (group.length === 0) return null;
    const attempts = group.map((r) =>
      withTimeout(r.run(), FAST_TIMEOUT_MS, r.name)
        .then((videoUrl) => ({ provider: r.name, videoUrl, durationSeconds }))
        .catch((err) => {
          console.warn(`[FastVideoRace] ${r.name}:`, (err as Error).message.slice(0, 100));
          return Promise.reject(err);
        })
    );
    try {
      return await Promise.any(attempts);
    } catch {
      return null;
    }
  };

  const ossWinner = await race(ossRacers);
  if (ossWinner) {
    console.log(`[FastVideoRace] OSS winner: ${ossWinner.provider}`);
    return ossWinner;
  }

  console.warn('[FastVideoRace] OSS failed, trying premium + image-to-video…');
  const premiumWinner = await race(premiumRacers);
  if (premiumWinner) {
    console.log(`[FastVideoRace] Premium winner: ${premiumWinner.provider}`);
    return premiumWinner;
  }

  try {
    const i2v = await tryImageToVideo(prompt, durationSeconds, options);
    if (i2v) return i2v;
  } catch (err) {
    console.warn('[FastVideoRace] Image-to-video failed:', (err as Error).message);
  }

  return null;
}

export function isFastClip(durationSeconds: number): boolean {
  return durationSeconds <= 15;
}
