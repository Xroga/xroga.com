import { isCodingModel } from './providerPolicy.js';

export type CodingFamily =
  | 'kimi'
  | 'glm'
  | 'deepseek';

export type CodingTransport =
  | 'moonshot'
  | 'zhipu'
  | 'openrouter';

export type CostTier =
  | 'premium'
  | 'cost_efficient';

/**
 * One permitted transport per coding family.
 *
 * This is a hard provider boundary:
 *
 * Kimi     -> Moonshot
 * GLM      -> Zhipu / Z.ai
 * DeepSeek -> OpenRouter
 */
export const FAMILY_TRANSPORT: Record<
  CodingFamily,
  CodingTransport
> = {
  kimi: 'moonshot',
  glm: 'zhipu',
  deepseek: 'openrouter',
};

export const OPENROUTER_CODING_FAMILY: CodingFamily =
  'deepseek';

export interface CodingModelTier {
  readonly modelId: string;
  readonly family: CodingFamily;
  readonly tier: CostTier;
  readonly modelIdEnv: string;

  /**
   * True only when Xroga does not ship a verified provider
   * identifier and the operator must provide one.
   */
  readonly requiresVerifiedIdentifier: boolean;
}

/**
 * Engineering catalog.
 *
 * GLM-5.2 remains temporarily available only as a rollback
 * route while GLM-5.3 and GLM-5.3-Flash are validated.
 */
export const CODING_MODEL_TIERS:
  readonly CodingModelTier[] = [
    {
      modelId: 'kimi_k3',
      family: 'kimi',
      tier: 'premium',
      modelIdEnv: 'KIMI_MODEL_ID',
      requiresVerifiedIdentifier: false,
    },

    {
      modelId: 'kimi_k2_7',
      family: 'kimi',
      tier: 'cost_efficient',
      modelIdEnv:
        'KIMI_COST_EFFICIENT_MODEL_ID',
      requiresVerifiedIdentifier: true,
    },

    {
      modelId: 'glm_5_2',
      family: 'glm',
      tier: 'premium',
      modelIdEnv: 'GLM_MODEL_ID',
      requiresVerifiedIdentifier: false,
    },

    {
      modelId: 'glm_5_3',
      family: 'glm',
      tier: 'premium',
      modelIdEnv: 'GLM_5_3_MODEL_ID',
      requiresVerifiedIdentifier: false,
    },

    {
      modelId: 'glm_5_3_flash',
      family: 'glm',
      tier: 'cost_efficient',
      modelIdEnv:
        'GLM_5_3_FLASH_MODEL_ID',
      requiresVerifiedIdentifier: false,
    },

    {
      modelId: 'deepseek_v4_pro',
      family: 'deepseek',
      tier: 'premium',
      modelIdEnv:
        'DEEPSEEK_PRO_MODEL_ID',
      requiresVerifiedIdentifier: false,
    },

    {
      modelId: 'deepseek_v4_flash',
      family: 'deepseek',
      tier: 'cost_efficient',
      modelIdEnv:
        'DEEPSEEK_FLASH_MODEL_ID',
      requiresVerifiedIdentifier: false,
    },
  ];

const TIER_BY_MODEL = new Map(
  CODING_MODEL_TIERS.map(
    (entry) => [
      entry.modelId,
      entry,
    ],
  ),
);

export function codingTierFor(
  modelId: string,
): CodingModelTier | null {
  return (
    TIER_BY_MODEL.get(modelId) ??
    null
  );
}

export function familyFor(
  modelId: string,
): CodingFamily | null {
  return (
    TIER_BY_MODEL.get(modelId)
      ?.family ??
    null
  );
}

export type ModelAvailability =
  | 'available'
  | 'not_configured'
  | 'unknown_model';

/**
 * Tier-level availability.
 *
 * This only answers whether the model has enough identity
 * information to participate in tier routing.
 *
 * Full runtime readiness is checked later by the canonical
 * model registry, which also verifies credentials, pricing,
 * context and health.
 */
export function modelAvailability(
  modelId: string,
  env: NodeJS.ProcessEnv = process.env,
): ModelAvailability {
  const tier =
    codingTierFor(modelId);

  if (!tier) {
    return 'unknown_model';
  }

  if (
    !tier.requiresVerifiedIdentifier
  ) {
    return 'available';
  }

  return env[
    tier.modelIdEnv
  ]?.trim()
    ? 'available'
    : 'not_configured';
}

export class TransportPolicyError extends Error {
  readonly code =
    'TRANSPORT_POLICY_VIOLATION' as const;

  constructor(message: string) {
    super(message);
    this.name =
      'TransportPolicyError';
  }
}

