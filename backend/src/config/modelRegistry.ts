/**
 * XROGA model registry — env overrides, cost table, and use-case mix for builds.
 * Users see "Xroga AI" only; this file is internal.
 *
 * Core stack: DeepSeek Flash + Pro, Grok 4 reasoning, Claude Sonnet 5, Claude Opus.
 * Input and output token pools are tracked separately (not 7M all-input).
 */

export type XrogaModelRole =
  | 'deepseek_flash'
  | 'deepseek_pro'
  | 'grok_reasoning'
  | 'claude_sonnet'
  | 'claude_opus'
  | 'gemini_flash';

export interface ModelSpec {
  role: XrogaModelRole;
  apiModel: string;
  provider: 'deepseek' | 'xai' | 'anthropic' | 'google';
  inputPer1M: number;
  outputPer1M: number;
  /** % of monthly INPUT token pool this model typically consumes */
  inputSharePct: number;
  /** % of monthly OUTPUT token pool this model typically consumes */
  outputSharePct: number;
  description: string;
  inputPer1MAfterPromo?: number;
  outputPer1MAfterPromo?: number;
  promoEndsAt?: string;
}

function envModel(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

/** Free / Spark monthly pools — input and output tracked separately */
export const FREE_PLAN_INPUT_TOKENS = 3_500_000;
export const FREE_PLAN_OUTPUT_TOKENS = 3_500_000;
export const FREE_PLAN_TOKENS = FREE_PLAN_INPUT_TOKENS + FREE_PLAN_OUTPUT_TOKENS;

/** Sonnet 5 launch pricing ends Aug 31, 2026 — then $3/$15 per MTok */
export const SONNET_5_PROMO_ENDS = '2026-08-31';

/** Hackathon / large repos — store more files per project */
export const HACKATHON_MAX_STORED_FILES = 120;
export const HACKATHON_REPO_TREE_SAMPLE = 200;

export const XROGA_MODELS: Record<XrogaModelRole, ModelSpec> = {
  deepseek_flash: {
    role: 'deepseek_flash',
    apiModel: envModel('XROGA_DEEPSEEK_FLASH_MODEL', 'deepseek-chat'),
    provider: 'deepseek',
    inputPer1M: 0.14,
    outputPer1M: 0.28,
    inputSharePct: 48,
    outputSharePct: 52,
    description: 'Workhorse — bulk code output, file reads, fixes, verify',
  },
  deepseek_pro: {
    role: 'deepseek_pro',
    apiModel: envModel('XROGA_DEEPSEEK_PRO_MODEL', 'deepseek-reasoner'),
    provider: 'deepseek',
    inputPer1M: 0.435,
    outputPer1M: 0.87,
    inputSharePct: 30,
    outputSharePct: 24,
    description: 'DeepSeek Pro — architecture, repo analysis, security, hard logic, plan review',
  },
  grok_reasoning: {
    role: 'grok_reasoning',
    apiModel: envModel('XROGA_GROK_MODEL', 'grok-4.3'),
    provider: 'xai',
    inputPer1M: 0.2,
    outputPer1M: 0.5,
    inputSharePct: 4,
    outputSharePct: 3,
    description: 'Grok 4 reasoning — strategy, hackathon ideation',
  },
  claude_sonnet: {
    role: 'claude_sonnet',
    apiModel: envModel('XROGA_CLAUDE_SONNET_MODEL', 'claude-sonnet-5'),
    provider: 'anthropic',
    inputPer1M: 2.0,
    outputPer1M: 10.0,
    inputPer1MAfterPromo: 3.0,
    outputPer1MAfterPromo: 15.0,
    promoEndsAt: SONNET_5_PROMO_ENDS,
    inputSharePct: 6,
    outputSharePct: 12,
    description: 'Claude Sonnet 5 — UI polish (intro $2/$10 MTok thru Aug 2026)',
  },
  claude_opus: {
    role: 'claude_opus',
    apiModel: envModel('XROGA_CLAUDE_OPUS_MODEL', 'claude-opus-4-8'),
    provider: 'anthropic',
    inputPer1M: 5.0,
    outputPer1M: 25.0,
    inputSharePct: 12,
    outputSharePct: 9,
    description: 'Opus — crypto / hackathon final QA, edge cases',
  },
  gemini_flash: {
    role: 'gemini_flash',
    apiModel: envModel('XROGA_GEMINI_MODEL', 'gemini-2.0-flash'),
    provider: 'google',
    inputPer1M: 0.1,
    outputPer1M: 0.4,
    inputSharePct: 0,
    outputSharePct: 0,
    description: 'Optional cross-check fallback — not in core mix',
  },
};

export const CORE_BUILD_MODELS: XrogaModelRole[] = [
  'deepseek_flash',
  'deepseek_pro',
  'grok_reasoning',
  'claude_sonnet',
  'claude_opus',
];

export interface ModelQuotaSlice {
  role: XrogaModelRole;
  label: string;
  inputSharePct: number;
  outputSharePct: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputUsdEstimate: number;
  outputUsdEstimate: number;
  introUsdEstimate: number;
  postPromoUsdEstimate?: number;
}

const MODEL_LABELS: Record<XrogaModelRole, string> = {
  deepseek_flash: 'DeepSeek Flash',
  deepseek_pro: 'DeepSeek Pro',
  grok_reasoning: 'Grok 4 Reasoning',
  claude_sonnet: 'Claude Sonnet 5',
  claude_opus: 'Claude Opus',
  gemini_flash: 'Gemini Flash',
};

export function inputLimitForPlan(totalTokens: number): number {
  const ratio = FREE_PLAN_INPUT_TOKENS / FREE_PLAN_TOKENS;
  return Math.floor(totalTokens * ratio);
}

export function outputLimitForPlan(totalTokens: number): number {
  return totalTokens - inputLimitForPlan(totalTokens);
}

/** Per-model slice of separate input + output pools (default 3.5M + 3.5M) */
export function quotaAllocationForPlan(
  inputPool = FREE_PLAN_INPUT_TOKENS,
  outputPool = FREE_PLAN_OUTPUT_TOKENS
): ModelQuotaSlice[] {
  return CORE_BUILD_MODELS.map((role) => {
    const m = XROGA_MODELS[role];
    const inputTokens = Math.round((inputPool * m.inputSharePct) / 100);
    const outputTokens = Math.round((outputPool * m.outputSharePct) / 100);
    const inputUsdEstimate = (inputTokens / 1_000_000) * m.inputPer1M;
    const outputUsdEstimate = (outputTokens / 1_000_000) * m.outputPer1M;
    const introUsdEstimate = estimateUsdCost(inputTokens, outputTokens, role);
    const postPromoUsdEstimate =
      m.inputPer1MAfterPromo != null && m.outputPer1MAfterPromo != null
        ? (inputTokens / 1_000_000) * m.inputPer1MAfterPromo +
          (outputTokens / 1_000_000) * m.outputPer1MAfterPromo
        : undefined;

    return {
      role,
      label: MODEL_LABELS[role],
      inputSharePct: m.inputSharePct,
      outputSharePct: m.outputSharePct,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      inputUsdEstimate: (inputTokens / 1_000_000) * m.inputPer1M,
      outputUsdEstimate,
      introUsdEstimate,
      postPromoUsdEstimate,
    };
  });
}

export function estimateFullQuotaIntroUsd(
  inputPool = FREE_PLAN_INPUT_TOKENS,
  outputPool = FREE_PLAN_OUTPUT_TOKENS
): number {
  return quotaAllocationForPlan(inputPool, outputPool).reduce((sum, s) => sum + s.introUsdEstimate, 0);
}

export const BUILD_PREFLIGHT_ESTIMATE = {
  input: 130_000,
  output: 100_000,
};

export const PLAN_TOKEN_QUOTA: Record<string, number> = {
  unpaid: FREE_PLAN_TOKENS,
  spark: FREE_PLAN_TOKENS,
  pulse: 12_000_000,
  nova: 20_000_000,
  zenith: 35_000_000,
  singularity: 100_000_000,
};

export function quotaForPlanTier(tier: string | null | undefined): number {
  if (!tier || tier === 'unpaid') return PLAN_TOKEN_QUOTA.unpaid;
  return PLAN_TOKEN_QUOTA[tier] ?? PLAN_TOKEN_QUOTA.spark;
}

export function estimateUsdCost(inputTokens: number, outputTokens: number, role: XrogaModelRole): number {
  const m = XROGA_MODELS[role];
  return (inputTokens / 1_000_000) * m.inputPer1M + (outputTokens / 1_000_000) * m.outputPer1M;
}

export function isSonnet5IntroPricingActive(asOf = new Date()): boolean {
  return asOf <= new Date(`${SONNET_5_PROMO_ENDS}T23:59:59Z`);
}

/** @deprecated use inputSharePct on ModelSpec */
export function useCaseSharePct(role: XrogaModelRole): number {
  const m = XROGA_MODELS[role];
  return Math.round((m.inputSharePct + m.outputSharePct) / 2);
}
