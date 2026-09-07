import { getSecret } from '../config/envSecrets.js';
import { isCodingModel } from './providerPolicy.js';
import { MODELS, resolveModelSpec, type ModelId } from './models.js';
import { getModelRuntimeHealth, type ModelRuntimeHealth } from './providerRuntime.js';
import { getRouterAdminConfig } from './routerConfig.js';
import { configuredApiModel } from './openaiCompat.js';

export type ModelCapability =
  | 'coding'
  | 'repository_analysis'
  | 'architecture'
  | 'research'
  | 'review'
  | 'debugging'
  | 'security_review'
  | 'ui_generation'
  | 'structured_output'
  | 'tool_calls'
  | 'streaming';

export interface RuntimeModelCapability {
  id: ModelId;
  provider: string;
  apiModel: string;
  configured: boolean;
  credentialSource: 'platform' | 'user' | 'none';
  enabled: boolean;
  health: ModelRuntimeHealth;
  contextWindow: number;
  maximumSafeRequestTokens: number;
  typicalLatency: 'fast' | 'medium' | 'slow';
  inputUsdPer1M: number;
  outputUsdPer1M: number;
  configuredMonthlyBudgetUsd: number;
  strengths: Record<ModelCapability, number>;
  suitableTaskClasses: string[];
  unsuitableTaskClasses: string[];
  preferredFallbacks: ModelId[];
  supports: {
    text: true;
    images: boolean;
    structuredOutput: boolean;
    toolCalls: boolean;
    streaming: true;
  };
}

/**
 * Hand-written priors, not measurements.
 *
 * §13 requires measured evidence to outrank hard-coded capability scores, and this table is
 * the hard-coded scores it means. Nothing here was observed: the numbers are a starting
 * order for a model with no history, and `capabilityRouter` confidence-weights them by
 * provenance so a measured 7 can outrank one of these 9s. The export name says so, because
 * a table called `STRENGTHS` reads like a finding.
 *
 * The research models carry `coding: 0` deliberately. §7 forbids a research provider
 * holding coding capability scores at all, and both Grok entries previously scored 7 —
 * high enough to win a coding route had `providerPolicy` not filtered them upstream. Two
 * independent controls over the same risk is the intent; a prior that would be dangerous
 * if the filter were ever removed is not a prior worth keeping.
 */
const UNVERIFIED_PRIOR_STRENGTHS: Record<
  ModelId,
  Record<ModelCapability, number>
> = {
  kimi_k3: {
    coding: 9,
    repository_analysis: 10,
    architecture: 10,
    research: 5,
    review: 9,
    debugging: 8,
    security_review: 8,
    ui_generation: 8,
    structured_output: 8,
    tool_calls: 8,
    streaming: 9,
  },

  // Serious engineering route.
  glm_5_3: {
    coding: 10,
    repository_analysis: 10,
    architecture: 9,
    research: 4,
    review: 9,
    debugging: 10,
    security_review: 8,
    ui_generation: 8,
    structured_output: 9,
    tool_calls: 9,
    streaming: 9,
  },

  // Normal high-volume engineering route.
  glm_5_3_flash: {
    coding: 9,
    repository_analysis: 8,
    architecture: 7,
    research: 4,
    review: 7,
    debugging: 8,
    security_review: 6,
    ui_generation: 8,
    structured_output: 9,
    tool_calls: 9,
    streaming: 10,
  },

  deepseek_v4_flash: {
    coding: 7,
    repository_analysis: 5,
    architecture: 4,
    research: 3,
    review: 5,
    debugging: 8,
    security_review: 4,
    ui_generation: 7,
    structured_output: 8,
    tool_calls: 6,
    streaming: 10,
  },

};

/**
 * Fallback chains.
 *
 * Every chain is closed over the four active engineering models. Retrieval providers are not
 * represented here and therefore cannot become fallbacks.
 */
const FALLBACKS: Record<
  ModelId,
  ModelId[]
> = {
  kimi_k3: [
    'glm_5_3',
    'glm_5_3_flash',
  ],

  glm_5_3: [
    'glm_5_3_flash',
    'kimi_k3',
  ],

  glm_5_3_flash: [
    'glm_5_3',
    'kimi_k3',
  ],

  deepseek_v4_flash: [
    'glm_5_3_flash',
    'glm_5_3',
  ],
};

function configured(id: ModelId): boolean {
  const def = MODELS[id];
  return Boolean(getSecret(def.secretKey));
}

