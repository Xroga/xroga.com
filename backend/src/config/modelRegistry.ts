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
  | 'grok_fast'
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

/** Free / Spark monthly pools — more input, less output (67% / 33%) */
export const FREE_PLAN_INPUT_TOKENS = 4_700_000;
export const FREE_PLAN_OUTPUT_TOKENS = 2_300_000;
export const FREE_PLAN_TOKENS = FREE_PLAN_INPUT_TOKENS + FREE_PLAN_OUTPUT_TOKENS;

/** External APIs (not counted in LLM token quota) */
export const WEB_RESEARCH_COST = {
  /** Tavily ~$0.008 per search (basic) */
  tavilyPerSearchUsd: 0.008,
  /** Avg Tavily calls per build when TAVILY_API_KEY set (hackathon/UI/critical) */
  tavilySearchesPerBuild: 2,
  /** SearXNG self-hosted / public instances */
  searxngPerSearchUsd: 0,
  searxngSearchesPerBuild: 3,
} as const;

/** Sonnet 5 launch pricing ends Aug 31, 2026 — then $3/$15 per MTok */
export const SONNET_5_PROMO_ENDS = '2026-08-31';

/** Hackathon / large repos — store more files per project */
export const HACKATHON_MAX_STORED_FILES = 200;
export const HACKATHON_GITHUB_BATCH_SIZE = 35;
export const HACKATHON_REPO_TREE_SAMPLE = 500;

/** Platform Claude API budget per user per month (intro pricing) */
export const CLAUDE_MONTHLY_BUDGET_USD = 5;

