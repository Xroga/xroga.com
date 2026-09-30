import {
  getSupabaseAdmin,
} from '../config/supabase.js';

import {
  isLearningEnabled,
} from './learningPolicy.js';

export const BUILD_STRATEGY_MEMORY_SCHEMA_VERSION =
  '1.0.0' as const;

export const MIN_STRATEGY_SAMPLE_SIZE =
  20;

export const MAX_STRATEGY_ROWS =
  120;

export const MAX_STRATEGY_AGE_MS =
  90 * 24 * 60 * 60 * 1000;

export const MIN_STRATEGY_WILSON_LOWER =
  0.55;

export const MIN_STRATEGY_CONFIDENCE_ADVANTAGE =
  0.08;

export type LearnedValidationPhase =
  | 'install'
  | 'lint'
  | 'typecheck'
  | 'test'
  | 'build'
  | 'package';

export interface StoredBuildStrategyRow {
  readonly success: boolean;
  readonly verified: boolean | null;
  readonly learning_eligible: boolean | null;
  readonly taxonomy_id: string | null;
  readonly product_surface: string | null;
  readonly product_subtype: string | null;
  readonly recipe_id: string | null;
  readonly golden_example_ids: unknown;
  readonly failure_domain: string | null;
  readonly failure_stage: string | null;
  readonly updated_at: string | null;
}

export interface BuildStrategyObservation {
  readonly taxonomyId: string | null;
  readonly surface: string | null;
  readonly subtype: string | null;
  readonly recipeId: string | null;
  readonly goldenExampleIds: readonly string[];
  readonly failureDomain: string | null;
  readonly failureStage: string | null;
  readonly success: boolean;
  readonly verified: boolean;
  readonly learningEligible: boolean;
  readonly observedAt: string;
}

export interface BuildStrategyMemory {
  readonly schemaVersion:
    typeof BUILD_STRATEGY_MEMORY_SCHEMA_VERSION;
  readonly source: 'measured' | 'unavailable';
  readonly observationCount: number;
  readonly observations:
    readonly BuildStrategyObservation[];
}

export interface BuildStrategyContext {
  readonly taxonomyId?: string | null;
  readonly surface?: string | null;
  readonly subtype?: string | null;
}

export interface BuildStrategyDecision {
  readonly candidates: readonly string[];
  readonly applied: boolean;
  readonly reason: string;
  readonly preferredId: string | null;
  readonly sampleSize: number;
  readonly confidence: number | null;
}

export interface BuildStrategyRowSource {
  load(
    userId: string,
  ): Promise<
    readonly StoredBuildStrategyRow[]
  >;
}

function safeIdentifier(
  value: unknown,
  maximum = 100,
): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized =
    value
      .trim()
      .replace(
        /[^A-Za-z0-9._:/-]+/g,
        '_',
      )
      .replace(
        /^_+|_+$/g,
        '',
      )
      .slice(
        0,
        maximum,
      );

  return normalized || null;
}

function safeIdList(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value
        .map((item) =>
          safeIdentifier(item),
        )
        .filter(
          (
            item,
          ): item is string =>
            Boolean(item),
        )
        .slice(0, 12),
    ),
  ];
}

function freshTimestamp(
  value: string | null,
  now: number,
): value is string {
  if (!value) {
    return false;
  }

  const timestamp =
    Date.parse(value);

  return (
    Number.isFinite(timestamp) &&
    timestamp <= now + 5 * 60 * 1000 &&
    now - timestamp <= MAX_STRATEGY_AGE_MS
  );
}

function unavailable():
  BuildStrategyMemory {
  return {
    schemaVersion:
      BUILD_STRATEGY_MEMORY_SCHEMA_VERSION,
    source:
      'unavailable',
    observationCount:
      0,
    observations:
      [],
  };
}

export function summarizeBuildStrategyRows(
  rows:
    readonly StoredBuildStrategyRow[],
  now = Date.now(),
): BuildStrategyMemory {
  const observations =
    rows
      .slice(0, MAX_STRATEGY_ROWS)
      .flatMap((row) => {
        if (
          !freshTimestamp(
            row.updated_at,
            now,
          )
        ) {
          return [];
        }

        return [
          {
            taxonomyId:
              safeIdentifier(
                row.taxonomy_id,
              ),
            surface:
              safeIdentifier(
                row.product_surface,
              ),
            subtype:
              safeIdentifier(
                row.product_subtype,
              ),
            recipeId:
              safeIdentifier(
                row.recipe_id,
              ),
            goldenExampleIds:
              safeIdList(
                row.golden_example_ids,
              ),
            failureDomain:
              safeIdentifier(
                row.failure_domain,
              ),
            failureStage:
              safeIdentifier(
                row.failure_stage,
              ),
            success:
              row.success === true,
            verified:
              row.verified === true,
            learningEligible:
              row.learning_eligible === true,
            observedAt:
              row.updated_at,
          } satisfies
            BuildStrategyObservation,
        ];
      });

  return {
    schemaVersion:
      BUILD_STRATEGY_MEMORY_SCHEMA_VERSION,
    source:
      'measured',
    observationCount:
      observations.length,
    observations,
  };
}

