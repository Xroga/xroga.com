import { z } from 'zod';

export const SEMANTIC_INTENTS = [
  'ANSWER',
  'INVESTIGATE',
  'PROPOSE',
  'MODIFY',
  'EXTERNAL_ACTION',
  'MIXED',
] as const;

export type SemanticIntent =
  (typeof SEMANTIC_INTENTS)[number];

export const FRESHNESS_REQUIREMENTS = [
  'NONE',
  'PREFERRED',
  'CURRENT_REQUIRED',
] as const;

export type FreshnessRequirement =
  (typeof FRESHNESS_REQUIREMENTS)[number];

const sourcePolicySchema =
  z.object({
    mode: z
      .enum([
        'any',
        'official_only',
      ])
      .default('any'),

    scope: z
      .enum([
        'public_web',
        'x',
      ])
      .default('public_web'),

    officialDomains: z
      .array(
        z
          .string()
          .trim()
          .min(3),
      )
      .default([]),
  })
    .strict();

const projectContextSchema =
  z.object({
    repo: z
      .string()
      .trim()
      .min(3),

    branch: z
      .string()
      .trim()
      .min(1),

    projectRoot: z
      .string()
      .trim()
      .startsWith('/')
      .default('/'),
  })
    .strict();

const deliverableSchema =
  z.object({
    id: z
      .string()
      .trim()
      .min(1),

    mediaType: z
      .string()
      .trim()
      .regex(
        /^[\w.+-]+\/[\w.+-]+$/,
      ),

    description: z
      .string()
      .trim()
      .min(1),

    required: z
      .boolean()
      .default(true),

    acceptance: z
      .array(
        z
          .string()
          .trim()
          .min(1),
      )
      .default([]),
  })
    .strict();

export const goalContractSchema =
  z.object({
    version:
      z.literal('1.0'),

    goal: z
      .string()
      .trim()
      .min(1),

    desiredOutcome: z
      .string()
      .trim()
      .min(1),

    semanticIntent:
      z.enum(
        SEMANTIC_INTENTS,
      ),

    constraints: z
      .array(
        z
          .string()
          .trim()
          .min(1),
      )
      .default([]),

    acceptance: z
      .array(
        z
          .string()
          .trim()
          .min(1),
      )
      .default([]),

    historyContext:
      z
        .array(
          z.string(),
        )
        .default([]),

    projectContext:
      projectContextSchema
        .nullable()
        .default(null),

    deliverables:
      z
        .array(
          deliverableSchema,
        )
        .default([]),

    requiredCapabilities:
      z
        .array(
          z
            .string()
            .trim()
            .min(3),
        )
        .default([]),

    requiredAuthorities:
      z
        .array(
          z
            .string()
            .trim()
            .min(3),
        )
        .default([]),

    freshnessRequirement:
      z
        .enum(
          FRESHNESS_REQUIREMENTS,
        )
        .default('NONE'),

    sourcePolicy:
      sourcePolicySchema.default({
        mode: 'any',
        scope:
          'public_web',
        officialDomains: [],
      }),

    previewRequirement:
  z
    .enum([
      'NONE',
      'PREFERRED',
      'REQUIRED',
    ])
    .default('NONE'),

publicationRequirement:
  z
    .enum([
      'NONE',
      'REQUESTED',
    ])
    .default('NONE'),

deploymentRequirement:
      z
        .enum([
          'NONE',
          'REQUESTED',
        ])
        .default('NONE'),

    risks:
      z
        .array(
          z.string(),
        )
        .default([]),

    confidence:
      z
        .number()
        .min(0)
        .max(1),

    blockers:
      z
        .array(
          z.string(),
        )
        .default([]),

    contextComplexity:
      z
        .enum([
          'low',
          'medium',
          'high',
          'unknown',
        ])
        .default(
          'unknown',
        ),
  })
    .strict();

export type GoalContract =
  z.infer<
    typeof goalContractSchema
  >;

export type ProjectContext =
  z.infer<
    typeof projectContextSchema
  >;

export interface GoalInterpretationInput {
  readonly message:
    string;

  readonly history:
    readonly string[];

  readonly projectContext:
    ProjectContext | null;

  readonly attachments:
    readonly {
      mediaType: string;
      name?: string;
    }[];