export const XROGA_MODELS: Record<XrogaModelRole, ModelSpec> = {
  deepseek_flash: {
    role: 'deepseek_flash',
    apiModel: envModel('XROGA_DEEPSEEK_FLASH_MODEL', 'deepseek-v4-flash'),
    provider: 'deepseek',
    inputPer1M: 0.14,
    outputPer1M: 0.28,
    inputSharePct: 60,
    outputSharePct: 60,
    description: 'Workhorse — bulk code, file reads, fixes, verify, simple UI polish',
  },
  deepseek_pro: {
    role: 'deepseek_pro',
    apiModel: envModel('XROGA_DEEPSEEK_PRO_MODEL', 'deepseek-v4-pro'),
    provider: 'deepseek',
    inputPer1M: 0.435,
    outputPer1M: 0.87,
    inputSharePct: 30,
    outputSharePct: 30,
    description: 'DeepSeek Pro — architecture, plan review, quality gate (replaces most Grok work)',
  },
  grok_reasoning: {
    role: 'grok_reasoning',
    /** Official xAI chat id — grok-4.3 @ $1.25/$2.50 (NOT grok-4.5) */
    apiModel: envModel('XROGA_GROK_MODEL', 'grok-4.3'),
    provider: 'xai',
    inputPer1M: 1.25,
    outputPer1M: 2.5,
    inputSharePct: 3,
    outputSharePct: 3,
    description: 'Grok 4.3 — premium/hackathon strategy/audit only (off on simple+standard by default)',
  },
  grok_fast: {
    role: 'grok_fast',
    /** grok-4.5 is $2/$6 — almost never use; kept for emergency override only */
    apiModel: envModel('XROGA_GROK_FAST_MODEL', 'grok-4.5'),
    provider: 'xai',
    inputPer1M: 2.0,
    outputPer1M: 6.0,
    inputSharePct: 0,
    outputSharePct: 0,
    description: 'Grok 4.5 — DISABLED by default for builds (0% — needs XROGA_ALLOW_GROK_45=1)',
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
    outputSharePct: 6,
    description: 'Claude Sonnet 5 — UI polish only on standard+ builds (strict % + $5 budget)',
  },
  claude_opus: {
    role: 'claude_opus',
    apiModel: envModel('XROGA_CLAUDE_OPUS_MODEL', 'claude-opus-4-8'),
    provider: 'anthropic',
    inputPer1M: 5.0,
    outputPer1M: 25.0,
    inputSharePct: 1,
    outputSharePct: 1,
    description: 'Opus — crypto/security QA only (minimal)',
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
  'grok_fast',
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

import { publicModelLabel } from './xrogaPublicModels.js';

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
      label: publicModelLabel(role),
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
  input: 145_000,
  output: 88_000,
};

/** Typical token burn for one standard site build (DeepSeek-heavy mix) */
export const TYPICAL_BUILD_TOKENS = BUILD_PREFLIGHT_ESTIMATE;

/** Simple blog/landing — Flash-first, no Grok search/review */
export const SIMPLE_BUILD_TOKENS = {
  input: 95_000,
  output: 55_000,
};

/** Targeted update — only named files, cached repo, no Phase 0 research */
export const TYPICAL_UPDATE_TOKENS = {
  input: 55_000,
  output: 38_000,
};

/** UI touch update with Grok + light Sonnet on patched files only */
export const TYPICAL_UI_UPDATE_TOKENS = {
  input: 72_000,
  output: 48_000,
};

/** Estimate provider API $ for one build at target model mix */
export function estimateSingleBuildApiUsd(): {
  llmUsd: number;
  webResearchUsd: number;
  totalUsd: number;
  inputTokens: number;
  outputTokens: number;
} {
  const { input, output } = TYPICAL_BUILD_TOKENS;
  let llmUsd = 0;
  for (const role of CORE_BUILD_MODELS) {
    const m = XROGA_MODELS[role];
    const inTok = Math.round((input * m.inputSharePct) / 100);
    const outTok = Math.round((output * m.outputSharePct) / 100);
    llmUsd += estimateUsdCost(inTok, outTok, role);
  }
  const webResearchUsd =
    WEB_RESEARCH_COST.tavilySearchesPerBuild * WEB_RESEARCH_COST.tavilyPerSearchUsd;
  return {
    llmUsd: Math.round(llmUsd * 1000) / 1000,
    webResearchUsd: Math.round(webResearchUsd * 1000) / 1000,
    totalUsd: Math.round((llmUsd + webResearchUsd) * 1000) / 1000,
    inputTokens: input,
    outputTokens: output,
  };
}

/** Full provider API $ if entire 7M user quota is consumed at target mix */
export function estimateFullQuotaBreakdownUsd(
  inputPool = FREE_PLAN_INPUT_TOKENS,
  outputPool = FREE_PLAN_OUTPUT_TOKENS
): {
  llmUsd: number;
  webResearchUsdEstimate: number;
  totalUsd: number;
  perModel: ModelQuotaSlice[];
} {
  const perModel = quotaAllocationForPlan(inputPool, outputPool);
  const llmUsd = perModel.reduce((s, m) => s + m.introUsdEstimate, 0);
  const buildsAtTypical = Math.floor(
    FREE_PLAN_TOKENS / (TYPICAL_BUILD_TOKENS.input + TYPICAL_BUILD_TOKENS.output)
  );
  const webResearchUsdEstimate =
    buildsAtTypical * WEB_RESEARCH_COST.tavilySearchesPerBuild * WEB_RESEARCH_COST.tavilyPerSearchUsd;
  return {
    llmUsd: Math.round(llmUsd * 100) / 100,
    webResearchUsdEstimate: Math.round(webResearchUsdEstimate * 100) / 100,
    totalUsd: Math.round((llmUsd + webResearchUsdEstimate) * 100) / 100,
    perModel,
  };
}

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

export const CLAUDE_MODEL_ROLES: XrogaModelRole[] = ['claude_sonnet', 'claude_opus'];

/** Combined Claude USD spent this period from usage map */
export function claudeUsdFromUsage(usage: Partial<Record<XrogaModelRole, { input: number; output: number }>>): number {
  let total = 0;
  for (const role of CLAUDE_MODEL_ROLES) {
    const u = usage[role];
    if (u) total += estimateUsdCost(u.input, u.output, role);
  }
  return total;
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
