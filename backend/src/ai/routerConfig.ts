import { MODELS, type ModelId, type ProviderKind } from './models.js';

export type RoutingMode = 'intelligence' | 'balanced' | 'cost';

export interface RouterAdminConfig {
  enabledProviders: ProviderKind[];
  allowedModels: ModelId[];
  defaultMode: RoutingMode;
  maxRepairAttempts: number;
  circuitFailureThreshold: number;
  perTaskTokenCap: number;
  requireHighRiskReview: boolean;
  providerBudgetUsd: Record<string, number>;
  planModes: Record<string, RoutingMode>;
  fallbackOrder: ModelId[];
  forcedResearchTaskClasses: string[];
}

function csv(value: string | undefined): string[] {
  return (value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function routingMode(value: string | undefined): RoutingMode {
  return value === 'intelligence' || value === 'cost' ? value : 'balanced';
}

function jsonRecord(value: string | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export function getRouterAdminConfig(env: NodeJS.ProcessEnv = process.env): RouterAdminConfig {
  const allModels = Object.keys(MODELS) as ModelId[];
  const configuredModels = csv(env.XROGA_ALLOWED_MODELS);
  const allowedModels = configuredModels.length
    ? allModels.filter((id) => configuredModels.includes(id))
    : allModels;
  const disabledProviders = new Set(csv(env.XROGA_DISABLED_PROVIDERS));
  const enabledProviders = [...new Set(allModels.map((id) => MODELS[id].provider))]
    .filter((provider) => !disabledProviders.has(provider));
  const rawBudgets = jsonRecord(env.XROGA_PROVIDER_BUDGETS_JSON);
  const providerBudgetUsd = Object.fromEntries(
    Object.entries(rawBudgets)
      .filter(([, value]) => typeof value === 'number' && value >= 0),
  ) as Record<string, number>;
  const rawPlanModes = jsonRecord(env.XROGA_PLAN_ROUTING_MODES_JSON);
  const planModes = Object.fromEntries(
    Object.entries(rawPlanModes)
      .filter(([, value]) => ['intelligence', 'balanced', 'cost'].includes(String(value))),
  ) as Record<string, RoutingMode>;
  const fallbackOrder = csv(env.XROGA_MODEL_FALLBACK_ORDER)
    .filter((id): id is ModelId => allModels.includes(id as ModelId));
  return {
    enabledProviders,
    allowedModels,
    defaultMode: routingMode(env.XROGA_ROUTING_MODE),
    maxRepairAttempts: Math.max(1, Math.min(5, Number(env.XROGA_MAX_REPAIR_ATTEMPTS) || 3)),
    circuitFailureThreshold: Math.max(1, Number(env.XROGA_CIRCUIT_FAILURE_THRESHOLD) || 3),
    perTaskTokenCap: Math.max(1024, Number(env.XROGA_PER_TASK_TOKEN_CAP) || 32_768),
    requireHighRiskReview: env.XROGA_REQUIRE_HIGH_RISK_REVIEW !== 'false',
    providerBudgetUsd,
    planModes,
    fallbackOrder,
    forcedResearchTaskClasses: csv(env.XROGA_FORCE_RESEARCH_TASK_CLASSES),
  };
}

export function routingModeForPlan(
  planTier: string,
  env: NodeJS.ProcessEnv = process.env,
): RoutingMode {
  const config = getRouterAdminConfig(env);
  return config.planModes[planTier] ?? config.defaultMode;
}
