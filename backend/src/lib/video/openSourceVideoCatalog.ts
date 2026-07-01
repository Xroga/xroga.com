/**
 * Canonical catalog of open-source video models supported by Xroga.
 * Each entry maps to a provider id in the video fallback chain.
 */

export interface OpenSourceVideoModel {
  rank: number;
  id: string;
  family: string;
  description: string;
  license: string;
  host: 'replicate' | 'deepinfra' | 'agnes' | 'comfyui' | 'fal' | 'piapi' | 'svd';
}

/** User-facing list — matches the 15 OSS families documented for Xroga Video Studio */
export const OPEN_SOURCE_VIDEO_CATALOG: OpenSourceVideoModel[] = [
  { rank: 1, id: 'hunyuan', family: 'HunyuanVideo (Tencent)', description: '13B+ text-to-video, high realism and motion coherence', license: 'Tencent Hunyuan', host: 'replicate' },
  { rank: 2, id: 'mochi', family: 'Mochi 1 (Genmo)', description: '10B AsymmDiT diffusion, ~5.4s @ 30fps', license: 'Apache 2.0', host: 'replicate' },
  { rank: 3, id: 'cogvideox', family: 'CogVideoX (THUDM)', description: 'Transformer T2V/I2V, up to 10s', license: 'CogVideoX', host: 'replicate' },
  { rank: 4, id: 'open-sora', family: 'Open-Sora', description: 'Full OSS pipeline, up to 15s @ 720p T2V/I2V', license: 'Apache 2.0', host: 'replicate' },
  { rank: 5, id: 'replicate-wan', family: 'Wan 2.2 (Alibaba)', description: '5B/14B cinematic T2V, CN/EN prompts', license: 'Apache 2.0', host: 'replicate' },
  { rank: 6, id: 'pyramid-flow', family: 'Pyramid Flow', description: 'Flow-matching autoregressive, 10s @ 768p 24fps', license: 'Open research', host: 'replicate' },
  { rank: 7, id: 'replicate-svd', family: 'Stable Video Diffusion', description: 'Image-to-video latent diffusion, 2–4s clips', license: 'Stability AI', host: 'svd' },
  { rank: 8, id: 'ltx-video', family: 'LTX Video (Lightricks)', description: 'Low VRAM T2V, 768×512', license: 'Lightricks OSS', host: 'replicate' },
  { rank: 9, id: 'allegro', family: 'Allegro (RhymesAI)', description: '6s @ 15fps 720p, Apache 2.0', license: 'Apache 2.0', host: 'replicate' },
  { rank: 10, id: 'skyreels', family: 'SkyReels V1 (Skywork)', description: 'Human-centric, 33 expressions, 12s @ 24fps', license: 'Skywork OSS', host: 'piapi' },
  { rank: 11, id: 'kandinsky', family: 'Kandinsky Video', description: 'FusionFrames keyframe + interpolation T2V', license: 'ai-forever', host: 'replicate' },
  { rank: 12, id: 'ovi', family: 'Ovi', description: 'Synchronized video + audio from text/image', license: 'Character AI OSS', host: 'fal' },
  { rank: 13, id: 'comfyui', family: 'UniVA / ComfyUI', description: 'Agent workflows via local ComfyUI bridge', license: 'OSS', host: 'comfyui' },
  { rank: 14, id: 'animatediff', family: 'AnimateDiff', description: 'Motion modules on SD for short animations', license: 'Apache 2.0', host: 'replicate' },
  { rank: 15, id: 'videocrafter', family: 'VideoCrafter / ModelScope', description: 'ModelScope community T2V entry model', license: 'ModelScope', host: 'replicate' },
  { rank: 16, id: 'deepinfra', family: 'DeepInfra OSS (Wan/Pruna)', description: 'Hosted Wan 2.1/2.2/2.6 + Pruna p-video', license: 'OSS weights', host: 'deepinfra' },
  { rank: 17, id: 'agnes', family: 'Agnes Video', description: 'Free-tier hosted T2V API', license: 'Agnes', host: 'agnes' },
  { rank: 18, id: 'zeroscope', family: 'Zeroscope', description: 'Lightweight OSS T2V baseline', license: 'OSS', host: 'replicate' },
];

export function getCatalogFamily(id: string): string {
  return OPEN_SOURCE_VIDEO_CATALOG.find((m) => m.id === id)?.family ?? id;
}

export function listOpenSourceModelIds(): string[] {
  return OPEN_SOURCE_VIDEO_CATALOG.map((m) => m.id);
}
