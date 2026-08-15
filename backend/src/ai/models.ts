/**
 * Xroga multi-model stack — monthly per-user budgets and routing roles.
 *
 * Fly.io secrets:
 *   OPENROUTER_API_KEY  → DeepSeek V4 Flash/Pro ONLY
 *   KIMI_API_KEY        → Kimi K3 (Moonshot official)
 *   GLM_API_KEY         → GLM-5.2 (Zhipu / BigModel official)
 *   GROK_API_KEY        → Grok 4.5 / 4.3 (xAI official)
 *   TAVILY_API_KEY      → research gather
 *
 * DEEPSEEK_API_KEY is unused — DeepSeek runs only via OpenRouter.
 */

export type ModelId =
  | 'kimi_k3'
  | 'glm_5_2'
  | 'deepseek_v4_pro'
  | 'deepseek_v4_flash'
  | 'grok_4_5'
  | 'grok_4_3';

export type ProviderKind = 'openrouter' | 'xai' | 'moonshot' | 'zhipu';

export interface ModelDef {
  id: ModelId;
  /** Public Xroga label — never expose raw provider names in UI copy when avoidable */
  label: string;
  role: string;
  apiModel: string;
  provider: ProviderKind;
  baseUrl: string;
  secretKey: 'OPENROUTER_API_KEY' | 'KIMI_API_KEY' | 'GLM_API_KEY' | 'GROK_API_KEY';
  /** Monthly USD budget allocation */
  budgetUsd: number;
  /** Monthly token pool (input + output combined target) */
  monthlyTokens: number;
  inputTokens: number;
  outputTokens: number;
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  contextWindow: number;
  tagline: string;
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

export const MONTHLY_TOTAL_BUDGET_USD = 16.5;
export const MONTHLY_TOTAL_BUDGET_MICRO_USD = 16_500_000;
export const MONTHLY_USER_PRICE_USD = 19;
export const MONTHLY_TOTAL_TOKENS = 6_172_222;

export const MODELS: Record<ModelId, ModelDef> = {
  kimi_k3: {
    id: 'kimi_k3',
    label: 'Xroga Apex',
    role: 'Flagship — complex reasoning, full-stack, crypto, long-horizon coding',
    apiModel: 'kimi-k3',
    provider: 'moonshot',
    baseUrl: 'https://api.moonshot.ai/v1',
    secretKey: 'KIMI_API_KEY',
    budgetUsd: 7.73,
    monthlyTokens: 888_888,
    inputTokens: 444_444,
    outputTokens: 444_444,
    inputUsdPer1M: 3.0,
    outputUsdPer1M: 15.0,
    contextWindow: 1_000_000,
    tagline: 'Chief Architect',
  },
  glm_5_2: {
    id: 'glm_5_2',
    label: 'Xroga Horizon',
    role: 'Long-context specialist — large codebases, project-level engineering',
    apiModel: 'glm-5.2',
    provider: 'zhipu',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    secretKey: 'GLM_API_KEY',
    budgetUsd: 5.8,
    monthlyTokens: 2_000_000,
    inputTokens: 1_000_000,
    outputTokens: 1_000_000,
    inputUsdPer1M: 1.4,
    outputUsdPer1M: 4.4,
    contextWindow: 1_000_000,
    tagline: 'Project Engineer',
  },
  deepseek_v4_pro: {
    id: 'deepseek_v4_pro',
    label: 'Xroga Forge',
    role: 'Cost-effective volume — agent tasks and knowledge work',
    apiModel: 'deepseek/deepseek-v4-pro',
    provider: 'openrouter',
    baseUrl: OPENROUTER_BASE_URL,
    secretKey: 'OPENROUTER_API_KEY',
    budgetUsd: 0.65,
    monthlyTokens: 1_500_000,
    inputTokens: 750_000,
    outputTokens: 750_000,
    inputUsdPer1M: 0.435,
    outputUsdPer1M: 0.87,
    contextWindow: 1_000_000,
    tagline: 'Deep Executor',
  },
  deepseek_v4_flash: {
    id: 'deepseek_v4_flash',
    label: 'Xroga Pulse',
    role: 'Fast converter + high-volume chat and simple tasks',
    apiModel: 'deepseek/deepseek-v4-flash',
    provider: 'openrouter',
    baseUrl: OPENROUTER_BASE_URL,
    secretKey: 'OPENROUTER_API_KEY',
    budgetUsd: 0.32,
    monthlyTokens: 1_000_000,
    inputTokens: 500_000,
    outputTokens: 500_000,
    inputUsdPer1M: 0.09,
    outputUsdPer1M: 0.18,
    contextWindow: 1_000_000,
    tagline: 'Converter & Volume',
  },
  grok_4_5: {
    id: 'grok_4_5',
    label: 'Xroga Live',
    // Research only. This previously read "…, coding agents", which contradicted the
    // enforced policy: `providerPolicy` refuses either Grok for engineering work, so the
    // string described a capability the system does not grant. A registry that advertises
    // what the router forbids is how the forbidden thing eventually gets re-enabled.
    role: 'Real-time intelligence — web/X search and crypto news. Research only; never writes code.',
    apiModel: 'grok-4.5',
    provider: 'xai',
    baseUrl: 'https://api.x.ai/v1',
    secretKey: 'GROK_API_KEY',
    budgetUsd: 1.0,
    monthlyTokens: 250_000,
    inputTokens: 125_000,
    outputTokens: 125_000,
    inputUsdPer1M: 2.0,
    outputUsdPer1M: 6.0,
    contextWindow: 500_000,
    tagline: 'Real-Time Intelligence',
  },
  grok_4_3: {
    id: 'grok_4_3',
    label: 'Xroga Lens',
    role: 'Backup — file analysis, document processing, 1M context',
    apiModel: 'grok-4.3',
    provider: 'xai',
    baseUrl: 'https://api.x.ai/v1',
    secretKey: 'GROK_API_KEY',
    budgetUsd: 1.0,
    monthlyTokens: 533_334,
    inputTokens: 266_667,
    outputTokens: 266_667,
    inputUsdPer1M: 1.25,
    outputUsdPer1M: 2.5,
    contextWindow: 1_000_000,
    tagline: 'Document & Backup',
  },
};

export const MODEL_LIST = Object.values(MODELS);

/** Real provider cost for a single call from token counts. */
export function costUsdForTokens(
  modelId: ModelId,
  inputTokens: number,
  outputTokens: number,
): number {
  const def = MODELS[modelId];
  const inTok = Math.max(0, inputTokens || 0);
  const outTok = Math.max(0, outputTokens || 0);
  const usd =
    (inTok / 1_000_000) * def.inputUsdPer1M + (outTok / 1_000_000) * def.outputUsdPer1M;
  return Math.round(usd * 1_000_000) / 1_000_000;
}

/** Scale base Spark pool limits by plan API budget. */
export function scaleFactorForBudget(apiBudgetUsd: number): number {
  if (!apiBudgetUsd || apiBudgetUsd <= 0) return 0;
  return apiBudgetUsd / MONTHLY_TOTAL_BUDGET_USD;
}

/** Dashboard-friendly rollup (DeepSeek Pro+Flash combined, Grok 4.5+4.3 combined). */
/**
 * Public capability tiers for the usage dashboard.
 *
 * Part 2 §30/§31: the dashboard previously published both the raw model ids (`kimi_k3`,
 * `grok`) as `role` and the model personas ("Xroga Apex", "Xroga Live / Lens") as `label`.
 * Both are forbidden on a public surface — the ids name the vendor's model directly and the
 * personas map one-to-one onto it.
 *
 * They are replaced by capability tiers rather than by a single "Black Hole ∞" repeated four
 * times. A dashboard of four identical rows satisfies the privacy rule and destroys the
 * feature: the reason a user looks at this screen is to see *which kind of work* consumed
 * their budget. "Long-Context Engineering" answers that; "Black Hole ∞" four times does not.
 *
 * `role` stays on the internal object because it is the key usage is accumulated under.
 * `publicId` is what leaves the process.
 */
/**
 * Internal pool role → the public capability-tier key published in its place.
 *
 * Exported so the few internal lookups that still need to find a pool by model can translate,
 * rather than each re-deriving the mapping and drifting from this one.
 */
export const POOL_PUBLIC_ID_BY_ROLE: Record<string, string> = {
  kimi_k3: 'flagship',
  glm_5_2: 'long_context',
  deepseek_v4: 'high_volume',
  grok: 'live_research',
};

export function dashboardModelPools(apiBudgetUsd: number = MONTHLY_TOTAL_BUDGET_USD) {
  const scale = scaleFactorForBudget(apiBudgetUsd);
  return [
    {
      role: 'kimi_k3',
      publicId: 'flagship',
      label: 'Flagship Reasoning',
      tagline: 'Deep reasoning, architecture and difficult builds',
      totalLimit: Math.round(MODELS.kimi_k3.monthlyTokens * scale),
      budgetUsd: Math.round(MODELS.kimi_k3.budgetUsd * scale * 100) / 100,
    },
    {
      role: 'glm_5_2',
      publicId: 'long_context',
      label: 'Long-Context Engineering',
      tagline: 'Large repositories and long-horizon work',
      totalLimit: Math.round(MODELS.glm_5_2.monthlyTokens * scale),
      budgetUsd: Math.round(MODELS.glm_5_2.budgetUsd * scale * 100) / 100,
    },
    {
      role: 'deepseek_v4',
      publicId: 'high_volume',
      label: 'High-Volume Execution',
      tagline: 'Fast iteration and everyday builds',
      totalLimit: Math.round(
        (MODELS.deepseek_v4_pro.monthlyTokens + MODELS.deepseek_v4_flash.monthlyTokens) * scale,
      ),
      budgetUsd:
        Math.round(
          (MODELS.deepseek_v4_pro.budgetUsd + MODELS.deepseek_v4_flash.budgetUsd) * scale * 100,
        ) / 100,
    },
    {
      role: 'grok',
      publicId: 'live_research',
      label: 'Live Research',
      tagline: 'Current web and social intelligence',
      totalLimit: Math.round(
        (MODELS.grok_4_5.monthlyTokens + MODELS.grok_4_3.monthlyTokens) * scale,
      ),
      budgetUsd:
        Math.round((MODELS.grok_4_5.budgetUsd + MODELS.grok_4_3.budgetUsd) * scale * 100) / 100,
    },
  ];
}
