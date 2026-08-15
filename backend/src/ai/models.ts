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
  | 'kimi_k2_7'
  | 'glm_5_2'
  | 'deepseek_v4_pro'
  | 'deepseek_v4_flash'
  | 'grok_4_5'
  | 'grok_4_3';

export type ProviderKind = 'openrouter' | 'xai' | 'moonshot' | 'zhipu';

/**
 * The canonical description of one model.
 *
 * This file is the single owner of transport, pricing, context and modality. Other registries
 * derive from it rather than restating it: `modelCapabilityRegistry` reads runtime health and
 * capability *scores*, `providerPolicy` owns the coding/research split, `providerCostTiers`
 * owns tiering, and `black-hole/registry` owns capability-versus-authority. None of them
 * re-declare the facts below, because two hard-coded truths eventually disagree and the
 * disagreement surfaces as a routing bug nobody can localise.
 *
 * ## Why several fields are nullable
 *
 * A model can be *known* before it is *specified*. `kimi_k2_7` is exactly that: it belongs in
 * the catalogue, its transport is decided (Moonshot), and its provider identifier, pricing and
 * context window have not been verified against the live account.
 *
 * Those three are `null` rather than zero or a plausible guess. A zero price reads as "free"
 * to a cost engine, which would then prefer this model over every other one; a guessed context
 * window silently truncates a customer's repository. `null` forces every consumer to decide
 * what to do about missing information, and the type system makes them.
 */