class SupabaseBuildStrategyRowSource
implements BuildStrategyRowSource {
  async load(
    userId: string,
  ): Promise<
    readonly StoredBuildStrategyRow[]
  > {
    const cutoff =
      new Date(
        Date.now() -
        MAX_STRATEGY_AGE_MS,
      ).toISOString();

    const {
      data,
      error,
    } =
      await getSupabaseAdmin()
        .from('build_outcomes')
        .select(
          'success,verified,learning_eligible,taxonomy_id,product_surface,product_subtype,recipe_id,golden_example_ids,failure_domain,failure_stage,updated_at',
        )
        .eq(
          'user_id',
          userId,
        )
        .gte(
          'updated_at',
          cutoff,
        )
        .order(
          'updated_at',
          {
            ascending: false,
          },
        )
        .limit(
          MAX_STRATEGY_ROWS,
        );

    if (error) {
      throw error;
    }

    return (
      data ?? []
    ) as
      StoredBuildStrategyRow[];
  }
}

export async function loadBuildStrategyMemory(
  userId: string,
  source?:
    BuildStrategyRowSource,
): Promise<
  BuildStrategyMemory
> {
  if (!isLearningEnabled()) {
    return unavailable();
  }

  const target =
    source ??
    (
      process.env
        .SUPABASE_SERVICE_ROLE_KEY
        ? new SupabaseBuildStrategyRowSource()
        : null
    );

  if (!target) {
    return unavailable();
  }

  try {
    return summarizeBuildStrategyRows(
      await target.load(userId),
    );
  } catch {
    console.warn(
      '[learning_store_unavailable]',
      JSON.stringify({
        component:
          'build_strategy_memory',
      }),
    );

    return unavailable();
  }
}

function comparable(
  observation:
    BuildStrategyObservation,
  context:
    BuildStrategyContext,
): boolean {
  const taxonomyId =
    safeIdentifier(
      context.taxonomyId,
    );

  if (
    taxonomyId &&
    observation.taxonomyId !==
      taxonomyId
  ) {
    return false;
  }

  const surface =
    safeIdentifier(
      context.surface,
    );

  if (
    surface &&
    observation.surface !==
      surface
  ) {
    return false;
  }

  const subtype =
    safeIdentifier(
      context.subtype,
    );

  if (
    subtype &&
    observation.subtype !==
      subtype
  ) {
    return false;
  }

  return true;
}

function wilsonLower(
  successes: number,
  total: number,
): number {
  if (total <= 0) {
    return 0;
  }

  const z = 1.96;
  const proportion =
    successes / total;
  const denominator =
    1 + z * z / total;
  const centre =
    proportion +
    z * z / (2 * total);
  const margin =
    z *
    Math.sqrt(
      (
        proportion *
          (1 - proportion) +
        z * z / (4 * total)
      ) /
      total,
    );

  return Math.max(
    0,
    (
      centre -
      margin
    ) /
    denominator,
  );
}

function unique(
  values:
    readonly string[],
): string[] {
  return [
    ...new Set(
      values.filter(Boolean),
    ),
  ];
}

function candidateEvidence(
  candidate: string,
  context:
    BuildStrategyContext,
  memory:
    BuildStrategyMemory,
  ownsCandidate:
    (
      observation:
        BuildStrategyObservation,
      candidate: string,
    ) => boolean,
): {
  readonly sampleSize: number;
  readonly successes: number;
  readonly confidence: number;
} {
  const rows =
    memory.observations.filter(
      (observation) =>
        observation.learningEligible &&
        comparable(
          observation,
          context,
        ) &&
        ownsCandidate(
          observation,
          candidate,
        ),
    );

  const successes =
    rows.filter(
      (observation) =>
        observation.success &&
        observation.verified,
    ).length;

  return {
    sampleSize:
      rows.length,
    successes,
    confidence:
      wilsonLower(
        successes,
        rows.length,
      ),
  };
}

