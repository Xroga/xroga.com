/**
 * Omni-Reality Tool Registry — capabilities of all video/audio/LLM tools.
 * 80% workhorse (free/OSS) · 20% premium specialist APIs.
 */

import { getSecret } from '../../config/envSecrets.js';

export type ToolCategory = 'video' | 'audio' | 'llm' | 'transcription' | 'avatar';

export interface ToolEntry {
  id: string;
  name: string;
  category: ToolCategory;
  isFree: boolean;
  isPremium: boolean;
  /** Env var that enables this tool */
  envKey?: string;
  /** Alternate env keys */
  altEnvKeys?: string[];
  /** Relative cost weight (1 = cheap, 10 = expensive) */
  costWeight: number;
  capabilities: string[];
  /** Use for climax shots, emotional monologues, aerial explosions */
  climaxOnly?: boolean;
}

export const TOOL_REGISTRY: ToolEntry[] = [
  // ── Video: Premium (20%) ──
  { id: 'kling', name: 'Kling AI', category: 'video', isFree: false, isPremium: true, envKey: 'KLING_API_KEY', costWeight: 8, capabilities: ['text2video', 'img2video', 'physics', 'multimodal'], climaxOnly: true },
  { id: 'luma', name: 'Luma Dream Machine', category: 'video', isFree: false, isPremium: true, envKey: 'LUMA_API_KEY', costWeight: 9, capabilities: ['text2video', 'img2video', 'cinematic', 'camera_moves'], climaxOnly: true },
  { id: 'runway', name: 'Runway Gen-3', category: 'video', isFree: false, isPremium: true, envKey: 'RUNWAY_API_KEY', costWeight: 9, capabilities: ['text2video', 'motion', 'production'], climaxOnly: true },
  { id: 'hailuo', name: 'Hailuo / MiniMax', category: 'video', isFree: false, isPremium: false, envKey: 'HAILUO_API_KEY', altEnvKeys: ['MINIMAX_API_KEY'], costWeight: 5, capabilities: ['text2video', 'micro_expressions', 'stylization'] },
  { id: 'fal', name: 'fal.ai', category: 'video', isFree: false, isPremium: false, envKey: 'FAL_KEY', altEnvKeys: ['FAL_API_KEY'], costWeight: 4, capabilities: ['text2video', 'fast_inference', 'workflow'] },
  { id: 'replicate-wan', name: 'Wan 2.2 (Alibaba)', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 1, capabilities: ['text2video', 'oss', 'replicate'] },
  { id: 'hunyuan', name: 'HunyuanVideo (Tencent)', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 1, capabilities: ['text2video', 'oss', 'replicate'] },
  { id: 'mochi', name: 'Mochi 1 (Genmo)', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 1, capabilities: ['text2video', 'oss', 'apache-2.0'] },
  { id: 'open-sora', name: 'Open-Sora', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 1, capabilities: ['text2video', 'img2video', 'oss'] },
  { id: 'pyramid-flow', name: 'Pyramid Flow', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 1, capabilities: ['text2video', 'img2video', 'oss'] },
  { id: 'allegro', name: 'Allegro (RhymesAI)', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 1, capabilities: ['text2video', 'apache-2.0'] },
  { id: 'kandinsky', name: 'Kandinsky Video', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 1, capabilities: ['text2video', 'oss'] },
  { id: 'skyreels', name: 'SkyReels V1', category: 'video', isFree: true, isPremium: false, envKey: 'PIAPI_API_KEY', costWeight: 2, capabilities: ['img2video', 'human_centric', 'oss'] },
  { id: 'ovi', name: 'Ovi (video+audio)', category: 'video', isFree: true, isPremium: false, envKey: 'FAL_KEY', altEnvKeys: ['REPLICATE_API_TOKEN'], costWeight: 2, capabilities: ['text2video', 'audio_sync', 'oss'] },
  { id: 'deepinfra', name: 'DeepInfra OSS Video', category: 'video', isFree: true, isPremium: false, envKey: 'DEEPINFRA_API_KEY', costWeight: 1, capabilities: ['text2video', 'wan', 'oss'] },
  { id: 'cogvideox', name: 'CogVideoX (THUDM)', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 1, capabilities: ['text2video', 'oss', 'replicate'] },
  { id: 'ltx-video', name: 'LTX Video (Lightricks)', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 1, capabilities: ['text2video', 'oss'] },
  { id: 'videocrafter', name: 'VideoCrafter (ModelScope)', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 1, capabilities: ['text2video', 'oss'] },
  { id: 'animatediff', name: 'AnimateDiff', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 1, capabilities: ['text2video', 'motion', 'oss'] },
  { id: 'zeroscope', name: 'Zeroscope OSS', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 1, capabilities: ['text2video', 'oss'] },
  { id: 'replicate-minimax', name: 'MiniMax via Replicate', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 2, capabilities: ['text2video', 'replicate'] },
  { id: 'replicate-svd', name: 'Stable Video Diffusion', category: 'video', isFree: true, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 2, capabilities: ['img2video', 'svd', 'oss'] },
  { id: 'luma-replicate', name: 'Luma via Replicate', category: 'video', isFree: false, isPremium: false, envKey: 'REPLICATE_API_TOKEN', costWeight: 5, capabilities: ['text2video', 'replicate_gateway'] },
  { id: 'morph', name: 'Morph Studio', category: 'video', isFree: false, isPremium: false, envKey: 'MORPH_API_KEY', costWeight: 6, capabilities: ['text2video', 'camera_pan'] },

  // ── Video: Workhorse (80%) ──
  { id: 'agnes', name: 'Agnes AI', category: 'video', isFree: true, isPremium: false, envKey: 'AGNES_API_KEY', costWeight: 1, capabilities: ['text2video', 'free_tier', 'unlimited'] },
  { id: 'comfyui', name: 'ComfyUI / AnimateDiff', category: 'video', isFree: true, isPremium: false, envKey: 'COMFYUI_URL', costWeight: 1, capabilities: ['animatediff', 'svd', 'local_oss'] },
  { id: 'slideshow', name: 'FFmpeg Slideshow', category: 'video', isFree: true, isPremium: false, costWeight: 0, capabilities: ['ken_burns', 'parallax', 'always_available'] },
  { id: 'ffmpeg-minimal', name: 'FFmpeg Minimal MP4', category: 'video', isFree: true, isPremium: false, costWeight: 0, capabilities: ['nuclear_fallback'] },

  // ── Audio: Premium ──
  { id: 'elevenlabs', name: 'ElevenLabs', category: 'audio', isFree: false, isPremium: true, envKey: 'ELEVENLABS_API_KEY', costWeight: 7, capabilities: ['tts', 'voice_clone', 'dialogue', 'emotional'], climaxOnly: true },
  { id: 'deepgram', name: 'Deepgram Nova-2', category: 'transcription', isFree: false, isPremium: true, envKey: 'DEEPGRAM_API_KEY', costWeight: 5, capabilities: ['stt', 'diarization', 'streaming'] },
  { id: 'assemblyai', name: 'AssemblyAI', category: 'transcription', isFree: false, isPremium: false, envKey: 'ASSEMBLYAI_API_KEY', costWeight: 4, capabilities: ['stt', 'sentiment', '99_languages'] },
  { id: 'auphonic', name: 'Auphonic', category: 'audio', isFree: false, isPremium: true, envKey: 'AUPHONIC_API_KEY', costWeight: 6, capabilities: ['mastering', 'loudness', 'noise_reduction'], climaxOnly: true },

  // ── Audio: Workhorse ──
  { id: 'cartesia', name: 'Cartesia', category: 'audio', isFree: false, isPremium: false, envKey: 'CARTESIA_API_KEY', costWeight: 3, capabilities: ['tts', 'low_latency'] },
  { id: 'fish-audio', name: 'Fish Audio', category: 'audio', isFree: false, isPremium: false, envKey: 'FISH_AUDIO_API_KEY', costWeight: 2, capabilities: ['tts', 'score'] },
  { id: 'suno', name: 'Suno AI', category: 'audio', isFree: false, isPremium: false, envKey: 'SUNO_API_KEY', costWeight: 4, capabilities: ['music', 'score'] },
  { id: 'fallback-silent', name: 'Silent Fallback', category: 'audio', isFree: true, isPremium: false, costWeight: 0, capabilities: ['always_available'] },

  // ── Trinity Brain (LLMs) ──
  { id: 'deepseek', name: 'DeepSeek', category: 'llm', isFree: false, isPremium: false, envKey: 'DEEPSEEK_API_KEY', costWeight: 2, capabilities: ['storyboard', 'scriptwriting', 'reasoning', 'showrunner'] },
  { id: 'gemini', name: 'Gemini', category: 'llm', isFree: false, isPremium: false, envKey: 'GEMINI_API_KEY', costWeight: 2, capabilities: ['vision_qc', 'multimodal', 'art_director'] },
  { id: 'groq', name: 'Groq', category: 'llm', isFree: true, isPremium: false, envKey: 'GROQ_API_KEY', costWeight: 1, capabilities: ['reflex_patch', 'fast_inference', 'qc_rewrite'] },
];

