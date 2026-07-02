/**
 * Multi-AI video race — run several OSS providers in parallel, collect up to N winners.
 * Strategy: 80% free HF Spaces + Replicate OSS; premium only if all fail.
 */

import { generateViaHfSpaces, type HfOrchestratorResult } from './videoOrchestrator.js';
import { orderSpacesForScene, classifyVideoScene, HF_VIDEO_SPACES } from './hfSpacesRegistry.js';
import { callGradioSpace, videoUrlFromGradioResult } from './gradioSpaceClient.js';
import { sanitizeVideoPrompt } from './videoPrompt.js';
import { raceVideoProviders } from './fastVideoRace.js';
import { generateLtxHfVideo } from './ltxHfVideo.js';
import { generateParallaxClip } from '../../services/omniReality/fallbackParallax.js';
import { generateMinimalMp4 } from './minimalMp4.js';
import { getStaticMp4DataUrl } from './staticMp4.js';
import type { VideoGenerationResult } from '../videoProviders.js';

const MAX_VARIANTS = 3;
const HF_PARALLEL = 4;
const PER_SPACE_MS = 90_000;

export interface MultiVideoRaceOptions {
  userId?: string;
  aspectRatio?: '9:16' | '16:9';
  scenePriority?: string;
  keyframeUrl?: string;
  maxVariants?: number;
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

async function trySingleHfSpace(
  space: (typeof HF_VIDEO_SPACES)[number],
  prompt: string,
  durationSeconds: number,
  options: MultiVideoRaceOptions
): Promise<VideoGenerationResult> {
  const data = space.buildData({
    prompt,
    durationSeconds,
    aspectRatio: options.aspectRatio,
    keyframeUrl: options.keyframeUrl,
  });

  const result = await callGradioSpace({
    spaceId: space.spaceId,
    apiName: space.apiName,
    data,
    label: space.id,
    timeoutMs: PER_SPACE_MS,
  });

  const videoUrl = videoUrlFromGradioResult(result, space.spaceId);
  return { provider: space.id, videoUrl, durationSeconds };
}

/**
 * Race HF Spaces in parallel batches; collect every success (up to maxVariants).
 */
async function collectHfSpaceVideos(
  prompt: string,
  durationSeconds: number,
  options: MultiVideoRaceOptions
): Promise<VideoGenerationResult[]> {
  const clean = sanitizeVideoPrompt(prompt);
  const scene = classifyVideoScene(clean, options.scenePriority);
  const spaces = orderSpacesForScene(scene, Math.floor(Math.random() * 1000)).filter(
    (s) => s.id !== 'hf-ltx-video' && !s.disabled
  );
  const maxVariants = options.maxVariants ?? MAX_VARIANTS;
  const winners: VideoGenerationResult[] = [];
  const seen = new Set<string>();

  for (let batch = 0; batch < 3 && winners.length < maxVariants; batch++) {
    const slice = spaces.slice(batch * HF_PARALLEL, (batch + 1) * HF_PARALLEL);
    if (slice.length === 0) break;

    const settled = await Promise.allSettled(
      slice.map((space) =>
        withTimeout(trySingleHfSpace(space, clean, durationSeconds, options), PER_SPACE_MS + 5_000, space.id)
      )
    );

    for (const result of settled) {
      if (result.status !== 'fulfilled') continue;
      const v = result.value;
      if (!v.videoUrl || seen.has(v.videoUrl)) continue;
      seen.add(v.videoUrl);
      winners.push(v);
      console.log(`[MultiVideoRace] HF winner: ${v.provider}`);
      if (winners.length >= maxVariants) break;
    }

    if (winners.length >= 1 && batch === 0) break;
  }

  return winners;
}

const OSS_PROVIDERS = new Set([
  'hf-cogvideox', 'hf-pyramid-flow', 'hf-ltx-video', 'hf-open-sora', 'hf-open-sora-mirror',
  'hf-videocrafter', 'hf-animatediff', 'hf-hunyuan-mirror', 'hf-hunyuan-mirror2', 'hf-mochi-mirror',
  'hf-svd', 'hf-zeroscope', 'hf-zeroscope-mirror', 'hf-kandinsky', 'hf-allegro', 'hf-spaces',
  'deepinfra', 'agnes', 'comfyui', 'replicate-wan', 'hunyuan', 'mochi', 'cogvideox',
  'open-sora', 'pyramid-flow', 'allegro', 'kandinsky', 'ltx-video', 'videocrafter', 'animatediff', 'zeroscope',
]);

export function isRealOssVideoProvider(provider: string): boolean {
  return OSS_PROVIDERS.has(provider) || provider.startsWith('hf-');
}

/**
 * Run multiple OSS AIs in parallel; return 1–3 playable videos.
 * Always returns at least one video (motion fallback as last resort).
 */
export async function raceMultipleOssVideos(
  prompt: string,
  durationSeconds: number,
  options?: MultiVideoRaceOptions
): Promise<MultiVideoRaceResult> {
  const dur = Math.min(Math.max(durationSeconds, 3), 30);
  const maxVariants = options?.maxVariants ?? MAX_VARIANTS;
  const attemptedProviders: string[] = [];
  const videos: VideoGenerationResult[] = [];

  // Tier 0: LTX on HuggingFace — verified free text-to-video (no API keys)
  try {
    const ltx = await withTimeout(
      generateLtxHfVideo(prompt, dur, options?.aspectRatio ?? '16:9'),
      125_000,
      'ltx-hf-first'
    );
    if (ltx.videoUrl) {
      attemptedProviders.push(ltx.provider);
      videos.push(ltx);
      console.log('[MultiVideoRace] LTX HF primary winner');
    }
  } catch (err) {
    console.warn('[MultiVideoRace] LTX HF first:', (err as Error).message.slice(0, 100));
  }

  if (videos.length < maxVariants) {
    const hfWinners = await collectHfSpaceVideos(prompt, dur, { ...options, maxVariants: maxVariants - videos.length });
    for (const v of hfWinners) {
      if (!videos.some((x) => x.videoUrl === v.videoUrl)) {
        attemptedProviders.push(v.provider);
        videos.push(v);
      }
    }
  }

  if (videos.length < maxVariants) {
    try {
      const raced = await raceVideoProviders(prompt, dur, {
        aspectRatio: options?.aspectRatio,
        userId: options?.userId,
        scenePriority: options?.scenePriority,
        keyframeUrl: options?.keyframeUrl,
      });
      if (raced?.videoUrl && !videos.some((v) => v.videoUrl === raced.videoUrl)) {
        attemptedProviders.push(raced.provider);
        videos.push(raced);
      }
    } catch (err) {
      console.warn('[MultiVideoRace] fastVideoRace:', (err as Error).message.slice(0, 80));
    }
  }

  if (videos.length < maxVariants) {
    try {
      const hfBatch = await withTimeout(
        generateViaHfSpaces(prompt, dur, {
          userId: options?.userId,
          aspectRatio: options?.aspectRatio,
          scenePriority: options?.scenePriority,
          keyframeUrl: options?.keyframeUrl,
          maxAttempts: 12,
        }),
        75_000,
        'hf-orchestrator'
      );
      const entry: VideoGenerationResult = {
        provider: hfBatch.provider,
        videoUrl: hfBatch.videoUrl,
        durationSeconds: dur,
      };
      if (!videos.some((v) => v.videoUrl === entry.videoUrl)) {
        attemptedProviders.push(entry.provider);
        videos.push(entry);
      }
    } catch {
      /* continue */
    }
  }

  if (videos.length === 0) {
    try {
      const parallax = await generateParallaxClip(prompt, dur, {
        keyframeUrl: options?.keyframeUrl,
        vertical: options?.aspectRatio === '9:16',
        userId: options?.userId,
      });
      attemptedProviders.push(parallax.provider);
      videos.push(parallax);
    } catch (err) {
      console.warn('[MultiVideoRace] parallax failed:', (err as Error).message);
    }
  }

  if (videos.length === 0) {
    try {
      const videoUrl = await generateMinimalMp4(prompt, dur, {
        vertical: options?.aspectRatio === '9:16',
      });
      attemptedProviders.push('ffmpeg-minimal');
      videos.push({ provider: 'ffmpeg-minimal', videoUrl, durationSeconds: dur });
    } catch {
      attemptedProviders.push('static-mp4');
      videos.push({
        provider: 'static-mp4',
        videoUrl: getStaticMp4DataUrl(),
        durationSeconds: dur,
      });
    }
  }

  const primary =
    videos.find((v) => isRealOssVideoProvider(v.provider)) ?? videos[0]!;

  const sorted = [
    primary,
    ...videos.filter((v) => v.videoUrl !== primary.videoUrl),
  ].slice(0, maxVariants);

  return {
    videos: sorted,
    primary: sorted[0]!,
    attemptedProviders,
  };
}
