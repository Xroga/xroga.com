import {
  getSupabaseAdmin,
} from '../config/supabase.js';

import type {
  BuildFailureCategory,
} from './buildOutcomeMemory.js';

import {
  isLearningEnabled,
} from './learningPolicy.js';

export const BUILD_IMPROVEMENT_MEMORY_SCHEMA_VERSION =
  '1.0.0' as const;

export const MIN_IMPROVEMENT_SAMPLE_SIZE =
  6;

export const MAX_IMPROVEMENT_ROWS =
  48;

export const MAX_IMPROVEMENT_AGE_MS =
  45 *
  24 *
  60 *
  60 *
  1000;

export const MIN_PREFERRED_WILSON_LOWER =
  0.55;

export const MAX_DEPRIORITIZED_WILSON_UPPER =
  0.45;

export const MIN_CONFIDENCE_ADVANTAGE =
  0.08;

const IMPLEMENTATION_FAILURE_CATEGORIES =
  new Set<BuildFailureCategory>([
    'verification',
    'compile',
    'test',
    'preview',
  ]);

const KNOWN_FAILURE_CATEGORIES:
  readonly BuildFailureCategory[] = [
    'none',
    'user_cancelled',
    'interrupted',
    'capacity',
    'provider',
    'verification',
    'compile',
    'test',
    'preview',
    'publication',
    'deployment',
    'policy',
    'platform',
    'dependency',
    'runtime',
    'architecture',
    'integration',
    'user_configuration',
    'unknown',
  ];

export interface StoredBuildImprovementRow {
  readonly success:
    boolean;

  readonly failure_category:
    string;

  readonly feature_category?:
    string | null;

  readonly model_telemetry:
    unknown;

  readonly updated_at:
    string | null;
}

export interface BuildImprovementObservation {
  readonly featureCategory:
    string | null;

  readonly failureCategory:
    BuildFailureCategory;

  readonly modelId:
    string;

  readonly taskClass:
    string;

  readonly framework:
    string | null;

  readonly requiredCapabilities:
    readonly string[];

  readonly repairLoops:
    number;

  readonly finalVerificationOk:
    boolean | null;

  readonly success:
    boolean;

  readonly observedAt:
    string;
}

export interface BuildImprovementMemory {
  readonly schemaVersion:
    typeof BUILD_IMPROVEMENT_MEMORY_SCHEMA_VERSION;

  readonly source:
    | 'measured'
    | 'unavailable';

  readonly observationCount:
    number;

  readonly observations:
    readonly BuildImprovementObservation[];
}

export interface BuildImprovementContext {
  readonly taskClass:
    string;

  readonly framework?:
    string | null;

  readonly featureCategory?:
    string | null;

  readonly requiredCapabilities?:
    readonly string[];
}

export interface BuildImprovementDecision {
  readonly candidates:
    readonly string[];

  readonly applied:
    boolean;

  readonly reason:
    string;

  readonly preferredModel:
    string | null;

  readonly preferredSampleSize:
    number;

  readonly preferredConfidence:
    number | null;

  readonly deprioritizedModels:
    readonly string[];
}

export interface BuildImprovementRowSource {
  load(
    userId:
      string,
  ): Promise<
    readonly StoredBuildImprovementRow[]
  >;
}

function knownFailureCategory(
  value:
    unknown,
): BuildFailureCategory {
  return (
    typeof value ===
      'string' &&
    KNOWN_FAILURE_CATEGORIES
      .includes(
        value as
          BuildFailureCategory,
      )
  )
    ? value as
        BuildFailureCategory
    : 'unknown';
}