export interface ModelDef {
  id: ModelId;
  /** Public Xroga label — never expose raw provider names in UI copy when avoidable */
  label: string;
  role: string;
  /** The provider's identifier, or null when an operator must supply it via `modelIdEnv`. */
  apiModel: string | null;
  /** Environment variable carrying the provider identifier: an override, or a requirement. */
  modelIdEnv: string;
  provider: ProviderKind;
  baseUrl: string;
  secretKey: 'OPENROUTER_API_KEY' | 'KIMI_API_KEY' | 'GLM_API_KEY' | 'GROK_API_KEY';
  /** Monthly USD budget allocation */
  budgetUsd: number;
  /** Monthly token pool (input + output combined target) */
  monthlyTokens: number;
  inputTokens: number;
  outputTokens: number;
  /** Null until verified against the provider's published pricing. Never guessed. */
  inputUsdPer1M: number | null;
  outputUsdPer1M: number | null;
  /** Null until verified. A guessed window silently truncates a customer's repository. */
  contextWindow: number | null;
  /**
   * Modalities the configured endpoint genuinely accepts.
   *
   * Explicit rather than inferred. `modelCapabilityRegistry` previously derived image support
   * from `id.startsWith('grok')`, which is a heuristic masquerading as a fact and disagreed
   * with the Black Hole registry's separate hard-coded claim about K3.
   */
  modalities: { text: true; images: boolean };
  /**
   * Env var an operator sets once they have verified image support with the provider.
   *
   * Present only on models where support is plausible but unconfirmed. Default is off: routing
   * an image to a model that cannot read one returns a confident answer about nothing.
   */
  imagesEnv?: string;
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
    modelIdEnv: 'KIMI_MODEL_ID',
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
    modalities: { text: true, images: false },
    imagesEnv: 'KIMI_VISION_ENABLED',
    tagline: 'Chief Architect',
  },
  kimi_k2_7: {
    id: 'kimi_k2_7',
    label: 'Xroga Apex Efficient',
    role: 'Cost-efficient repository implementation — the normal software engineering route',
    // Not verified against the live Moonshot account. `null` is the honest value: an invented
    // slug would look production-ready and fail at the first call, which is a worse outcome
    // than a model that reports itself unconfigured.
    apiModel: null,
    modelIdEnv: 'KIMI_COST_EFFICIENT_MODEL_ID',
    provider: 'moonshot',
    baseUrl: 'https://api.moonshot.ai/v1',
    secretKey: 'KIMI_API_KEY',
    // Budget and pool are Xroga's own allocation decisions, not provider facts, so they are
    // real. Draws from the same Moonshot allowance as K3 until it is separately funded.
    budgetUsd: 0,
    monthlyTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    // Provider facts. Unverified, therefore null — see the ModelDef docstring.
    inputUsdPer1M: null,
    outputUsdPer1M: null,
    contextWindow: null,
    modalities: { text: true, images: false },
    tagline: 'Efficient Engineer',
  },
  glm_5_2: {
    id: 'glm_5_2',
    modelIdEnv: 'GLM_MODEL_ID',
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
    modalities: { text: true, images: false },
    tagline: 'Project Engineer',
  },
  deepseek_v4_pro: {
    id: 'deepseek_v4_pro',
    modelIdEnv: 'DEEPSEEK_PRO_MODEL_ID',
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
    modalities: { text: true, images: false },
    tagline: 'Deep Executor',
  },
  deepseek_v4_flash: {
    id: 'deepseek_v4_flash',
    modelIdEnv: 'DEEPSEEK_FLASH_MODEL_ID',
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
    modalities: { text: true, images: false },
    tagline: 'Converter & Volume',
  },
  grok_4_5: {
    id: 'grok_4_5',
    modelIdEnv: 'GROK_PRIMARY_MODEL_ID',
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
    modalities: { text: true, images: true },
    tagline: 'Real-Time Intelligence',
  },
  grok_4_3: {
    id: 'grok_4_3',
    modelIdEnv: 'GROK_REVIEW_MODEL_ID',
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
    modalities: { text: true, images: true },
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
  const price = requirePricing(def.id);
  const usd =
    (inTok / 1_000_000) * price.inputUsdPer1M + (outTok / 1_000_000) * price.outputUsdPer1M;
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

/**
 * The resolved, callable specification of a model — or null when it is not yet configured.
 *
 * This is the single function that answers "can this model actually be used, and with what
 * facts". Everything downstream — transport, routing, cost, context planning — goes through it
 * rather than reading `MODELS[id]` fields directly and each inventing its own handling of the
 * nullable ones.
 *
 * An environment override always wins for the identifier, because a provider renaming a model
 * must not require a code change. Pricing and context are read from env only for models whose
 * shipped values are null; a verified constant is never silently overridable, since that would
 * let a typo in an env var quietly change what customers are charged.
 */
export interface ResolvedModelSpec {
  readonly id: ModelId;
  readonly apiModel: string;
  readonly provider: ProviderKind;
  readonly baseUrl: string;
  readonly secretKey: ModelDef['secretKey'];
  readonly inputUsdPer1M: number;
  readonly outputUsdPer1M: number;
  readonly contextWindow: number;
  readonly supportsImages: boolean;
}

export type ModelConfigurationIssue =
  | 'missing_provider_identifier'
  | 'missing_pricing'
  | 'missing_context_window';

function positiveNumber(raw: string | undefined): number | null {
  if (!raw?.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

/** Env vars an operator uses to supply facts for a model shipped without them. */
export function operatorConfigKeys(def: ModelDef): {
  modelId: string;
  inputPrice: string;
  outputPrice: string;
  contextWindow: string;
} {
  const base = def.modelIdEnv.replace(/_MODEL_ID$/, '');
  return {
    modelId: def.modelIdEnv,
    inputPrice: `${base}_INPUT_USD_PER_1M`,
    outputPrice: `${base}_OUTPUT_USD_PER_1M`,
    contextWindow: `${base}_CONTEXT_WINDOW`,
  };
}

/**
 * Everything preventing a model from being callable. Empty when it is ready.
 *
 * Returned as a list rather than a boolean so an operator is told all of what is missing at
 * once. Discovering three required variables one deploy at a time is its own kind of outage.
 */
export function modelConfigurationIssues(
  id: ModelId,
  env: NodeJS.ProcessEnv = process.env,
): ModelConfigurationIssue[] {
  const def = MODELS[id];
  const keys = operatorConfigKeys(def);
  const issues: ModelConfigurationIssue[] = [];
  if (!(env[keys.modelId]?.trim() || def.apiModel)) issues.push('missing_provider_identifier');
  const input = def.inputUsdPer1M ?? positiveNumber(env[keys.inputPrice]);
  const output = def.outputUsdPer1M ?? positiveNumber(env[keys.outputPrice]);
  if (input === null || output === null) issues.push('missing_pricing');
  if ((def.contextWindow ?? positiveNumber(env[keys.contextWindow])) === null) {
    issues.push('missing_context_window');
  }
  return issues;
}

/** Whether the operator has verified image support for a model that ships with it off. */
function imagesEnabled(def: ModelDef, env: NodeJS.ProcessEnv): boolean {
  if (def.modalities.images) return true;
  if (!def.imagesEnv) return false;
  const raw = (env[def.imagesEnv] ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'enabled' || raw === 'on';
}

export function resolveModelSpec(
  id: ModelId,
  env: NodeJS.ProcessEnv = process.env,
): ResolvedModelSpec | null {
  const def = MODELS[id];
  if (!def) return null;
  if (modelConfigurationIssues(id, env).length) return null;

  const keys = operatorConfigKeys(def);
  return {
    id,
    apiModel: (env[keys.modelId]?.trim() || def.apiModel)!,
    provider: def.provider,
    baseUrl: def.baseUrl,
    secretKey: def.secretKey,
    inputUsdPer1M: (def.inputUsdPer1M ?? positiveNumber(env[keys.inputPrice]))!,
    outputUsdPer1M: (def.outputUsdPer1M ?? positiveNumber(env[keys.outputPrice]))!,
    contextWindow: (def.contextWindow ?? positiveNumber(env[keys.contextWindow]))!,
    supportsImages: imagesEnabled(def, env),
  };
}

export class ModelPricingUnavailableError extends Error {
  readonly code = 'MODEL_PRICING_UNAVAILABLE' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ModelPricingUnavailableError';
  }
}

/**
 * Verified pricing, or a refusal.
 *
 * Throwing beats returning zero. A model priced at zero is the cheapest model on the platform,
 * so every cost-aware routing decision would select it and every budget reservation would
 * approve it — an unpriced model would quietly become the default and bill nothing until the
 * invoice arrived. Refusing keeps an unconfigured model out of the cost system entirely.
 */
export function requirePricing(
  id: ModelId,
  env: NodeJS.ProcessEnv = process.env,
): { inputUsdPer1M: number; outputUsdPer1M: number } {
  const spec = resolveModelSpec(id, env);
  if (!spec) {
    throw new ModelPricingUnavailableError(
      `${id} has no verified pricing (${modelConfigurationIssues(id, env).join(', ')}). ` +
        'Refusing to price it: a model treated as free would win every cost comparison.',
    );
  }
  return { inputUsdPer1M: spec.inputUsdPer1M, outputUsdPer1M: spec.outputUsdPer1M };
}

/** Models that are fully specified and therefore callable right now. */
export function callableModelIds(env: NodeJS.ProcessEnv = process.env): ModelId[] {
  return (Object.keys(MODELS) as ModelId[]).filter((id) => resolveModelSpec(id, env) !== null);
}

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
