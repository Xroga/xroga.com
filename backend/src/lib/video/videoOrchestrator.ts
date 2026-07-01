/**
 * Video Orchestrator — Tier 0 HuggingFace Spaces workhorse.
 * Round-robins across 15 OSS community GPUs; instant failover on 429/503.
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
  /** Money shots — still try free first, but fewer retries per space */
  maxAttempts?: number;
}

async function resolveKeyframe(
  prompt: string,
  options: HfOrchestratorOptions
): Promise<string | undefined> {
  if (options.keyframeUrl) return options.keyframeUrl;
  try {
    return await generateAgnesImage(`Cinematic still: ${prompt.slice(0, 400)}`);
  } catch {
    try {
      const out = await generateImage(`Cinematic film still: ${prompt}`, {
        userId: options.userId,
        fast: true,
        aspectFormat: options.aspectRatio === '9:16' ? '9:16' : '16:9',
      });
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

  const result = await callGradioSpace({
    spaceId: space.spaceId,
    apiName: space.apiName,
    data,
    label: space.id,
    timeoutMs: space.modelId === 'cogvideox' || space.modelId === 'hunyuan' ? 180_000 : 120_000,
  });

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
  return msg.startsWith('RATE_LIMIT:') || /429|rate.?limit|queue is full|503|sleeping/i.test(msg);
}

/**
 * Try HF Spaces in round-robin order. Returns first successful MP4 URL.
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
  const errors: string[] = [];

  for (let i = 0; i < Math.min(maxAttempts, spaces.length); i++) {
    const space = spaces[i]!;
    try {
      const result = await trySpace(space, clean, durationSeconds, options ?? {});
      console.log(`[VideoOrchestrator] HF winner: ${result.provider} (${result.family}) scene=${scene}`);
      return result;
    } catch (err) {
      const msg = (err as Error).message.slice(0, 120);
      errors.push(`${space.id}: ${msg}`);
      console.warn(`[VideoOrchestrator] ${space.id} failed:`, msg);
      if (shouldSkipForRateLimit(err as Error)) {
        continue;
      }
    }
  }

  throw new Error(
    `All HF Spaces exhausted (${spaces.length} tried). ${errors.slice(0, 4).join(' | ')}`
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
