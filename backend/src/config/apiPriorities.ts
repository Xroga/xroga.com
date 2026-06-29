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
export const VIDEO_PROVIDERS = ['runway', 'luma', 'kling', 'hailuo'] as const;
export const VOICE_PROVIDERS = ['elevenlabs', 'cartesia', 'fish-audio', 'google-tts'] as const;
export const SEARCH_PROVIDERS = ['tavily', 'exa', 'newsapi'] as const;

export const CHEAP_API_TIMEOUT_MS = 5000;
export const PREMIUM_API_TIMEOUT_MS = 15000;
export const VIDEO_API_TIMEOUT_MS = 30000;

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
      return data.providers as string[];
    }
  } catch {
    /* use defaults */
  }
  return [...(DEFAULTS[key] ?? DEFAULTS.llm)];
}