function preferCandidateIds(
  candidates:
    readonly string[],
  context:
    BuildStrategyContext,
  memory:
    BuildStrategyMemory | undefined,
  ownsCandidate:
    (
      observation:
        BuildStrategyObservation,
      candidate: string,
    ) => boolean,
): BuildStrategyDecision {
  const original =
    unique(candidates);

  if (
    !isLearningEnabled() ||
    original.length <= 1 ||
    !memory ||
    memory.source !== 'measured'
  ) {
    return {
      candidates:
        original,
      applied:
        false,
      reason:
        !isLearningEnabled()
          ? 'learning disabled'
          : 'no measured strategy evidence',
      preferredId:
        null,
      sampleSize:
        0,
      confidence:
        null,
    };
  }

  const stats =
    original.map(
      (candidate) => ({
        candidate,
        ...candidateEvidence(
          candidate,
          context,
          memory,
          ownsCandidate,
        ),
      }),
    );

  const eligible =
    stats
      .filter(
        (stat) =>
          stat.sampleSize >=
            MIN_STRATEGY_SAMPLE_SIZE &&
          stat.confidence >=
            MIN_STRATEGY_WILSON_LOWER,
      )
      .sort(
        (left, right) =>
          right.confidence -
            left.confidence ||
          right.sampleSize -
            left.sampleSize ||
          original.indexOf(
            left.candidate,
          ) -
            original.indexOf(
              right.candidate,
            ),
      );

  const preferred =
    eligible[0] ?? null;

  if (
    !preferred ||
    preferred.candidate ===
      original[0]
  ) {
    return {
      candidates:
        original,
      applied:
        false,
      reason:
        'strategy evidence did not clear the conservative preference threshold',
      preferredId:
        null,
      sampleSize:
        preferred?.sampleSize ?? 0,
      confidence:
        preferred?.confidence ?? null,
    };
  }

  const baseline =
    stats.find(
      (stat) =>
        stat.candidate ===
        original[0],
    );

  const baselineConfidence =
    baseline &&
    baseline.sampleSize >=
      MIN_STRATEGY_SAMPLE_SIZE
      ? baseline.confidence
      : 0;

  if (
    preferred.confidence -
      baselineConfidence <
    MIN_STRATEGY_CONFIDENCE_ADVANTAGE
  ) {
    return {
      candidates:
        original,
      applied:
        false,
      reason:
        'strategy evidence advantage is below the bounded confidence threshold',
      preferredId:
        null,
      sampleSize:
        preferred.sampleSize,
      confidence:
        preferred.confidence,
    };
  }

  return {
    candidates: [
      preferred.candidate,
      ...original.filter(
        (candidate) =>
          candidate !==
          preferred.candidate,
      ),
    ],
    applied:
      true,
    reason:
      'high-confidence verified outcome memory reordered already-valid strategy candidates',
    preferredId:
      preferred.candidate,
    sampleSize:
      preferred.sampleSize,
    confidence:
      preferred.confidence,
  };
}

export function preferRecipeIds(
  candidates:
    readonly string[],
  context:
    BuildStrategyContext,
  memory?:
    BuildStrategyMemory,
): BuildStrategyDecision {
  return preferCandidateIds(
    candidates,
    context,
    memory,
    (
      observation,
      candidate,
    ) =>
      observation.recipeId ===
      candidate,
  );
}

export function preferGoldenExampleIds(
  candidates:
    readonly string[],
  context:
    BuildStrategyContext,
  memory?:
    BuildStrategyMemory,
): BuildStrategyDecision {
  return preferCandidateIds(
    candidates,
    context,
    memory,
    (
      observation,
      candidate,
    ) =>
      observation
        .goldenExampleIds
        .includes(candidate),
  );
}

const FAILURE_STAGE_TO_PHASES:
  Readonly<
    Record<
      string,
      readonly LearnedValidationPhase[]
    >
  > = {
  dependency: [
    'install',
  ],
  compile: [
    'typecheck',
    'build',
  ],
  test: [
    'test',
  ],
  verification: [
    'typecheck',
    'test',
    'build',
  ],
};

export function prioritizeValidationPhases(
  phases:
    readonly LearnedValidationPhase[],
  context:
    BuildStrategyContext,
  memory?:
    BuildStrategyMemory,
): readonly LearnedValidationPhase[] {
  const original =
    unique(phases) as
      LearnedValidationPhase[];

  if (
    !isLearningEnabled() ||
    !memory ||
    memory.source !== 'measured'
  ) {
    return original;
  }

  const comparableRows =
    memory.observations.filter(
      (observation) =>
        observation.learningEligible &&
        comparable(
          observation,
          context,
        ),
    );

  if (
    comparableRows.length <
    MIN_STRATEGY_SAMPLE_SIZE
  ) {
    return original;
  }

  const counts =
    new Map<
      LearnedValidationPhase,
      number
    >();

  for (
    const observation of
    comparableRows
  ) {
    if (
      observation.failureDomain !==
        'project' ||
      !observation.failureStage
    ) {
      continue;
    }

    for (
      const phase of
      FAILURE_STAGE_TO_PHASES[
        observation.failureStage
      ] ?? []
    ) {
      counts.set(
        phase,
        (
          counts.get(phase) ??
          0
        ) + 1,
      );
    }
  }

  return [
    ...original,
  ].sort(
    (left, right) =>
      (
        counts.get(right) ??
        0
      ) -
        (
          counts.get(left) ??
          0
        ) ||
      original.indexOf(left) -
        original.indexOf(right),
  );
}