function safeIdentifier(
  value:
    unknown,

  maximum =
    100,
): string | null {
  if (
    typeof value !==
      'string'
  ) {
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

  return (
    normalized ||
    null
  );
}

function nonNegativeInteger(
  value:
    unknown,
): number {
  return (
    typeof value ===
      'number' &&
    Number.isFinite(
      value,
    )
  )
    ? Math.max(
        0,
        Math.round(
          value,
        ),
      )
    : 0;
}

function nullableBoolean(
  value:
    unknown,
): boolean | null {
  return typeof value ===
    'boolean'
    ? value
    : null;
}

function isFreshTimestamp(
  value:
    string | null,

  now:
    number,
): value is string {
  if (
    !value
  ) {
    return false;
  }

  const timestamp =
    Date.parse(
      value,
    );

  if (
    !Number.isFinite(
      timestamp,
    )
  ) {
    return false;
  }

  return (
    timestamp <=
      now +
        5 *
        60 *
        1000 &&
    now -
      timestamp <=
      MAX_IMPROVEMENT_AGE_MS
  );
}

function sanitizeTelemetry(
  row:
    StoredBuildImprovementRow,

  now:
    number,
): BuildImprovementObservation[] {
  if (
    !isFreshTimestamp(
      row.updated_at,
      now,
    ) ||
    !Array.isArray(
      row.model_telemetry,
    )
  ) {
    return [];
  }

  const failureCategory =
    knownFailureCategory(
      row.failure_category,
    );

  const featureCategory =
    safeIdentifier(
      row.feature_category,
    );

  const observations:
    BuildImprovementObservation[] = [];

  for (
    const item of
    row.model_telemetry
  ) {
    if (
      !item ||
      typeof item !==
        'object' ||
      Array.isArray(
        item,
      )
    ) {
      continue;
    }

    const telemetry =
      item as
        Record<
          string,
          unknown
        >;

    const modelId =
      safeIdentifier(
        telemetry.modelId,
      );

    const taskClass =
      safeIdentifier(
        telemetry.taskClass,
      );

    if (
      !modelId ||
      !taskClass
    ) {
      continue;
    }

    const framework =
      safeIdentifier(
        telemetry.framework,
      );

    const requiredCapabilities =
      Array.isArray(
        telemetry.requiredCapabilities,
      )
        ? telemetry
            .requiredCapabilities
            .map(
              (
                capability,
              ) =>
                safeIdentifier(
                  capability,
                ),
            )
            .filter(
              (
                capability,
              ): capability is string =>
                Boolean(
                  capability,
                ),
            )
            .slice(
              0,
              32,
            )
        : [];

    observations.push({
      featureCategory,

      failureCategory,

      modelId,

      taskClass,

      framework,

      requiredCapabilities,

      repairLoops:
        nonNegativeInteger(
          telemetry.repairLoops,
        ),

      finalVerificationOk:
        nullableBoolean(
          telemetry.finalVerificationOk,
        ),

      success:
        row.success ===
        true,

      observedAt:
        row.updated_at,
    });
  }

  return observations;
}

function unavailable():
  BuildImprovementMemory {
  return {
    schemaVersion:
      BUILD_IMPROVEMENT_MEMORY_SCHEMA_VERSION,

    source:
      'unavailable',

    observationCount:
      0,

    observations:
      [],
  };
}

export function summarizeBuildImprovementRows(
  rows:
    readonly StoredBuildImprovementRow[],

  now =
    Date.now(),
): BuildImprovementMemory {
  const observations =
    rows
      .slice(
        0,
        MAX_IMPROVEMENT_ROWS,
      )
      .flatMap(
        (
          row,
        ) =>
          sanitizeTelemetry(
            row,
            now,
          ),
      );

  return {
    schemaVersion:
      BUILD_IMPROVEMENT_MEMORY_SCHEMA_VERSION,

    source:
      'measured',

    observationCount:
      observations.length,

    observations,
  };
}

class SupabaseBuildImprovementRowSource
implements BuildImprovementRowSource {
  async load(
    userId:
      string,
  ): Promise<
    readonly StoredBuildImprovementRow[]
  > {
    const cutoff =
      new Date(
        Date.now() -
        MAX_IMPROVEMENT_AGE_MS,
      )
        .toISOString();

    const {
      data,
      error,
    } =
      await getSupabaseAdmin()
        .from(
          'build_outcomes',
        )
        .select(
          'success,failure_category,feature_category,model_telemetry,updated_at',
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
            ascending:
              false,
          },
        )
        .limit(
          MAX_IMPROVEMENT_ROWS,
        );

    if (
      error
    ) {
      throw error;
    }

    return (
      data ??
      []
    ) as
      StoredBuildImprovementRow[];
  }
}

export async function loadBuildImprovementMemory(
  userId:
    string,

  source?:
    BuildImprovementRowSource,
): Promise<
  BuildImprovementMemory
