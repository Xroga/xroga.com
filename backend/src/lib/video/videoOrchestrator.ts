/**
 * Video Orchestrator — Tier 0 HuggingFace Spaces workhorse.
 * Parallel round-robin across 15 OSS community GPUs; instant failover on 429/503.
 * Premium Replicate APIs are Tier 2 (handled by fastVideoRace after this).
 */

import { callGradioSpace, videoUrlFromGradioResult } from './gradioSpaceClient.js';
import {
  classifyVideoScene,
  orderSpacesForScene,
  type HfSpaceEndpoint,
  type VideoSceneKind,
} from './hfSpacesRegistry.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';
import { generateAgnesImage } from '../agnes.js';
import { generateImage } from '../../services/builder/imageGen.js';

let roundRobinCounter = 0;

const HF_PARALLEL_BATCH = 4;
const HF_MAX_BATCHES = 2;
const HF_SPACE_TIMEOUT_MS = 65_000;

export interface HfOrchestratorResult {
  provider: string;
  videoUrl: string;
  spaceId: string;
  family: string;
}

export interface HfOrchestratorOptions {
  userId?: string;
  aspectRatio?: '9:16' | '16:9';
  scenePriority?: string;
  keyframeUrl?: string;
  maxAttempts?: number;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

async function resolveKeyframe(
  prompt: string,
  options: HfOrchestratorOptions
): Promise<string | undefined> {
  if (options.keyframeUrl) return options.keyframeUrl;
  try {
    return await withTimeout(
      generateAgnesImage(`Cinematic still: ${prompt.slice(0, 400)}`),
      20_000,
      'keyframe-agnes'
    );
  } catch {
    try {
      const out = await withTimeout(
        generateImage(`Cinematic film still: ${prompt}`, {
          userId: options.userId,
          fast: true,
          aspectFormat: options.aspectRatio === '9:16' ? '9:16' : '16:9',
        }),
        25_000,
        'keyframe-image'
      );
      if (out.type !== 'image_blocked' && out.imageUrl) return out.imageUrl;
    } catch {
      /* skip */
    }
  }
  return undefined;
}

async function trySpace(
  space: HfSpaceEndpoint,
  prompt: string,
  durationSeconds: number,
  options: HfOrchestratorOptions
): Promise<HfOrchestratorResult> {
  let keyframeUrl = options.keyframeUrl;
  if (space.requiresImage && !keyframeUrl) {
    keyframeUrl = await resolveKeyframe(prompt, options);
    if (!keyframeUrl) throw new Error(`${space.id}: needs keyframe image`);
  }

  const data = space.buildData({
    prompt,
    durationSeconds,
    aspectRatio: options.aspectRatio,
    keyframeUrl,
  });

  const perSpaceTimeout =
    space.modelId === 'cogvideox' || space.modelId === 'hunyuan' ? 90_000 : HF_SPACE_TIMEOUT_MS;

  const result = await withTimeout(
    callGradioSpace({
      spaceId: space.spaceId,
      apiName: space.apiName,
      data,
      label: space.id,
      timeoutMs: perSpaceTimeout,
    }),
    perSpaceTimeout + 5_000,
    space.id
  );

  const videoUrl = videoUrlFromGradioResult(result, space.spaceId);
  return {
    provider: space.id,
    videoUrl,
    spaceId: space.spaceId,
    family: space.family,
  };
}

function shouldSkipForRateLimit(err: Error): boolean {
  const msg = err.message;
  return msg.startsWith('RATE_LIMIT:') || /429|rate.?limit|queue is full|503|sleeping|timed out/i.test(msg);
}

async function raceSpaceBatch(
  spaces: HfSpaceEndpoint[],
  prompt: string,
  durationSeconds: number,
  options: HfOrchestratorOptions
): Promise<HfOrchestratorResult | null> {
  if (spaces.length === 0) return null;

  const attempts = spaces.map((space) =>
    trySpace(space, prompt, durationSeconds, options).catch((err) => {
      console.warn(`[VideoOrchestrator] ${space.id}:`, (err as Error).message.slice(0, 100));
      throw err;
    })
  );

  try {
    return await Promise.any(attempts);
  } catch {
    for (const space of spaces) {
      try {
        return await trySpace(space, prompt, durationSeconds, options);
      } catch (err) {
        if (!shouldSkipForRateLimit(err as Error)) continue;
      }
    }
    return null;
  }
}

/**
 * Try HF Spaces in parallel batches (5 at a time). Returns first successful MP4 URL.
 * 80% of scenes should succeed here at $0 cost.
 */
export async function generateViaHfSpaces(
  prompt: string,
  durationSeconds: number,
  options?: HfOrchestratorOptions
): Promise<HfOrchestratorResult> {
  const clean = sanitizeVideoPrompt(prompt);
  const scene: VideoSceneKind = classifyVideoScene(clean, options?.scenePriority);
  const offset = roundRobinCounter++ % 1000;
  const spaces = orderSpacesForScene(scene, offset);
  const maxAttempts = options?.maxAttempts ?? spaces.length;
  const capped = spaces.slice(0, maxAttempts);
  const errors: string[] = [];

  const batchCount = Math.min(
    HF_MAX_BATCHES,
    Math.ceil(capped.length / HF_PARALLEL_BATCH)
  );

  for (let batch = 0; batch < batchCount; batch++) {
    const slice = capped.slice(batch * HF_PARALLEL_BATCH, (batch + 1) * HF_PARALLEL_BATCH);
    if (slice.length === 0) break;

    console.log(
      `[VideoOrchestrator] HF batch ${batch + 1}/${batchCount} — racing ${slice.map((s) => s.id).join(', ')}`
    );

    const winner = await raceSpaceBatch(slice, clean, durationSeconds, options ?? {});
    if (winner) {
      console.log(`[VideoOrchestrator] HF winner: ${winner.provider} (${winner.family}) scene=${scene}`);
      return winner;
    }

    for (const space of slice) {
      errors.push(`${space.id}: batch-${batch + 1}-failed`);
    }
  }

  throw new Error(
    `All HF Spaces exhausted (${capped.length} tried). ${errors.slice(0, 4).join(' | ')}`
  );
}

export function getHfSpacesCatalog(): Array<{ id: string; family: string; spaceId: string; bestFor: string[] }> {
  return orderSpacesForScene('general', 0).map((s) => ({
    id: s.id,
    family: s.family,
    spaceId: s.spaceId,
    bestFor: s.bestFor,
  }));
}
