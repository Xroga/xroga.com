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

export const MONTHLY_TOTAL_BUDGET_USD = 16.77;
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
    budgetUsd: 8.0,
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
    role: 'Real-time intelligence — web/X search, crypto news, coding agents',
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

/** Dashboard-friendly rollup (DeepSeek Pro+Flash combined, Grok 4.5+4.3 combined). */
export function dashboardModelPools() {
  return [
    {
      role: 'kimi_k3',
      label: MODELS.kimi_k3.label,
      tagline: MODELS.kimi_k3.tagline,
      totalLimit: MODELS.kimi_k3.monthlyTokens,
      budgetUsd: MODELS.kimi_k3.budgetUsd,
    },
    {
      role: 'glm_5_2',
      label: MODELS.glm_5_2.label,
      tagline: MODELS.glm_5_2.tagline,
      totalLimit: MODELS.glm_5_2.monthlyTokens,
      budgetUsd: MODELS.glm_5_2.budgetUsd,
    },
    {
      role: 'deepseek_v4',
      label: 'Xroga Forge / Pulse',
      tagline: 'Volume workhorse (Pro + Flash via OpenRouter)',
      totalLimit: MODELS.deepseek_v4_pro.monthlyTokens + MODELS.deepseek_v4_flash.monthlyTokens,
      budgetUsd: MODELS.deepseek_v4_pro.budgetUsd + MODELS.deepseek_v4_flash.budgetUsd,
    },
    {
      role: 'grok',
      label: 'Xroga Live / Lens',
      tagline: 'Real-time + document backup',
      totalLimit: MODELS.grok_4_5.monthlyTokens + MODELS.grok_4_3.monthlyTokens,
      budgetUsd: MODELS.grok_4_5.budgetUsd + MODELS.grok_4_3.budgetUsd,
    },
  ];
}
