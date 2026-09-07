/**
 * Fly.io secret names for the active Xroga AI stack:
 *
 * OPENROUTER_API_KEY → DeepSeek V4 Flash ONLY
 * KIMI_API_KEY       → Moonshot official
 * GLM_API_KEY        → Z.ai / Zhipu official
 * XAI_API_KEY        → xAI official (Grok + native X Search)
 * PARALLEL_API_KEY   → Parallel official (Search / Extract / Responses)
 *
 * Important:
 *
 * - DeepSeek runs only through OpenRouter.
 * - Normal public-web intelligence runs only through Parallel.
 * - Native X/Twitter intelligence runs through xAI X Search.
 * - One XAI_API_KEY covers Grok inference + x_search.
 *
 * Provider secrets are resolved by their canonical active names.
 */

const ALIASES: Record<string, string[]> = {
  // -------------------------------------------------------------------------
  // ACTIVE AI STACK
  // -------------------------------------------------------------------------

  OPENROUTER_API_KEY: [
    'OPENROUTER_API_KEY',
  ],

  KIMI_API_KEY: [
    'KIMI_API_KEY',
    'MOONSHOT_API_KEY',
  ],

  GLM_API_KEY: [
    'GLM_API_KEY',
    'ZHIPU_API_KEY',
    'BIGMODEL_API_KEY',
  ],

  /** xAI official, used only for private Grok 4.3 native x_search retrieval. */
  XAI_API_KEY: [
    'XAI_API_KEY',
  ],

  /**
   * Parallel official.
   *
   * One key covers:
   * - Search API
   * - Extract API
   * - Responses API
   */
  PARALLEL_API_KEY: [
    'PARALLEL_API_KEY',
  ],

  // -------------------------------------------------------------------------
  // IMAGE / VIDEO / MEDIA PROVIDERS
  // -------------------------------------------------------------------------

  FAL_KEY: [
    'FAL_KEY',
    'FAL_API_KEY',
  ],

  AGNES_API_KEY: [
    'AGNES_API_KEY',
  ],

  KLING_API_KEY: [
    'KLING_API_KEY',
    'KLING_ACCESS_KEY',
  ],

  KLING_API_SECRET: [
    'KLING_API_SECRET',
    'KLING_SECRET_KEY',
  ],

  LUMA_API_KEY: [
    'LUMA_API_KEY',
  ],

  RUNWAY_API_KEY: [
    'RUNWAY_API_KEY',
  ],

  HAILUO_API_KEY: [
    'HAILUO_API_KEY',
    'MINIMAX_API_KEY',
  ],

  HAILUO_UID: [
    'HAILUO_UID',
    'MINIMAX_GROUP_ID',
  ],

  REPLICATE_API_TOKEN: [
    'REPLICATE_API_TOKEN',
  ],

  STABILITY_API_KEY: [
    'STABILITY_API_KEY',
    'STABILITY_KEY',
  ],

  ELEVENLABS_API_KEY: [
    'ELEVENLABS_API_KEY',
  ],

  DEEPGRAM_API_KEY: [
    'DEEPGRAM_API_KEY',
  ],

  AUPHONIC_API_KEY: [
    'AUPHONIC_API_KEY',
  ],

  HEYGEN_API_KEY: [
    'HEYGEN_API_KEY',
    'HEY_GEN_API_KEY',
  ],

  DID_API_KEY: [
    'DID_API_KEY',
  ],

  RIME_API_KEY: [
    'RIME_API_KEY',
  ],

  RESPEECHER_API_KEY: [
    'RESPEECHER_API_KEY',
  ],

  HAPPYSCRIBE_API_KEY: [
    'HAPPYSCRIBE_API_KEY',
  ],

  DESCRIPT_API_TOKEN: [
    'DESCRIPT_API_TOKEN',
  ],

  DEEPINFRA_API_KEY: [
    'DEEPINFRA_API_KEY',
  ],

  PIAPI_API_KEY: [
    'PIAPI_API_KEY',
  ],

  HF_TOKEN: [
    'HF_TOKEN',
    'HUGGINGFACE_API_KEY',
  ],

  MORPH_API_KEY: [
    'MORPH_API_KEY',
  ],

  DEEPDUB_API_KEY: [
    'DEEPDUB_API_KEY',
  ],

  IMMERSITY_CLIENT_ID: [
    'IMMERSITY_CLIENT_ID',
    'Immersity_Client_ID',
  ],

  // -------------------------------------------------------------------------
  // OTHER MODEL / AI PROVIDERS
  // -------------------------------------------------------------------------

  ANTHROPIC_API_KEY: [
    'ANTHROPIC_API_KEY',
  ],

  OPENAI_API_KEY: [
    'OPENAI_API_KEY',
  ],

  MISTRAL_API_KEY: [
    'MISTRAL_API_KEY',
  ],

  GEMINI_API_KEY: [
    'GEMINI_API_KEY',
  ],

  GEMINI_CODE_API_KEY: [
    'GEMINI_CODE_API_KEY',
    'GEMINI_API_KEY',
  ],

  GROQ_API_KEY: [
    'GROQ_API_KEY',
  ],

  GROQ_CODE_API_KEY: [
    'GROQ_CODE_API_KEY',
    'GROQ_API_KEY',
  ],

  // -------------------------------------------------------------------------
  // DEPLOYMENT
  // -------------------------------------------------------------------------

  VERCEL_API_KEY: [
    'VERCEL_API_KEY',
    'VERCEL_TOKEN',
  ],

  VERCEL_TOKEN: [
    'VERCEL_API_KEY',
    'VERCEL_TOKEN',
  ],

  NETLIFY_ACCESS_TOKEN: [
    'NETLIFY_ACCESS_TOKEN',
  ],

  // -------------------------------------------------------------------------
  // OTHER SERVICES
  // -------------------------------------------------------------------------

  YOUTUBE_API_KEY: [
    'YOUTUBE_API_KEY',
  ],

  // -------------------------------------------------------------------------
  // LEGACY / COMPATIBILITY ONLY
  // -------------------------------------------------------------------------

  /**
   * DeepSeek direct API is not part of the active coding stack.
   * DeepSeek uses OPENROUTER_API_KEY.
   *
   * These aliases remain temporarily because old media/legacy code may
   * still check them.
   */
  DEEPSEEK_API_KEY: [
    'DEEPSEEK_API_KEY',
  ],

  DEEPSEEK_CODE_API_KEY: [
    'DEEPSEEK_CODE_API_KEY',
    'DEEPSEEK_API_KEY',
  ],

  /**
   * Tavily is no longer an active Xroga public-web provider.
   *
   * Retained temporarily so old code can be removed safely in a later
   * cleanup commit without creating an unrelated regression now.
   */
  TAVILY_API_KEY: [
    'TAVILY_API_KEY',
  ],
};

