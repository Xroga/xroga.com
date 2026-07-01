/**
 * Open-source video model registry — tried BEFORE any premium/paid API.
 * Mapped to Replicate + DeepInfra + optional PiAPI/Fal endpoints.
 */

import { sanitizeVideoPrompt } from './videoPrompt.js';
import { runReplicateModel } from './replicateClient.js';

export interface OssVideoModel {
  /** Provider id stored on video_studio output */
  id: string;
  /** User-facing label (model family) */
  family: string;
  replicatePath: string;
  buildInput: (prompt: string, durationSeconds: number) => Record<string, unknown>;
}

/** Order matters — lightweight / fast OSS models first, heavy models later */
export const REPLICATE_OSS_VIDEO_MODELS: OssVideoModel[] = [
  {
    id: 'replicate-wan',
    family: 'Wan 2.2 (Alibaba)',
    replicatePath: 'wan-video/wan-2.2-t2v-fast',
    buildInput: (p) => ({ prompt: p.slice(0, 1000) }),
  },
  {
    id: 'zeroscope',
    family: 'Zeroscope (OSS)',
    replicatePath: 'anotherjesse/zeroscope-v2-xl',
    buildInput: (p) => ({ prompt: p.slice(0, 800) }),
  },
  {
    id: 'ltx-video',
    family: 'LTX Video (Lightricks)',
    replicatePath: 'lightricks/ltx-video-0.9.7',
    buildInput: (p) => ({ prompt: p.slice(0, 1000) }),
  },
  {
    id: 'videocrafter',
    family: 'VideoCrafter (ModelScope)',
    replicatePath: 'cjwbw/videocrafter2',
    buildInput: (p) => ({ prompt: p.slice(0, 800) }),
  },
  {
    id: 'animatediff',
    family: 'AnimateDiff',
    replicatePath: 'lucataco/animate-diff',
    buildInput: (p) => ({
      prompt: p.slice(0, 800),
      n_prompt: 'blurry, low quality, extra limbs, warping',
      num_inference_steps: 25,
    }),
  },
  {
    id: 'allegro',
    family: 'Allegro (RhymesAI)',
    replicatePath: 'zsxkib/allegro',
    buildInput: (p) => ({ prompt: p.slice(0, 1000) }),
  },
  {
    id: 'kandinsky',
    family: 'Kandinsky Video',
    replicatePath: 'cjwbw/kandinskyvideo',
    buildInput: (p) => ({ prompt: p.slice(0, 800) }),
  },
  {
    id: 'mochi',
    family: 'Mochi 1 (Genmo)',
    replicatePath: 'genmoai/mochi-1',
    buildInput: (p) => ({ prompt: p.slice(0, 1000) }),
  },
  {
    id: 'cogvideox',
    family: 'CogVideoX (THUDM)',
    replicatePath: 'thudm/cogvideox-t2v',
    buildInput: (p) => ({ prompt: p.slice(0, 1000) }),
  },
  {
    id: 'open-sora',
    family: 'Open-Sora',
    replicatePath: 'jd7h/open-sora-512',
    buildInput: (p) => ({ prompt: p.slice(0, 1000) }),
  },
  {
    id: 'pyramid-flow',
    family: 'Pyramid Flow',
    replicatePath: 'zsxkib/pyramid-flow',
    buildInput: (p) => ({ prompt: p.slice(0, 1000), mode: 't2v' }),
  },
  {
    id: 'hunyuan',
    family: 'HunyuanVideo (Tencent)',
    replicatePath: 'tencent/hunyuan-video',
    buildInput: (p) => ({ prompt: p.slice(0, 1500) }),
  },
];

export async function runOssReplicateModel(model: OssVideoModel, prompt: string, durationSeconds: number): Promise<string> {
  const clean = sanitizeVideoPrompt(prompt);
  return runReplicateModel(model.replicatePath, model.buildInput(clean, durationSeconds), model.family);
}

export function getOssModelFamily(id: string): string {
  return REPLICATE_OSS_VIDEO_MODELS.find((m) => m.id === id)?.family ?? id;
}
