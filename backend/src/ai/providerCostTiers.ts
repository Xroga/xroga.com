/**
 * Coding families, fixed transports, and cost tiers.
 *
 * Command 3's provider clarifications add three rules the family-level policy in
 * `providerPolicy.ts` does not express:
 *
 *   1. **Transport is a property of the family, not the model.** Kimi is Moonshot-only,
 *      GLM is Zhipu-only, DeepSeek is OpenRouter-only. Stated as an invariant rather than
 *      a table lookup, because the dangerous direction is one-way: OpenRouter lists many
 *      models, so a future Kimi or GLM entry could acquire OpenRouter authority simply by
 *      appearing there. `assertTransportPolicy` refuses that by construction.
 *
 *   2. **Each family has a premium and a cost-efficient tier**, and the cheaper one is the
 *      default when its evidence is sufficient. Routing to the strongest model for every
 *      task is as wrong as routing to the cheapest — the command asks for the least
 *      expensive candidate whose measured evidence covers the work, escalating only when
 *      validation or capability requires it.
 *
 *   3. **Evidence is per model, never per family.** Kimi K3 and Kimi K2.7 are different
 *      products; a benchmark result for one says nothing about the other. Sharing a score
 *      across a family would let a premium model's record justify routing to its cheap
 *      sibling.
 *
 * On models this file deliberately does not name: Kimi K2.7 and the lower-cost GLM
 * candidate are registered as **configuration-gated**. The command is explicit that their
 * exact official provider identifiers must be verified against the live account rather
 * than guessed from a human-readable name, and inventing a slug like `kimi-k2.7` would
 * produce a model that 404s at the provider while appearing registered here. They resolve
 * from environment configuration, and report `not_configured` when absent — which is the
 * truthful state, not a defect.
 */

import { isCodingModel } from './providerPolicy.js';

export type CodingFamily = 'kimi' | 'glm' | 'deepseek';
export type CodingTransport = 'moonshot' | 'zhipu' | 'openrouter';
export type CostTier = 'premium' | 'cost_efficient';

/** The one transport each coding family may use. Not overridable per model. */
export const FAMILY_TRANSPORT: Record<CodingFamily, CodingTransport> = {
  kimi: 'moonshot',
  glm: 'zhipu',
  deepseek: 'openrouter',
};

/** The only family permitted through OpenRouter, stated once so tests can assert it. */
export const OPENROUTER_CODING_FAMILY: CodingFamily = 'deepseek';

export interface CodingModelTier {
  /** Logical id used across routing and evidence. */
  readonly modelId: string;
  readonly family: CodingFamily;
  readonly tier: CostTier;
  /**
   * Environment variable holding the provider's exact model identifier.
   *
   * Present for every entry: even the models with defaults remain overridable, because a
   * provider renaming a model must not require a code change.
   */
  readonly modelIdEnv: string;
  /**
   * Whether this entry needs configuration before it can be used at all.
   *
   * True where the command requires the exact official identifier to be verified against
   * the live account rather than assumed.
   */
  readonly requiresVerifiedIdentifier: boolean;
}

/**
 * The intended coding pool.
 *
 * Order within a family is premium first, which is only presentation — routing sorts by
 * cost and evidence, never by position here.
 */
export const CODING_MODEL_TIERS: readonly CodingModelTier[] = [
  { modelId: 'kimi_k3', family: 'kimi', tier: 'premium', modelIdEnv: 'KIMI_MODEL_ID', requiresVerifiedIdentifier: false },
  { modelId: 'kimi_k2_7', family: 'kimi', tier: 'cost_efficient', modelIdEnv: 'KIMI_COST_EFFICIENT_MODEL_ID', requiresVerifiedIdentifier: true },
  { modelId: 'glm_5_2', family: 'glm', tier: 'premium', modelIdEnv: 'GLM_MODEL_ID', requiresVerifiedIdentifier: false },
  { modelId: 'glm_cost_efficient', family: 'glm', tier: 'cost_efficient', modelIdEnv: 'GLM_COST_EFFICIENT_MODEL_ID', requiresVerifiedIdentifier: true },
  { modelId: 'deepseek_v4_pro', family: 'deepseek', tier: 'premium', modelIdEnv: 'DEEPSEEK_PRO_MODEL_ID', requiresVerifiedIdentifier: false },
  { modelId: 'deepseek_v4_flash', family: 'deepseek', tier: 'cost_efficient', modelIdEnv: 'DEEPSEEK_FLASH_MODEL_ID', requiresVerifiedIdentifier: false },
];

const TIER_BY_MODEL = new Map(CODING_MODEL_TIERS.map((entry) => [entry.modelId, entry]));

export function codingTierFor(modelId: string): CodingModelTier | null {
  return TIER_BY_MODEL.get(modelId) ?? null;
}

export function familyFor(modelId: string): CodingFamily | null {
  return TIER_BY_MODEL.get(modelId)?.family ?? null;
}

export type ModelAvailability = 'available' | 'not_configured' | 'unknown_model';

/**
 * Whether a tier can actually be called.
 *
 * A configuration-gated model with no configured identifier is `not_configured` — a
 * truthful state that keeps it out of routing without pretending it failed.
 */
export function modelAvailability(
  modelId: string,
  env: NodeJS.ProcessEnv = process.env,
): ModelAvailability {
  const tier = codingTierFor(modelId);
  if (!tier) return 'unknown_model';
  if (!tier.requiresVerifiedIdentifier) return 'available';
  return env[tier.modelIdEnv]?.trim() ? 'available' : 'not_configured';
}

export class TransportPolicyError extends Error {
  readonly code = 'TRANSPORT_POLICY_VIOLATION' as const;
  constructor(message: string) {
    super(message);
    this.name = 'TransportPolicyError';
  }
}