export function isToolConfigured(tool: ToolEntry): boolean {
  if (!tool.envKey && !tool.altEnvKeys?.length) return tool.isFree;
  const keys = [tool.envKey, ...(tool.altEnvKeys ?? [])].filter(Boolean) as string[];
  return keys.some((k) => Boolean(getSecret(k)));
}

export function getConfiguredTools(category?: ToolCategory): ToolEntry[] {
  return TOOL_REGISTRY.filter((t) => (!category || t.category === category) && isToolConfigured(t));
}

export function getVideoProviderOrder(priority: 'premium' | 'cheap' | 'auto'): string[] {
  const videoTools = TOOL_REGISTRY.filter((t) => t.category === 'video' && isToolConfigured(t));
  const premium = videoTools.filter((t) => t.isPremium).sort((a, b) => a.costWeight - b.costWeight);
  const workhorse = videoTools.filter((t) => !t.isPremium).sort((a, b) => a.costWeight - b.costWeight);

  if (priority === 'premium') {
    return [...premium.map((t) => t.id), ...workhorse.map((t) => t.id), 'slideshow'];
  }
  // 80/20: workhorse first, premium only for climax
  return [...workhorse.map((t) => t.id), ...premium.map((t) => t.id), 'slideshow'];
}

export function allocateRenderTier(scenePriority: 'critical' | 'low' | string): 'premium' | 'cheap' {
  return scenePriority === 'critical' ? 'premium' : 'cheap';
}

export function getOmniRealityStatus(): {
  configured: string[];
  premium: string[];
  workhorse: string[];
  trinity: { deepseek: boolean; gemini: boolean; groq: boolean };
} {
  const configured = TOOL_REGISTRY.filter(isToolConfigured).map((t) => t.id);
  return {
    configured,
    premium: TOOL_REGISTRY.filter((t) => t.isPremium && isToolConfigured(t)).map((t) => t.id),
    workhorse: TOOL_REGISTRY.filter((t) => t.isFree && isToolConfigured(t)).map((t) => t.id),
    trinity: {
      deepseek: isToolConfigured(TOOL_REGISTRY.find((t) => t.id === 'deepseek')!),
      gemini: isToolConfigured(TOOL_REGISTRY.find((t) => t.id === 'gemini')!),
      groq: isToolConfigured(TOOL_REGISTRY.find((t) => t.id === 'groq')!),
    },
  };
}
