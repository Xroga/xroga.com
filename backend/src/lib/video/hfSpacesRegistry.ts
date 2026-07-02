/**
 * Community HuggingFace Space endpoints — Tier 0 free GPU workhorse ($0).
 * Multiple mirrors per model family for round-robin when rate-limited (429).
 */

export type VideoSceneKind =
  | 'establishing'
  | 'dialogue'
  | 'cartoon'
  | 'broll'
  | 'action'
  | 'climax'
  | 'general';

export interface HfSpaceContext {
  prompt: string;
  durationSeconds: number;
  aspectRatio?: '9:16' | '16:9';
  keyframeUrl?: string;
}

export interface HfSpaceEndpoint {
  id: string;
  family: string;
  modelId: string;
  spaceId: string;
  apiName: string;
  bestFor: VideoSceneKind[];
  requiresImage?: boolean;
  /** Skip broken / offline HF Spaces */
  disabled?: boolean;
  buildData: (ctx: HfSpaceContext) => unknown[];
}

/** Verified public Gradio Spaces — OSS Tier 0 (LTX first — live tested) */
export const HF_VIDEO_SPACES: HfSpaceEndpoint[] = [
  {
    id: 'hf-ltx-video',
    family: 'LTX Video (Lightricks)',
    modelId: 'ltx-video',
    spaceId: 'Lightricks/ltx-video-distilled',
    apiName: '/text_to_video',
    bestFor: ['broll', 'general', 'dialogue', 'establishing', 'action', 'climax', 'cartoon'],
    buildData: (ctx) => {
      const vertical = ctx.aspectRatio === '9:16';
      return [
        ctx.prompt.slice(0, 800),
        'worst quality, inconsistent motion, blurry, jittery, distorted',
        null,
        null,
        vertical ? 704 : 512,
        vertical ? 512 : 704,
        'text-to-video',
        Math.min(Math.max(ctx.durationSeconds, 2), 4),
        9,
        42,
        true,
        1,
        true,
      ];
    },
  },
  {
    id: 'hf-cogvideox',
    family: 'CogVideoX (THUDM)',
    modelId: 'cogvideox',
    spaceId: 'zai-org/CogVideoX-5B-Space',
    apiName: '/generate',
    bestFor: ['climax', 'action', 'general', 'establishing'],
    disabled: true,
    buildData: (ctx) => [
      ctx.prompt.slice(0, 800),
      null,
      null,
      0.8,
      -1,
      false,
      false,
    ],
  },
  {
    id: 'hf-pyramid-flow',
    family: 'Pyramid Flow',
    modelId: 'pyramid-flow',
    spaceId: 'pyramid-flow/Pyramid-Flow',
    apiName: '/generate_video',
    bestFor: ['action', 'climax', 'broll'],
    disabled: true,
    buildData: (ctx) => [
      ctx.prompt.slice(0, 800),
      null,
      Math.min(Math.max(ctx.durationSeconds, 3), 10),
      9,
      5,
      24,
    ],
  },
  {
    id: 'hf-open-sora',
    family: 'Open-Sora',
    modelId: 'open-sora',
    spaceId: 'hpcai-tech/open-sora',
    apiName: '/generate',
    bestFor: ['establishing', 'general', 'climax'],
    disabled: true,
    buildData: (ctx) => [ctx.prompt.slice(0, 800)],
  },
  {
    id: 'hf-open-sora-mirror',
    family: 'Open-Sora',
    modelId: 'open-sora',
    spaceId: 'fffiloni/Open-Sora-Plan-v1-0-0',
    apiName: '/generate',
    bestFor: ['establishing', 'general'],
    buildData: (ctx) => [ctx.prompt.slice(0, 800)],
  },
  {
    id: 'hf-videocrafter',
    family: 'VideoCrafter (ModelScope)',
    modelId: 'videocrafter',
    spaceId: 'ali-vilab/modelscope-text-to-video-synthesis',
    apiName: '/predict',
    bestFor: ['dialogue', 'broll', 'general'],
    disabled: true,
    buildData: (ctx) => [ctx.prompt.slice(0, 500)],
  },
  {
    id: 'hf-animatediff',
    family: 'AnimateDiff',
    modelId: 'animatediff',
    spaceId: 'text-to-video/zsxkib-animatediff-prompt-travel',
    apiName: '/predict',
    bestFor: ['cartoon', 'broll', 'dialogue'],
    disabled: true,
    buildData: (ctx) => [ctx.prompt.slice(0, 500), 25, 7.5, 16],
  },
  {
    id: 'hf-hunyuan-mirror',
    family: 'HunyuanVideo (Tencent)',
    modelId: 'hunyuan',
    spaceId: 'jonluca/HunyuanVideo',
    apiName: '/predict',
    bestFor: ['climax', 'establishing', 'general'],
    buildData: (ctx) => [ctx.prompt.slice(0, 800)],
  },
  {
    id: 'hf-hunyuan-mirror2',
    family: 'HunyuanVideo (Tencent)',
    modelId: 'hunyuan',
    spaceId: 'Dummypava2/tencent-HunyuanVideo',
    apiName: '/predict',
    bestFor: ['climax', 'establishing', 'general'],
    buildData: (ctx) => [ctx.prompt.slice(0, 800)],
  },
  {
    id: 'hf-mochi-mirror',
    family: 'Mochi 1 (Genmo)',
    modelId: 'mochi',
    spaceId: 'salomonsky/Mochi_1_Video',
    apiName: '/predict',
    bestFor: ['dialogue', 'general', 'climax'],
    buildData: (ctx) => [ctx.prompt.slice(0, 800)],
  },
  {
    id: 'hf-modelscope',
    family: 'ModelScope T2V',
    modelId: 'zeroscope',
    spaceId: 'damo-vilab/modelscope-text-to-video-synthesis',
    apiName: '/predict',
    bestFor: ['general', 'broll', 'establishing', 'dialogue'],
    buildData: (ctx) => [ctx.prompt.slice(0, 500)],
  },
  {
    id: 'hf-svd',
    family: 'Stable Video Diffusion',
    modelId: 'replicate-svd',
    spaceId: 'multimodalart/stable-video-diffusion',
    apiName: '/video',
    bestFor: ['broll', 'dialogue', 'cartoon'],
    requiresImage: true,
    buildData: (ctx) => [
      ctx.keyframeUrl
        ? { url: ctx.keyframeUrl }
        : null,
      42,
      true,
      127,
      6,
    ],
  },
  {
    id: 'hf-zeroscope',
    family: 'Zeroscope (OSS)',
    modelId: 'zeroscope',
    spaceId: 'fffiloni/zeroscope-v2-xl',
    apiName: '/predict',
    bestFor: ['broll', 'general', 'establishing'],
    disabled: true,
    buildData: (ctx) => [ctx.prompt.slice(0, 800)],
  },
  {
    id: 'hf-zeroscope-mirror',
    family: 'Zeroscope (OSS)',
    modelId: 'zeroscope',
    spaceId: 'linoyts/zeroscope-v2-xl',
    apiName: '/predict',
    bestFor: ['broll', 'general', 'dialogue'],
    buildData: (ctx) => [ctx.prompt.slice(0, 800)],
  },
  {
    id: 'hf-kandinsky',
    family: 'Kandinsky Video',
    modelId: 'kandinsky',
    spaceId: 'ai-forever/Kandinsky-5-0-Video',
    apiName: '/predict',
    bestFor: ['cartoon', 'general', 'broll'],
    buildData: (ctx) => [ctx.prompt.slice(0, 800)],
  },
  {
    id: 'hf-allegro',
    family: 'Allegro Video',
    modelId: 'allegro',
    spaceId: 'rhymes-ai/Allegro',
    apiName: '/predict',
    bestFor: ['action', 'climax', 'broll'],
    buildData: (ctx) => [ctx.prompt.slice(0, 800)],
  },
];

