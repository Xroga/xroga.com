/**
 * XROGA model registry — env overrides, cost table, and use-case mix for builds.
 * Users see "Xroga AI" only; this file is internal.
 */

export type XrogaModelRole = 'deepseek_flash' | 'deepseek_pro' | 'grok_reasoning' | 'claude_sonnet' | 'claude_opus' | 'gemini_flash';

export interface ModelSpec {
  role: XrogaModelRole;
  apiModel: string;
  provider: 'deepseek' | 'xai' | 'anthropic' | 'google';
  inputPer1M: number;
  outputPer1M: number;
  /** Typical % of build pipeline token volume */
  useCaseSharePct: number;
  description: string;
}

function envModel(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

/** Latest Sonnet + Grok 4 reasoning (override via env when providers ship newer IDs) */
export const XROGA_MODELS: Record<XrogaModelRole, ModelSpec> = {
  deepseek_flash: {
    role: 'deepseek_flash',
    apiModel: envModel('XROGA_DEEPSEEK_FLASH_MODEL', 'deepseek-chat'),
    provider: 'deepseek',
    inputPer1M: 0.14,
    outputPer1M: 0.28,
    useCaseSharePct: 12,
    description: 'Fast passes — step-1 scaffold, short verify, brief condense (replaces Groq)',
  },
  deepseek_pro: {
    role: 'deepseek_pro',
    apiModel: envModel('XROGA_DEEPSEEK_PRO_MODEL', 'deepseek-chat'),
    provider: 'deepseek',
    inputPer1M: 0.14,
    outputPer1M: 0.28,
    useCaseSharePct: 58,
    description: 'Primary builder — plans, code steps 2–N, fixes, final emit',
  },
  grok_reasoning: {
    role: 'grok_reasoning',
    apiModel: envModel('XROGA_GROK_MODEL', 'grok-4-fast-reasoning'),
    provider: 'xai',
    inputPer1M: 0.2,
    outputPer1M: 0.5,
    useCaseSharePct: 4,
    description: 'Strategy + hackathon ideation before planning',
  },
  claude_sonnet: {
    role: 'claude_sonnet',
    apiModel: envModel('XROGA_CLAUDE_SONNET_MODEL', 'claude-sonnet-4-20250514'),
    provider: 'anthropic',
    inputPer1M: 2.0,
    outputPer1M: 10.0,
    useCaseSharePct: 14,
    description: 'UI/UX polish pass — responsive CSS, a11y, animations',
  },
  claude_opus: {
    role: 'claude_opus',
    apiModel: envModel('XROGA_CLAUDE_OPUS_MODEL', 'claude-opus-4-20250514'),
    provider: 'anthropic',
    inputPer1M: 5.0,
    outputPer1M: 25.0,
    useCaseSharePct: 3,
    description: 'Final QA — crypto / hackathon builds only',
  },
  gemini_flash: {
    role: 'gemini_flash',
    apiModel: envModel('XROGA_GEMINI_MODEL', 'gemini-2.0-flash'),
    provider: 'google',
    inputPer1M: 0.1,
    outputPer1M: 0.4,
    useCaseSharePct: 9,
    description: 'Plan cross-check + per-step logic verify',
  },
};

/** Estimated tokens reserved before a full site build starts */
export const BUILD_PREFLIGHT_ESTIMATE = {
  input: 140_000,
  output: 110_000,
};

/** Plan monthly token quotas (unpaid = free testing tier) */
export const PLAN_TOKEN_QUOTA: Record<string, number> = {
  unpaid: 7_000_000,
  spark: 7_000_000,
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