  readonly projectState?:
    Readonly<
      Record<
        string,
        unknown
      >
    >;
}

const GOAL_KEYS =
  new Set([
    'version',
    'goal',
    'desiredOutcome',
    'semanticIntent',
    'constraints',
    'acceptance',
    'historyContext',
    'projectContext',
    'deliverables',
    'requiredCapabilities',
    'requiredAuthorities',
    'freshnessRequirement',
    'sourcePolicy',
    'previewRequirement',
    'publicationRequirement',
    'deploymentRequirement',
    'risks',
    'confidence',
    'blockers',
    'contextComplexity',
  ]);

/**
 * Capability readiness, authorization,
 * provider availability and support state
 * are server-owned facts.
 *
 * The semantic model may identify which
 * capability it needs, but it must never
 * be allowed to invent those runtime
 * states.
 *
 * The live capability registry resolves
 * them deterministically after planning.
 */
function isServerOwnedReadinessBlocker(
  value: string,
): boolean {
  const normalized =
    value.trim();

  if (
    /\b(?:AUTH_REQUIRED|PROVIDER_UNAVAILABLE|TEMPORARILY_UNAVAILABLE|UNSUPPORTED)\b/i.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /\b(?:authorization|authentication)\s+(?:is\s+)?required\b/i.test(
      normalized,
    )
  ) {
    return true;
  }

  if (
    /\brequires?\s+(?:user\s+)?(?:authorization|authentication)\b/i.test(
      normalized,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Safely removes model commentary fields
 * without weakening the strict canonical
 * schema.
 *
 * Values are not invented or coerced;
 * malformed semantics still fail
 * validation.
 */
export function normalizeGoalContractCandidate(
  value: unknown,
): unknown {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(value)
  ) {
    return value;
  }

  const input =
    value as Record<
      string,
      unknown
    >;

  const normalized =
    Object.fromEntries(
      Object.entries(
        input,
      )
        .filter(
          ([key]) =>
            GOAL_KEYS.has(
              key,
            ),
        ),
    ) as Record<
      string,
      unknown
    >;

  if (
    input.projectContext &&
    typeof input
      .projectContext ===
      'object' &&
    !Array.isArray(
      input.projectContext,
    )
  ) {
    const project =
      input.projectContext as
        Record<
          string,
          unknown
        >;

    normalized.projectContext =
      {
        repo:
          project.repo,

        branch:
          project.branch,

        projectRoot:
          project
            .projectRoot ??
          '/',
      };
  }

  if (
    Array.isArray(
      input.deliverables,
    )
  ) {
    normalized.deliverables =
      input.deliverables.map(
        (item) => {
          if (
            !item ||
            typeof item !==
              'object' ||
            Array.isArray(
              item,
            )
          ) {
            return item;
          }

          const deliverable =
            item as Record<
              string,
              unknown
            >;

          return {
            id:
              deliverable.id,

            mediaType:
              deliverable
                .mediaType,

            description:
              deliverable
                .description,

            required:
              deliverable
                .required ??
              true,

            acceptance:
              deliverable
                .acceptance ??
              [],
          };
        },
      );
  }

  if (
    input.sourcePolicy &&
    typeof input
      .sourcePolicy ===
      'object' &&
    !Array.isArray(
      input.sourcePolicy,
    )
  ) {
    const policy =
      input.sourcePolicy as
        Record<
          string,
          unknown
        >;

    normalized.sourcePolicy =
      {
        mode:
          policy.mode ??
          'any',

        scope:
          policy.scope ??
          'public_web',

        officialDomains:
          policy
            .officialDomains ??
          [],
      };
  }

  return normalized;
}

/**
 * Expands the deliberately small
 * provider-facing semantic decision into
 * the canonical contract.
 *
 * Project identity, conversation history,
 * authorities and capability readiness
 * are server-owned.
 *
 * A planner response can neither replace
 * nor grant them.
 */
export function normalizePlannerDecisionCandidate(
  value: unknown,
  input:
    GoalInterpretationInput,
): unknown {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(value)
  ) {
    return value;
  }

  const decision =
    value as Record<
      string,
      unknown
    >;

  const strings = (
    candidate: unknown,
  ): string[] =>
    Array.isArray(
      candidate,
    )
      ? candidate
          .filter(
            (
              item,
            ): item is string =>
              typeof item ===
              'string',
          )
          .map(
            (item) =>
              item.trim(),
          )
          .filter(
            Boolean,
          )
      : [];

  const enumValue = (
    candidate: unknown,
  ):
    | string
    | undefined =>
    typeof candidate ===
    'string'
      ? candidate
          .trim()
          .toUpperCase()
      : undefined;

  const freshnessRequirement =
    enumValue(
      decision
        .freshnessRequirement,
    );

  const suppliedSource =
    decision.sourcePolicy &&
    typeof decision
      .sourcePolicy ===
      'object' &&
    !Array.isArray(
      decision.sourcePolicy,
    )
      ? decision.sourcePolicy as
          Record<
            string,
            unknown
          >
      : {};

  /*
   * The model may identify genuine missing
   * user input, but runtime authorization,
   * capability availability and provider
   * readiness are resolved later by the
   * server.
   *
   * This prevents a hallucinated
   * AUTH_REQUIRED blocker from stopping a
   * valid connected Gmail/Slack/etc read.
   */
  const modelBlockers =
    strings(
      decision.blockers,
    )
      .filter(
        (blocker) =>
          !isServerOwnedReadinessBlocker(
            blocker,
          ),
      );

  return {
    version: '1.0',

    goal:
      typeof decision.goal ===
        'string' &&
      decision.goal.trim()
        ? decision.goal
        : input.message,

    desiredOutcome:
      typeof decision
        .desiredOutcome ===
        'string' &&
      decision
        .desiredOutcome
        .trim()
        ? decision
            .desiredOutcome
        : input.message,

    semanticIntent:
      enumValue(
        decision
          .semanticIntent,
      ),

    constraints:
      strings(
        decision
          .constraints,
      ),

    acceptance:
      strings(
        decision
          .acceptance,
      ),

    historyContext:
      input.history.slice(
        -12,
      ),

    projectContext:
      input.projectContext,

    deliverables: [],

    requiredCapabilities:
      strings(
        decision
          .requiredCapabilities,
      ),

    /*
     * Authorities are always calculated
     * by the server from the authenticated
     * request and capability registry.
     */
    requiredAuthorities:
      [],

    /*
     * Missing freshness is intentionally
     * invalid. Defaulting it to NONE could
     * turn a freshness-sensitive request
     * into a stale model-memory answer.
     */
    freshnessRequirement:
      freshnessRequirement ??
      '__MISSING__',

    sourcePolicy: {
      mode:
        suppliedSource.mode ===
        'official_only'
          ? 'official_only'
          : 'any',

      scope:
        suppliedSource.scope ===
        'x'
          ? 'x'
          : 'public_web',

      officialDomains:
        strings(
          suppliedSource
            .officialDomains,
        ),
    },

    previewRequirement:
  enumValue(
    decision
      .previewRequirement,
  ) ??
  'NONE',

publicationRequirement:
  enumValue(
    decision
      .publicationRequirement,
  ) ??
  'NONE',

deploymentRequirement:
      enumValue(
        decision
          .deploymentRequirement,
      ) ??
      'NONE',

    risks:
      strings(
        decision.risks,
      ),

    confidence:
      typeof decision
        .confidence ===
        'number'
        ? decision
            .confidence
        : 0.5,

    blockers:
      modelBlockers,

    contextComplexity:
      typeof decision
        .contextComplexity ===
        'string'
        ? decision
            .contextComplexity
            .trim()
            .toLowerCase()
        : 'unknown',
  };
}

/**
 * Semantic interpretation is injected so
 * this layer has no prompt keyword
 * taxonomy.
 */
export async function interpretGoalContract(
  input:
    GoalInterpretationInput,

  interpret: (
    input:
      GoalInterpretationInput,
  ) => Promise<unknown>,
): Promise<GoalContract> {
  if (
    !input.message.trim()
  ) {
    throw new Error(
      'A goal cannot be inferred from an empty message.',
    );
  }

  const parsed =
    goalContractSchema
      .safeParse(
        normalizeGoalContractCandidate(
          await interpret(
            input,
          ),
        ),
      );

  if (!parsed.success) {
    throw new Error(
      `Goal interpretation returned an invalid contract: ${parsed.error.issues
        .map(
          (issue) =>
            issue.message,
        )
        .join('; ')}`,
    );
  }

  return parsed.data;
}