> {
  if (
    !isLearningEnabled()
  ) {
    return unavailable();
  }

  const target =
    source ??
    (
      process.env
        .SUPABASE_SERVICE_ROLE_KEY
        ? new SupabaseBuildImprovementRowSource()
        : null
    );

  if (
    !target
  ) {
    return unavailable();
  }

  try {
    return summarizeBuildImprovementRows(
      await target.load(
        userId,
      ),
    );
  } catch {
    console.warn(
      '[buildImprovementMemory] load skipped',
    );

    return unavailable();
  }
}

function normalizedContextIdentifier(
  value:
    string | null | undefined,
): string | null {
  return safeIdentifier(
    value,
  );
}

function isComparable(
  observation:
    BuildImprovementObservation,

  context:
    BuildImprovementContext,
): boolean {
  const taskClass =
    normalizedContextIdentifier(
      context.taskClass,
    );

  if (
    !taskClass ||
    observation.taskClass !==
      taskClass
  ) {
    return false;
  }

  const framework =
    normalizedContextIdentifier(
      context.framework,
    );

  if (
    framework &&
    observation.framework !==
      framework
  ) {
    return false;
  }

  const featureCategory =
    normalizedContextIdentifier(
      context.featureCategory,
    );

  if (
    featureCategory &&
    observation.featureCategory !==
      featureCategory
  ) {
    return false;
  }

  const required =
    new Set(
      (
        context
          .requiredCapabilities ??
        []
      )
        .map(
          (
            capability,
          ) =>
            safeIdentifier(
              capability,
            ),
        )
        .filter(
          (
            capability,
          ): capability is string =>
            Boolean(
              capability,
            ),
        ),
    );

  if (
    required.size > 0 &&
    observation
      .requiredCapabilities
      .length > 0 &&
    !observation
      .requiredCapabilities
      .some(
        (
          capability,
        ) =>
          required.has(
            capability,
          ),
      )
  ) {
    return false;
  }

  return true;
}

function isPositiveEvidence(
  observation:
    BuildImprovementObservation,
): boolean {
  return (
    observation.success &&
    observation.failureCategory ===
      'none' &&
    observation.finalVerificationOk ===
      true
  );
}

function isNegativeImplementationEvidence(
  observation:
    BuildImprovementObservation,
): boolean {
  return (
    !observation.success &&
    IMPLEMENTATION_FAILURE_CATEGORIES
      .has(
        observation.failureCategory,
      )
  );
}

function wilsonInterval(
  successes:
    number,

  total:
    number,
): {
  readonly lower:
    number;

  readonly upper:
    number;
} {
  if (
    total <=
    0
  ) {
    return {
      lower:
        0,

      upper:
        1,
    };
  }

  const z =
    1.96;

  const proportion =
    successes /
    total;

  const denominator =
    1 +
    z *
      z /
      total;

  const centre =
    proportion +
    z *
      z /
      (
        2 *
        total
      );

  const margin =
    z *
    Math.sqrt(
      (
        proportion *
          (
            1 -
            proportion
          ) +
        z *
          z /
          (
            4 *
            total
          )
      ) /
      total,
    );

  return {
    lower:
      Math.max(
        0,
        (
          centre -
          margin
        ) /
        denominator,
      ),

    upper:
      Math.min(
        1,
        (
          centre +
          margin
        ) /
        denominator,
      ),
  };
}

interface CandidateStats {
  readonly modelId:
    string;

  readonly sampleSize:
    number;

  readonly successes:
    number;

  readonly failures:
    number;

  readonly lower:
    number;

  readonly upper:
    number;
}

function candidateStats(
  candidates:
    readonly string[],

  context:
    BuildImprovementContext,

  memory:
    BuildImprovementMemory,
): CandidateStats[] {
  return candidates
    .map(
      (
        modelId,
      ) => {
        const relevant =
          memory
            .observations
            .filter(
              (
                observation,
              ) =>
                observation.modelId ===
                  modelId &&
                isComparable(
                  observation,
                  context,
                ),
            )
            .filter(
              (
                observation,
              ) =>
                isPositiveEvidence(
                  observation,
                ) ||
                isNegativeImplementationEvidence(
                  observation,
                ),
            );

        const successes =
          relevant
            .filter(
              isPositiveEvidence,
            )
            .length;

        const failures =
          relevant.length -
          successes;

        const interval =
          wilsonInterval(
            successes,
            relevant.length,
          );

        return {
          modelId,

          sampleSize:
            relevant.length,

          successes,

          failures,

          lower:
            interval.lower,

          upper:
            interval.upper,
        };
      },
    );
}