export function classifyVideoScene(prompt: string, scenePriority?: string): VideoSceneKind {
  if (scenePriority === 'critical') return 'climax';
  const lower = prompt.toLowerCase();
  if (/\b(explosion|fight|climax|battle|chase|combat|stunt)\b/.test(lower)) return 'action';
  if (/\b(cartoon|anime|animation|animated|loop)\b/.test(lower)) return 'cartoon';
  if (/\b(dialogue|talking|conversation|speaking|interview|monologue)\b/.test(lower)) return 'dialogue';
  if (/\b(establishing|aerial|landscape|cityscape|b-?roll|wide shot|cybercity|cyber.?city|city|skyline|neon)\b/.test(lower)) return 'establishing';
  return 'general';
}

/** Score + round-robin order for scene type */
export function orderSpacesForScene(
  scene: VideoSceneKind,
  roundRobinOffset: number
): HfSpaceEndpoint[] {
  const scored = HF_VIDEO_SPACES.map((space, idx) => {
    let score = 0;
    if (space.bestFor.includes(scene)) score -= 10;
    else if (space.bestFor.includes('general')) score -= 3;
    score += idx * 0.01;
    return { space, score };
  });
  scored.sort((a, b) => a.score - b.score);
  const ordered = scored.map((s) => s.space);
  const offset = roundRobinOffset % Math.max(ordered.length, 1);
  return [...ordered.slice(offset), ...ordered.slice(0, offset)];
}
