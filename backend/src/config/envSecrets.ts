/**
 * Fly.io secret name aliases — matches keys stored on xroga-api.
 * Use getSecret() everywhere instead of process.env.X directly.
 */

const ALIASES: Record<string, string[]> = {
  FAL_KEY: ['FAL_KEY', 'FAL_API_KEY'],
  AGNES_API_KEY: ['AGNES_API_KEY'],
  KLING_API_KEY: ['KLING_API_KEY', 'KLING_ACCESS_KEY'],
  KLING_API_SECRET: ['KLING_API_SECRET', 'KLING_SECRET_KEY'],
  LUMA_API_KEY: ['LUMA_API_KEY'],
  RUNWAY_API_KEY: ['RUNWAY_API_KEY'],
  HAILUO_API_KEY: ['HAILUO_API_KEY', 'MINIMAX_API_KEY'],
  HAILUO_UID: ['HAILUO_UID', 'MINIMAX_GROUP_ID'],
  REPLICATE_API_TOKEN: ['REPLICATE_API_TOKEN'],
  STABILITY_API_KEY: ['STABILITY_API_KEY', 'STABILITY_KEY'],
  ELEVENLABS_API_KEY: ['ELEVENLABS_API_KEY'],
  DEEPSEEK_API_KEY: ['DEEPSEEK_API_KEY'],
  GEMINI_API_KEY: ['GEMINI_API_KEY'],
  GROQ_API_KEY: ['GROQ_API_KEY'],
  DEEPGRAM_API_KEY: ['DEEPGRAM_API_KEY'],
  AUPHONIC_API_KEY: ['AUPHONIC_API_KEY'],
  HEYGEN_API_KEY: ['HEYGEN_API_KEY', 'HEY_GEN_API_KEY'],
  DID_API_KEY: ['DID_API_KEY'],
  RIME_API_KEY: ['RIME_API_KEY'],
  RESPEECHER_API_KEY: ['RESPEECHER_API_KEY'],
  HAPPYSCRIBE_API_KEY: ['HAPPYSCRIBE_API_KEY'],
  DESCRIPT_API_TOKEN: ['DESCRIPT_API_TOKEN'],
  DEEPINFRA_API_KEY: ['DEEPINFRA_API_KEY'],
  PIAPI_API_KEY: ['PIAPI_API_KEY'],
  HF_TOKEN: ['HF_TOKEN', 'HUGGINGFACE_API_KEY'],
  MORPH_API_KEY: ['MORPH_API_KEY'],
  DEEPDUB_API_KEY: ['DEEPDUB_API_KEY'],
  IMMERSITY_CLIENT_ID: ['IMMERSITY_CLIENT_ID', 'Immersity_Client_ID'],
  IMMERSITY_CLIENT_SECRET: ['IMMERSITY_CLIENT_SECRET', 'Immersity_Client_Secret'],
};

export function getSecret(primary: keyof typeof ALIASES | string): string | undefined {
  const keys = ALIASES[primary] ?? [primary];
  for (const k of keys) {
    const v = process.env[k]?.trim();
    if (v) return v;
  }
  return undefined;
}

export function hasSecret(primary: string): boolean {
  return Boolean(getSecret(primary));
}

/** Keys visible to video health checks */
export function getVideoKeyStatus(): Record<string, boolean> {
  return {
    FAL_API_KEY: hasSecret('FAL_KEY'),
    AGNES_API_KEY: hasSecret('AGNES_API_KEY'),
    KLING_API_KEY: hasSecret('KLING_API_KEY'),
    KLING_API_SECRET: hasSecret('KLING_API_SECRET'),
    LUMA_API_KEY: hasSecret('LUMA_API_KEY'),
    RUNWAY_API_KEY: hasSecret('RUNWAY_API_KEY'),
    HAILUO_API_KEY: hasSecret('HAILUO_API_KEY'),
    HAILUO_UID: hasSecret('HAILUO_UID'),
    REPLICATE_API_TOKEN: hasSecret('REPLICATE_API_TOKEN'),
    STABILITY_API_KEY: hasSecret('STABILITY_API_KEY'),
    ELEVENLABS_API_KEY: hasSecret('ELEVENLABS_API_KEY'),
    DEEPSEEK_API_KEY: hasSecret('DEEPSEEK_API_KEY'),
    GEMINI_API_KEY: hasSecret('GEMINI_API_KEY'),
    DEEPINFRA_API_KEY: hasSecret('DEEPINFRA_API_KEY'),
    PIAPI_API_KEY: hasSecret('PIAPI_API_KEY'),
    HF_TOKEN: hasSecret('HF_TOKEN'),
    MORPH_API_KEY: hasSecret('MORPH_API_KEY'),
    GROQ_API_KEY: hasSecret('GROQ_API_KEY'),
  };
}
