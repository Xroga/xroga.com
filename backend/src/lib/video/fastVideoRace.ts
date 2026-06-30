/**
 * Fast video path — race top providers in parallel for short clips (≤15s).
 * Target: real MP4 in under 2 minutes.
 */

import { getSecret, hasSecret } from '../../config/envSecrets.js';
import { generateFalVideo } from './falVideo.js';
import { generateHailuoVideo } from './hailuoVideo.js';
import { generateLumaVideo } from './lumaVideo.js';
import { generateRunwayVideo } from './runwayVideo.js';
import { generateAgnesVideo } from '../agnesVideo.js';
import type { VideoGenerationResult } from '../videoProviders.js';

const FAST_TIMEOUT_MS = 90_000;

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
  aspectRatio?: '9:16' | '16:9'
): Racer[] {
  const racers: Racer[] = [];

  if (hasSecret('FAL_KEY')) {
    racers.push({
      name: 'fal',
      run: () => generateFalVideo(prompt, durationSeconds, { aspectRatio }),
    });
  }
  if (hasSecret('HAILUO_API_KEY')) {
    racers.push({
      name: 'hailuo',
      run: () => generateHailuoVideo(prompt, durationSeconds, { aspectRatio }),
    });
  }
  if (hasSecret('LUMA_API_KEY')) {
    racers.push({
      name: 'luma',
      run: () => generateLumaVideo(prompt, durationSeconds, { aspectRatio }),
    });
  }
  if (hasSecret('RUNWAY_API_KEY')) {
    racers.push({
      name: 'runway',
      run: () => generateRunwayVideo(prompt, durationSeconds, { aspectRatio }),
    });
  }
  if (hasSecret('AGNES_API_KEY')) {
    racers.push({
      name: 'agnes',
      run: () => generateAgnesVideo(prompt, durationSeconds),
    });
  }

  return racers;
}

/** First successful provider wins; returns null if all fail */
export async function raceVideoProviders(
  prompt: string,
  durationSeconds: number,
  options?: { aspectRatio?: '9:16' | '16:9' }
): Promise<VideoGenerationResult | null> {
  const racers = buildRacers(prompt, durationSeconds, options?.aspectRatio);
  if (racers.length === 0) return null;

  const attempts = racers.map((r) =>
    withTimeout(r.run(), FAST_TIMEOUT_MS, r.name)
      .then((videoUrl) => ({ provider: r.name, videoUrl, durationSeconds }))
      .catch((err) => {
        console.warn(`[FastVideoRace] ${r.name} failed:`, (err as Error).message);
        return Promise.reject(err);
      })
  );

  try {
    const winner = await Promise.any(attempts);
    console.log(`[FastVideoRace] Winner: ${winner.provider}`);
    return winner;
  } catch {
    return null;
  }
}

export function isFastClip(durationSeconds: number): boolean {
  return durationSeconds <= 15;
}