/**
 * Resolve a server-side secret using its canonical name and aliases.
 *
 * Secret values must never be returned to the frontend or logs.
 */
export function getSecret(
  primary: keyof typeof ALIASES | string,
): string | undefined {
  const keys = ALIASES[primary] ?? [primary];

  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return undefined;
}

/**
 * Boolean-only secret availability check.
 */
export function hasSecret(primary: string): boolean {
  return Boolean(getSecret(primary));
}

/**
 * Deploy-platform keys.
 */
export function getDeployKeyStatus(): Record<string, boolean> {
  return {
    VERCEL_API_KEY:
      hasSecret('VERCEL_API_KEY'),

    NETLIFY_ACCESS_TOKEN:
      hasSecret('NETLIFY_ACCESS_TOKEN'),
  };
}

/**
 * Active Xroga AI stack.
 *
 * Only providers that belong to the current production architecture
 * should appear here.
 *
 * Tavily and SearXNG are intentionally absent.
 */
export function getAiStackKeyStatus(): Record<string, boolean> {
  return {
    // DeepSeek via OpenRouter only.
    OPENROUTER_API_KEY:
      hasSecret('OPENROUTER_API_KEY'),

    // Moonshot / Kimi.
    KIMI_API_KEY:
      hasSecret('KIMI_API_KEY'),

    // Z.ai / GLM.
    GLM_API_KEY:
      hasSecret('GLM_API_KEY'),

    // Grok + native X Search.
    XAI_API_KEY:
      hasSecret('XAI_API_KEY'),

    // General public web intelligence.
    PARALLEL_API_KEY:
      hasSecret('PARALLEL_API_KEY'),
  };
}

/**
 * @deprecated Use getAiStackKeyStatus().
 */
export function getCouncilKeyStatus(): Record<string, boolean> {
  return getAiStackKeyStatus();
}

/**
 * Phase 1 / swarm AI engine provider readiness.
 */
export function getPhase1KeyStatus(): Record<string, boolean> {
  return getAiStackKeyStatus();
}

/**
 * Keys visible to video/media health checks.
 *
 * This remains separate from the active coding/web AI stack because
 * media generation has its own providers and economics.
 */
export function getVideoKeyStatus(): Record<string, boolean> {
  return {
    FAL_API_KEY:
      hasSecret('FAL_KEY'),

    AGNES_API_KEY:
      hasSecret('AGNES_API_KEY'),

    KLING_API_KEY:
      hasSecret('KLING_API_KEY'),

    KLING_API_SECRET:
      hasSecret('KLING_API_SECRET'),

    LUMA_API_KEY:
      hasSecret('LUMA_API_KEY'),

    RUNWAY_API_KEY:
      hasSecret('RUNWAY_API_KEY'),

    HAILUO_API_KEY:
      hasSecret('HAILUO_API_KEY'),

    HAILUO_UID:
      hasSecret('HAILUO_UID'),

    REPLICATE_API_TOKEN:
      hasSecret('REPLICATE_API_TOKEN'),

    STABILITY_API_KEY:
      hasSecret('STABILITY_API_KEY'),

    ELEVENLABS_API_KEY:
      hasSecret('ELEVENLABS_API_KEY'),

    /**
     * Legacy media integrations may still check DeepSeek directly.
     * This is NOT part of the active coding-model route.
     */
    DEEPSEEK_API_KEY:
      hasSecret('DEEPSEEK_API_KEY'),

    GEMINI_API_KEY:
      hasSecret('GEMINI_API_KEY'),

    DEEPINFRA_API_KEY:
      hasSecret('DEEPINFRA_API_KEY'),

    PIAPI_API_KEY:
      hasSecret('PIAPI_API_KEY'),

    HF_TOKEN:
      hasSecret('HF_TOKEN'),

    MORPH_API_KEY:
      hasSecret('MORPH_API_KEY'),

    GROQ_API_KEY:
      hasSecret('GROQ_API_KEY'),
  };
}
