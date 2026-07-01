/** Default API failover priority lists — overridable via Supabase api_priority_config */

export const LLM_PROVIDERS = [
  'openai-gpt4o',
  'anthropic-claude-3.5',
  'deepseek-v3',
  'groq-llama3',
  'gemini-pro',
  'gemini-flash',
] as const;

export const IMAGE_PROVIDERS = [
  'fal-sdxl',
  'replicate-sd',
  'agnes-image',
  'luma-image',
  'runway-image',
  'hailuo-image',
  'cloudflare',
  'comfyui',
] as const;

/** Open-source video models FIRST — premium APIs only at the end */
export const VIDEO_PROVIDERS = [
  // Tier 0: community HF Spaces ($0, round-robin)
  'hf-spaces',
  // OSS hosts (separate quota)
  'deepinfra',
  'agnes',
  'comfyui',
  // Replicate OSS — 15 open-source families
  'replicate-wan',
  'zeroscope',
  'ltx-video',
  'videocrafter',
  'animatediff',
  'allegro',
  'kandinsky',
  'mochi',
  'cogvideox',
  'open-sora',
  'pyramid-flow',
  'hunyuan',
  'skyreels',
  'ovi',
  'replicate-svd',
  'replicate-minimax',
  // Premium / paid — last resort only
  'fal',
  'hailuo',
  'kling',
  'luma',
  'luma-replicate',
  'runway',
  'morph',
  // Guaranteed motion fallback (always produces playable MP4)
  'slideshow',
] as const;

const PREMIUM_VIDEO_PROVIDERS = new Set([
  'fal',
  'hailuo',
  'kling',
  'luma',
  'luma-replicate',
  'runway',
  'morph',
]);

/** Merge DB priority with code defaults — OSS models always tried first */
function mergeVideoPriority(dbList: string[], defaults: readonly string[]): string[] {
  const oss = defaults.filter((n) => !PREMIUM_VIDEO_PROVIDERS.has(n) && n !== 'slideshow');
  const premium = defaults.filter((n) => PREMIUM_VIDEO_PROVIDERS.has(n));
  const merged: string[] = [];

  for (const n of oss) {
    if (!merged.includes(n)) merged.push(n);
  }
  for (const n of dbList) {
    if (!merged.includes(n) && n !== 'slideshow') merged.push(n);
  }
  for (const n of premium) {
    if (!merged.includes(n)) merged.push(n);
  }
  if (!merged.includes('slideshow')) merged.push('slideshow');
  return merged;
}

export const VOICE_PROVIDERS = ['elevenlabs', 'cartesia', 'fish-audio', 'google-tts'] as const;
export const SEARCH_PROVIDERS = ['tavily', 'exa', 'newsapi'] as const;

export const CHEAP_API_TIMEOUT_MS = 5000;
export const PREMIUM_API_TIMEOUT_MS = 15000;
export const VIDEO_API_TIMEOUT_MS = 120_000;
export const IMAGE_API_TIMEOUT_MS = 120_000;

const DEFAULTS: Record<string, readonly string[]> = {
  llm: LLM_PROVIDERS,
  image: IMAGE_PROVIDERS,
  video: VIDEO_PROVIDERS,
  voice: VOICE_PROVIDERS,
  search: SEARCH_PROVIDERS,
};

const CONFIG_ID: Record<string, string> = {
  llm: 'llm_text',
  image: 'image_gen',
  video: 'video_gen',
  voice: 'voice_tts',
  search: 'search_web',
};

export async function getApiPriority(apiType: keyof typeof DEFAULTS | string): Promise<string[]> {
  const key = apiType in DEFAULTS ? apiType : 'llm';
  try {
    const { getSupabaseAdmin } = await import('./supabase.js');
    const supabase = getSupabaseAdmin();
    const configId = CONFIG_ID[key] ?? 'llm_text';
    const { data } = await supabase
      .from('api_priority_config')
      .select('providers')
      .eq('id', configId)
      .maybeSingle();
    if (data?.providers && Array.isArray(data.providers)) {
      const db = data.providers as string[];
      if (key === 'video') {
        return mergeVideoPriority(db, DEFAULTS.video);
      }
      return db;
    }
  } catch {
    /* use defaults */
  }
  return [...(DEFAULTS[key] ?? DEFAULTS.llm)];
}