/**
 * The invariant: OpenRouter carries DeepSeek and nothing else.
 *
 * Checked as a relationship rather than a lookup, so a model added to the catalog with the
 * wrong transport fails here instead of silently gaining authority. The reverse direction
 * matters equally — Kimi or GLM reaching OpenRouter would breach the provider agreement
 * this policy exists to hold.
 */
export function assertTransportPolicy(modelId: string, transport: string): void {
  const family = familyFor(modelId);
  if (!family) {
    throw new TransportPolicyError(
      `"${modelId}" is not in the coding catalog, so it has no permitted transport.`,
    );
  }
  const required = FAMILY_TRANSPORT[family];
  if (transport !== required) {
    throw new TransportPolicyError(
      `"${modelId}" is a ${family} model and must use ${required}; ${transport} was requested.`,
    );
  }
  if (transport === 'openrouter' && family !== OPENROUTER_CODING_FAMILY) {
    throw new TransportPolicyError(
      `OpenRouter carries ${OPENROUTER_CODING_FAMILY} coding models only; "${modelId}" is ${family}.`,
    );
  }
}

/** Measured evidence for one model in one role. Never shared across a family. */
export interface ModelEvidence {
  readonly modelId: string;
  readonly role: string;
  /** 0–1. Fraction of attempts whose executable validation passed. */
  readonly validationSuccessRate: number;
  readonly samples: number;
  /** Observed cost per task in USD. */
  readonly costUsdPerTask: number;
  readonly maturity: 'unsupported' | 'experimental' | 'beta' | 'verified' | 'degraded';
}

/** Minimum samples before a record may justify preferring a cheaper model. */
export const MIN_EVIDENCE_SAMPLES = 5;

/** Validation floor a cost-efficient model must clear to be preferred on price. */
export const SUFFICIENT_VALIDATION_RATE = 0.75;

export interface RoutingChoice {
  readonly modelId: string;
  readonly reason: string;
  /** Ranked candidates to escalate through, cheapest sufficient first. */
  readonly escalation: readonly string[];
  /**
   * True when measurement decided this, false when a hand-written prior did.
   *
   * Carried structurally rather than left to the `reason` prose. A caller that has to parse
   * a sentence to learn whether a choice was earned will eventually parse it wrong, and the
   * failure is silent: a prior-based selection recorded as measured, which is precisely the
   * claim §13 exists to prevent.
   */
  readonly measured: boolean;
}

/**
 * Chooses the least-expensive candidate whose evidence covers the work.
 *
 * Sufficiency is deliberately strict about *why* a model qualifies. A cheap model with no
 * measured history is not "probably fine" — it is unmeasured, and preferring it on price
 * alone would be exactly the unverified routing §13 forbids. So a cost-efficient model
 * wins only on `verified` or `beta` maturity with enough samples above the validation
 * floor; otherwise the premium candidate leads and the cheaper one sits in the escalation
 * chain, where a real result will eventually earn it the lead.
 *
 * Escalation order is the remaining candidates by ascending cost, so a failure walks
 * toward capability rather than jumping straight to the most expensive option.
 */
export function chooseCostAware(input: {
  candidates: readonly string[];
  evidence: readonly ModelEvidence[];
  role: string;
  env?: NodeJS.ProcessEnv;
}): RoutingChoice | null {
  const usable = input.candidates.filter(
    (modelId) =>
      isCodingModel(modelId) === true ||
      // The catalog is the authority for tiers the legacy allowlist has not caught up to;
      // both must know a model before it is routed anywhere.
      (codingTierFor(modelId) !== null && modelAvailability(modelId, input.env) === 'available'),
  );
  const available = usable.filter((modelId) => modelAvailability(modelId, input.env) === 'available');
  if (!available.length) return null;

  const evidenceFor = (modelId: string) =>
    input.evidence.find((record) => record.modelId === modelId && record.role === input.role) ?? null;

  const byCost = [...available].sort((a, b) => {
    const costA = evidenceFor(a)?.costUsdPerTask ?? Number.POSITIVE_INFINITY;
    const costB = evidenceFor(b)?.costUsdPerTask ?? Number.POSITIVE_INFINITY;
    return costA - costB;
  });

  const sufficient = byCost.find((modelId) => {
    const record = evidenceFor(modelId);
    if (!record) return false;
    if (record.maturity !== 'verified' && record.maturity !== 'beta') return false;
    return record.samples >= MIN_EVIDENCE_SAMPLES && record.validationSuccessRate >= SUFFICIENT_VALIDATION_RATE;
  });

  if (sufficient) {
    const record = evidenceFor(sufficient)!;
    return {
      modelId: sufficient,
      reason:
        `${sufficient} is the least-expensive candidate with sufficient evidence for ${input.role}: ` +
        `${Math.round(record.validationSuccessRate * 100)}% validation over ${record.samples} samples ` +
        `(${record.maturity}), $${record.costUsdPerTask.toFixed(4)} per task.`,
      escalation: byCost.filter((modelId) => modelId !== sufficient),
      measured: true,
    };
  }

  // Nothing has earned the lead on price. Prefer the premium tier, and say so plainly
  // rather than implying a measured choice.
  const premium = byCost.find((modelId) => codingTierFor(modelId)?.tier === 'premium') ?? byCost[0]!;
  return {
    modelId: premium,
    reason:
      `No cost-efficient candidate has sufficient measured evidence for ${input.role}, so the ` +
      `premium tier leads. ${premium} selected on prior, not on measurement.`,
    escalation: byCost.filter((modelId) => modelId !== premium),
    measured: false,
  };
}