/**
 * Refuse transport drift.
 *
 * A model becoming visible through another provider's
 * catalog must never automatically grant that transport
 * permission inside Xroga.
 */
export function assertTransportPolicy(
  modelId: string,
  transport: string,
): void {
  const family =
    familyFor(modelId);

  if (!family) {
    throw new TransportPolicyError(
      `"${modelId}" is not in the coding catalog, so it has no permitted transport.`,
    );
  }

  const required =
    FAMILY_TRANSPORT[family];

  if (transport !== required) {
    throw new TransportPolicyError(
      `"${modelId}" is a ${family} model and must use ${required}; ${transport} was requested.`,
    );
  }

  if (
    transport === 'openrouter' &&
    family !==
      OPENROUTER_CODING_FAMILY
  ) {
    throw new TransportPolicyError(
      `OpenRouter carries ${OPENROUTER_CODING_FAMILY} coding models only; "${modelId}" is ${family}.`,
    );
  }
}

export interface ModelEvidence {
  readonly modelId: string;
  readonly role: string;

  /** 0..1 executable validation success rate. */
  readonly validationSuccessRate: number;

  readonly samples: number;

  /** Observed real USD cost per task. */
  readonly costUsdPerTask: number;

  readonly maturity:
    | 'unsupported'
    | 'experimental'
    | 'beta'
    | 'verified'
    | 'degraded';
}

export const MIN_EVIDENCE_SAMPLES =
  5;

export const SUFFICIENT_VALIDATION_RATE =
  0.75;

export interface RoutingChoice {
  readonly modelId: string;

  readonly reason: string;

  /**
   * Ordered alternatives after the selected model.
   */
  readonly escalation:
    readonly string[];

  /**
   * True only when measured evidence actually decided
   * the route.
   */
  readonly measured: boolean;
}

/**
 * Cheapest candidate whose measured evidence is sufficient.
 *
 * Price never promotes an unmeasured model.
 */
export function chooseCostAware(
  input: {
    candidates:
      readonly string[];

    evidence:
      readonly ModelEvidence[];

    role: string;

    env?: NodeJS.ProcessEnv;
  },
): RoutingChoice | null {
  const usable =
    input.candidates.filter(
      (modelId) =>
        isCodingModel(modelId) &&
        codingTierFor(modelId) !==
          null,
    );

  const available =
    usable.filter(
      (modelId) =>
        modelAvailability(
          modelId,
          input.env,
        ) === 'available',
    );

  if (!available.length) {
    return null;
  }

  const evidenceFor = (
    modelId: string,
  ): ModelEvidence | null =>
    input.evidence.find(
      (record) =>
        record.modelId ===
          modelId &&
        record.role ===
          input.role,
    ) ?? null;

  const byCost = [
    ...available,
  ].sort((a, b) => {
    const costA =
      evidenceFor(a)
        ?.costUsdPerTask ??
      Number.POSITIVE_INFINITY;

    const costB =
      evidenceFor(b)
        ?.costUsdPerTask ??
      Number.POSITIVE_INFINITY;

    return costA - costB;
  });

  const sufficient =
    byCost.find(
      (modelId) => {
        const record =
          evidenceFor(modelId);

        if (!record) {
          return false;
        }

        if (
          record.maturity !==
            'verified' &&
          record.maturity !==
            'beta'
        ) {
          return false;
        }

        return (
          record.samples >=
            MIN_EVIDENCE_SAMPLES &&
          record.validationSuccessRate >=
            SUFFICIENT_VALIDATION_RATE
        );
      },
    );

  if (sufficient) {
    const record =
      evidenceFor(
        sufficient,
      )!;

    return {
      modelId: sufficient,

      reason:
        `${sufficient} is the least-expensive candidate with sufficient evidence for ${input.role}: ` +
        `${Math.round(record.validationSuccessRate * 100)}% validation over ${record.samples} samples ` +
        `(${record.maturity}), $${record.costUsdPerTask.toFixed(4)} per task.`,

      escalation:
        byCost.filter(
          (modelId) =>
            modelId !==
            sufficient,
        ),

      measured: true,
    };
  }

  /**
   * Nothing has earned the lead on cost.
   *
   * Prefer a premium route and explicitly mark the
   * decision as prior-based.
   */
  const premium =
    byCost.find(
      (modelId) =>
        codingTierFor(
          modelId,
        )?.tier ===
        'premium',
    ) ??
    byCost[0]!;

  return {
    modelId: premium,

    reason:
      `No cost-efficient candidate has sufficient measured evidence for ${input.role}, so the ` +
      `premium tier leads. ${premium} selected on prior, not on measurement.`,

    escalation:
      byCost.filter(
        (modelId) =>
          modelId !== premium,
      ),

    measured: false,
  };
}