/**
 * The runtime view of every *callable* model.
 *
 * Two things changed here when `models.ts` became the canonical owner of model facts.
 *
 * First, a model that is registered but not fully configured is omitted rather than listed
 * with invented numbers. `resolveModelSpec` returns null for it, and a router cannot rank what
 * it cannot see.
 *
 * Second, transport, pricing, context and image support are read from the resolved spec rather
 * than restated. The previous `images: id.startsWith('grok')` was a heuristic presented as a
 * fact, and it disagreed with the Black Hole registry's separate claim about K3 — which is how
 * image requests ended up with no route at all.
 */
export function getRuntimeModelRegistry(): RuntimeModelCapability[] {
  const admin = getRouterAdminConfig();
  return (Object.keys(MODELS) as ModelId[]).flatMap((id) => {
    const def = MODELS[id];
    const spec = resolveModelSpec(id);
    if (!spec) return [];
    const health = getModelRuntimeHealth(id);
    return [{
      id,
      provider: spec.provider,
      apiModel: spec.apiModel,
      configured: configured(id),
      credentialSource: configured(id) ? 'platform' : 'none',
      enabled: admin.allowedModels.includes(id) && admin.enabledProviders.includes(def.provider),
      health,
      contextWindow: spec.contextWindow,
      maximumSafeRequestTokens: Math.floor(spec.contextWindow * 0.8),
      typicalLatency: id.includes('flash') ? 'fast' : id.includes('kimi') ? 'slow' : 'medium',
      inputUsdPer1M: spec.inputUsdPer1M,
      outputUsdPer1M: spec.outputUsdPer1M,
      configuredMonthlyBudgetUsd:
        admin.providerBudgetUsd[def.provider] ?? def.budgetUsd,
      strengths: UNVERIFIED_PRIOR_STRENGTHS[id],
      suitableTaskClasses:
        id === 'kimi_k3'
            ? ['repository_analysis', 'architecture', 'multi_file_implementation']
            : id === 'glm_5_3'
              ? ['software_engineering', 'feature_development', 'bug_fixing']
              : ['focused_code_edit', 'validation_repair', 'test_generation'],
      unsuitableTaskClasses:
        id.includes('flash') ? ['high_risk_architecture'] : [],
      // A coding model's fallback chain is filtered to coding models here rather than only
      // in the static table, because `admin.fallbackOrder` is operator-configurable and is
      // merged in below. Without this filter an administrator could reintroduce a research
      // provider into a coding chain through configuration, which is precisely the routing
      // §7 forbids and the static table alone cannot prevent.
      preferredFallbacks: [
        ...new Set([
          ...admin.fallbackOrder.filter((fallback) => fallback !== id),
          ...FALLBACKS[id],
        ]),
      ].filter((fallback) => (isCodingModel(id) ? isCodingModel(fallback) : true)),
      supports: {
        text: true,
        // Read from the canonical catalogue, not guessed from the id.
        images: spec.supportsImages,
        structuredOutput: UNVERIFIED_PRIOR_STRENGTHS[id].structured_output >= 7,
        toolCalls: UNVERIFIED_PRIOR_STRENGTHS[id].tool_calls >= 7,
        streaming: true,
      },
    }];
  });
}

/**
 * Aggregate health for the public capabilities route.
 *
 * Part 2 §30: `safeModelDiagnostics()` publishes a per-model row carrying the model persona,
 * and it was reachable on the public `GET /capabilities` endpoint. Even with the persona
 * removed, a per-model list tells a caller how many models the platform runs and how each is
 * behaving, which is fleet composition rather than service health.
 *
 * A public caller needs one thing: is the intelligence system able to serve me. That is what
 * this returns. `safeModelDiagnostics()` is retained below for admin and operational use,
 * where §30 explicitly permits provider detail.
 */
export function publicIntelligenceHealth(): {
  status: 'operational' | 'degraded' | 'unavailable';
} {
  const registry = getRuntimeModelRegistry();
  const usable = registry.filter(
    (model) => model.configured && model.enabled && model.health.status !== 'circuit_open',
  );
  if (!usable.length) return { status: 'unavailable' };
  // Degraded rather than operational when anything usable is unhealthy: a user seeing slow or
  // failing requests should find a status that matches, not a green light that contradicts it.
  const anyDegraded = usable.some((model) => model.health.status === 'degraded');
  return { status: anyDegraded ? 'degraded' : 'operational' };
}

/** Admin and operational diagnostics. Not for public routes — see `publicIntelligenceHealth`. */
export function safeModelDiagnostics() {
  return getRuntimeModelRegistry().map((model) => ({
    label: MODELS[model.id].label,
    available: model.configured && model.enabled && model.health.status !== 'circuit_open',
    status: model.health.status,
    recentFailureRate: model.health.recentFailureRate,
    validationSuccessRate: model.health.validationSuccessRate,
  }));
}