function uniqueCandidates(
  candidates:
    readonly string[],
): string[] {
  return [
    ...new Set(
      candidates.filter(
        Boolean,
      ),
    ),
  ];
}

export function applyBuildImprovementMemory(
  candidates:
    readonly string[],

  context:
    BuildImprovementContext,

  memory?:
    BuildImprovementMemory,
): BuildImprovementDecision {
  const original =
    uniqueCandidates(
      candidates,
    );

  if (
    !isLearningEnabled()
  ) {
    return {
      candidates:
        original,

      applied:
        false,

      reason:
        'learning disabled',

      preferredModel:
        null,

      preferredSampleSize:
        0,

      preferredConfidence:
        null,

      deprioritizedModels:
        [],
    };
  }

  if (
    original.length <=
      1 ||
    !memory ||
    memory.source !==
      'measured' ||
    memory.observationCount ===
      0
  ) {
    return {
      candidates:
        original,

      applied:
        false,

      reason:
        'no sufficiently measured reusable improvement signal',

      preferredModel:
        null,

      preferredSampleSize:
        0,

      preferredConfidence:
        null,

      deprioritizedModels:
        [],
    };
  }

  const stats =
    candidateStats(
      original,
      context,
      memory,
    );

  const eligible =
    stats.filter(
      (
        stat,
      ) =>
        stat.sampleSize >=
        MIN_IMPROVEMENT_SAMPLE_SIZE,
    );

  const preferred =
    eligible
      .filter(
        (
          stat,
        ) =>
          stat.lower >=
          MIN_PREFERRED_WILSON_LOWER,
      )
      .sort(
        (
          a,
          b,
        ) =>
          b.lower -
            a.lower ||
          b.sampleSize -
            a.sampleSize ||
          original.indexOf(
            a.modelId,
          ) -
            original.indexOf(
              b.modelId,
            ),
      )[0] ??
    null;

  const current =
    stats.find(
      (
        stat,
      ) =>
        stat.modelId ===
        original[0],
    ) ??
    null;

  const currentLower =
    current &&
    current.sampleSize >=
      MIN_IMPROVEMENT_SAMPLE_SIZE
      ? current.lower
      : 0;

  const preferredHasAdvantage =
    Boolean(
      preferred &&
      preferred.modelId !==
        original[0] &&
      preferred.lower -
        currentLower >=
        MIN_CONFIDENCE_ADVANTAGE,
    );

  const deprioritized =
    eligible
      .filter(
        (
          stat,
        ) =>
          stat.failures >=
            4 &&
          stat.upper <=
            MAX_DEPRIORITIZED_WILSON_UPPER,
      )
      .map(
        (
          stat,
        ) =>
          stat.modelId,
      );

  const deprioritizedSet =
    new Set(
      deprioritized,
    );

  const front =
    preferredHasAdvantage
      ? [
          preferred!.modelId,
        ]
      : [];

  const middle =
    original.filter(
      (
        modelId,
      ) =>
        !front.includes(
          modelId,
        ) &&
        !deprioritizedSet.has(
          modelId,
        ),
    );

  const delayed =
    original.filter(
      (
        modelId,
      ) =>
        !front.includes(
          modelId,
        ) &&
        deprioritizedSet.has(
          modelId,
        ),
    );

  const adjusted = [
    ...front,
    ...middle,
    ...delayed,
  ];

  const applied =
    adjusted.some(
      (
        modelId,
        index,
      ) =>
        modelId !==
        original[index],
    );

  return {
    candidates:
      adjusted,

    applied,

    reason:
      applied
        ? 'high-confidence sanitized outcome memory reordered existing authorized execution candidates'
        : 'measured improvement evidence did not clear the bounded confidence threshold',

    preferredModel:
      preferredHasAdvantage
        ? preferred!.modelId
        : null,

    preferredSampleSize:
      preferredHasAdvantage
        ? preferred!.sampleSize
        : 0,

    preferredConfidence:
      preferredHasAdvantage
        ? preferred!.lower
        : null,

    deprioritizedModels:
      deprioritized,
  };
}
