/**
 * XROGA model registry — env overrides, cost table, and use-case mix for builds.
 * Users see "Xroga AI" only; this file is internal.
 *
 * Core stack: DeepSeek Flash + Pro, Grok 4 reasoning, Claude Sonnet 5, Claude Opus.
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
  /** Typical % of build pipeline token volume (core five models sum to 100) */
  useCaseSharePct: number;
  description: string;
  /** Optional post-promo API pricing */
  inputPer1MAfterPromo?: number;
  outputPer1MAfterPromo?: number;
  promoEndsAt?: string;
}

function envModel(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

/** Free / Spark monthly token pool */
export const FREE_PLAN_TOKENS = 7_000_000;

/** Input/output split aligned with tokenTracker (67% in / 33% out) */
export const TOKEN_IO_SPLIT = { input: 0.67, output: 0.33 } as const;

/** Sonnet 5 launch pricing ends Aug 31, 2026 — then $3/$15 per MTok */
export const SONNET_5_PROMO_ENDS = '2026-08-31';

export const XROGA_MODELS: Record<XrogaModelRole, ModelSpec> = {
  deepseek_flash: {
    role: 'deepseek_flash',
    apiModel: envModel('XROGA_DEEPSEEK_FLASH_MODEL', 'deepseek-chat'),
    provider: 'deepseek',
    inputPer1M: 0.14,
    outputPer1M: 0.28,
    useCaseSharePct: 68,
    description: 'Workhorse — bulk code, file reads, step fixes, verify, condense',
  },
  deepseek_pro: {
    role: 'deepseek_pro',
    apiModel: envModel('XROGA_DEEPSEEK_PRO_MODEL', 'deepseek-reasoner'),
    provider: 'deepseek',
    inputPer1M: 0.435,
    outputPer1M: 0.87,
    useCaseSharePct: 12,
    description: 'Architecture brain — master plan, security, DB/API design, hard logic',
  },
  grok_reasoning: {
    role: 'grok_reasoning',
    apiModel: envModel('XROGA_GROK_MODEL', 'grok-4.3'),
    provider: 'xai',
    inputPer1M: 0.2,
    outputPer1M: 0.5,
    useCaseSharePct: 4,
    description: 'Grok 4 reasoning — strategy, hackathon ideation, diagnosis',
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
    useCaseSharePct: 12,
    description: 'Claude Sonnet 5 — UI/UX polish, responsive CSS, a11y (intro $2/$10 MTok)',
  },
  claude_opus: {
    role: 'claude_opus',
    apiModel: envModel('XROGA_CLAUDE_OPUS_MODEL', 'claude-opus-4-8'),
    provider: 'anthropic',
    inputPer1M: 5.0,
    outputPer1M: 25.0,
    useCaseSharePct: 4,
    description: 'Quality gate — crypto / hackathon final QA, edge cases, security',
  },
  gemini_flash: {
    role: 'gemini_flash',
    apiModel: envModel('XROGA_GEMINI_MODEL', 'gemini-2.0-flash'),
    provider: 'google',
    inputPer1M: 0.1,
    outputPer1M: 0.4,
    useCaseSharePct: 0,
    description: 'Optional cross-check fallback only — not counted in core 7M mix',
  },
};

/** Core five models used in builds (excludes optional Gemini) */
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
  sharePct: number;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
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

/** How the free 7M token pool is allocated across the core model stack */
export function quotaAllocationForPlan(totalTokens = FREE_PLAN_TOKENS): ModelQuotaSlice[] {
  return CORE_BUILD_MODELS.map((role) => {
    const m = XROGA_MODELS[role];
    const total = Math.round((totalTokens * m.useCaseSharePct) / 100);
    const inputTokens = Math.round(total * TOKEN_IO_SPLIT.input);
    const outputTokens = total - inputTokens;
    const introUsdEstimate = estimateUsdCost(inputTokens, outputTokens, role);
    const postPromoUsdEstimate =
      m.inputPer1MAfterPromo != null && m.outputPer1MAfterPromo != null
        ? (inputTokens / 1_000_000) * m.inputPer1MAfterPromo +
          (outputTokens / 1_000_000) * m.outputPer1MAfterPromo
        : undefined;

    return {
      role,
      label: MODEL_LABELS[role],
      sharePct: m.useCaseSharePct,
      totalTokens: total,
      inputTokens,
      outputTokens,
      introUsdEstimate,
      postPromoUsdEstimate,
    };
  });
}

/** Sum of intro API $ if entire 7M pool were consumed at target mix */
export function estimateFullQuotaIntroUsd(totalTokens = FREE_PLAN_TOKENS): number {
  return quotaAllocationForPlan(totalTokens).reduce((sum, s) => sum + s.introUsdEstimate, 0);
}

/** Estimated tokens reserved before a full site build starts */
export const BUILD_PREFLIGHT_ESTIMATE = {
  input: 125_000,
  output: 95_000,
};

/** Plan monthly token quotas (unpaid = free testing tier) */
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
