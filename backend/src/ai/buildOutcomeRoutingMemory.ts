import {
  getSupabaseAdmin,
} from '../config/supabase.js';

import type {
  BuildFailureCategory,
} from './buildOutcomeMemory.js';

export const BUILD_OUTCOME_ROUTING_SCHEMA_VERSION =
  '1.0.0' as const;

const MAX_ROWS =
  12;

const MAX_AGE_MS =
  30 *
  24 *
  60 *
  60 *
  1000;

const MAX_CONSECUTIVE_FAILURES =
  3;

const ROUTING_RELEVANT_FAILURES =
  new Set<BuildFailureCategory>([
    'provider',
    'verification',
    'compile',
    'test',
    'preview',
  ]);

interface StoredBuildOutcomeRow {
  readonly success:
    boolean;

  readonly failure_category:
    string;

  readonly model_telemetry:
    unknown;

  readonly updated_at:
    string | null;
}

export interface BuildOutcomeRoutingMemory {
  readonly schemaVersion:
    typeof BUILD_OUTCOME_ROUTING_SCHEMA_VERSION;

  readonly source:
    'measured' |
    'unavailable';

  readonly sampleCount:
    number;

  readonly successRate:
    number | null;

  readonly consecutiveFailures:
    number;

  readonly recentFailureCategories:
    readonly BuildFailureCategory[];

  /**
   * Models with repeated recent routing-relevant failures and no recent
   * success. They are moved to the end of the candidate chain, never
   * removed, so learning cannot erase the last available execution path.
   */
  readonly deprioritizedModels:
    readonly string[];
}

function failureCategory(
  value:
    string,
): BuildFailureCategory {
  const known:
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
      'unknown',
    ];

  return known.includes(
    value as
      BuildFailureCategory,
  )
    ? value as
        BuildFailureCategory
    : 'unknown';
}

function modelIds(
  telemetry:
    unknown,
): string[] {
  if (
    !Array.isArray(
      telemetry,
    )
  ) {
    return [];
  }

  const ids =
    telemetry
      .map(
        (
          item,
        ) => {
          if (
            !item ||
            typeof item !==
              'object'
          ) {
            return null;
          }

          const modelId =
            (
              item as
                Record<
                  string,
                  unknown
                >
            ).modelId;

          return typeof modelId ===
            'string' &&
            modelId.trim()
            ? modelId
                .trim()
                .slice(
                  0,
                  100,
                )
            : null;
        },
      )
      .filter(
        (
          value,
        ): value is string =>
          Boolean(
            value,
          ),
      );

  return [
    ...new Set(
      ids,
    ),
  ];
}

function unavailable():
  BuildOutcomeRoutingMemory {
  return {
    schemaVersion:
      BUILD_OUTCOME_ROUTING_SCHEMA_VERSION,

    source:
      'unavailable',

    sampleCount:
      0,

    successRate:
      null,

    consecutiveFailures:
      0,

    recentFailureCategories:
      [],

    deprioritizedModels:
      [],
  };
}

export function summarizeBuildOutcomeRows(
  rows:
    readonly StoredBuildOutcomeRow[],

  now =
    Date.now(),
): BuildOutcomeRoutingMemory {
  const recent =
    rows
      .filter(
        (
          row,
        ) => {
          if (
            !row.updated_at
          ) {
            return true;
          }

          const timestamp =
            Date.parse(
              row.updated_at,
            );

          return (
            !Number.isFinite(
              timestamp,
            ) ||
            now -
              timestamp <=
              MAX_AGE_MS
          );
        },
      )
      .slice(
        0,
        MAX_ROWS,
      );

  let consecutiveFailures =
    0;

  const recentFailureCategories:
    BuildFailureCategory[] =
    [];

  for (
    const row of
    recent
  ) {
    if (
      row.success
    ) {
      break;
    }

    const category =
      failureCategory(
        row.failure_category,
      );

    if (
      !ROUTING_RELEVANT_FAILURES
        .has(
          category,
        )
    ) {
      continue;
    }

    consecutiveFailures +=
      1;

    if (
      !recentFailureCategories
        .includes(
          category,
        )
    ) {
      recentFailureCategories
        .push(
          category,
        );
    }

    if (
      consecutiveFailures >=
      MAX_CONSECUTIVE_FAILURES
    ) {
      break;
    }
  }

  const stats =
    new Map<
      string,
      {
        successes:
          number;

        failures:
          number;
      }
    >();

  for (
    const row of
    recent
  ) {
    const category =
      failureCategory(
        row.failure_category,
      );

    for (
      const modelId of
      modelIds(
        row.model_telemetry,
      )
    ) {
      const current =
        stats.get(
          modelId,
        ) ?? {
          successes:
            0,

          failures:
            0,
        };

      if (
        row.success
      ) {
        current.successes +=
          1;
      } else if (
        ROUTING_RELEVANT_FAILURES
          .has(
            category,
          )
      ) {
        current.failures +=
          1;
      }

      stats.set(
        modelId,
        current,
      );
    }
  }

  const deprioritizedModels =
    [
      ...stats
        .entries(),
    ]
      .filter(
        (
          [
            ,
            stat,
          ],
        ) =>
          stat.failures >=
            2 &&
          stat.successes ===
            0,
      )
      .sort(
        (
          a,
          b,
        ) =>
          b[1].failures -
            a[1].failures ||
          a[0]
            .localeCompare(
              b[0],
            ),
      )
      .map(
        (
          [
            modelId,
          ],
        ) =>
          modelId,
      );

  const settled =
    recent.filter(
      (
        row,
      ) =>
        failureCategory(
          row.failure_category,
        ) !==
        'user_cancelled',
    );

  const successRate =
    settled.length
      ? settled.filter(
          (
            row,
          ) =>
            row.success,
        ).length /
        settled.length
      : null;

  return {
    schemaVersion:
      BUILD_OUTCOME_ROUTING_SCHEMA_VERSION,

    source:
      'measured',

    sampleCount:
      recent.length,

    successRate,

    consecutiveFailures,

    recentFailureCategories:
      recentFailureCategories
        .slice(
          0,
          4,
        ),

    deprioritizedModels,
  };
}

export async function loadBuildOutcomeRoutingMemory(
  userId:
    string,
): Promise<BuildOutcomeRoutingMemory> {
  if (
    !process.env
      .SUPABASE_SERVICE_ROLE_KEY
  ) {
    return unavailable();
  }

  try {
    const {
      data,
      error,
    } =
      await getSupabaseAdmin()
        .from(
          'build_outcomes',
        )
        .select(
          'success,failure_category,model_telemetry,updated_at',
        )
        .eq(
          'user_id',
          userId,
        )
        .order(
          'updated_at',
          {
            ascending:
              false,
          },
        )
        .limit(
          MAX_ROWS,
        );

    if (
      error
    ) {
      throw error;
    }

    return summarizeBuildOutcomeRows(
      (
        data ??
        []
      ) as
        StoredBuildOutcomeRow[],
    );
  } catch (
    error
  ) {
    console.warn(
      '[buildOutcomeRoutingMemory] load skipped:',

      error instanceof
        Error
        ? error.message
        : String(
            error,
          ),
    );

    return unavailable();
  }
}

export function applyBuildOutcomeRoutingMemory(
  candidates:
    readonly string[],

  memory?:
    BuildOutcomeRoutingMemory,
): {
  readonly candidates:
    readonly string[];

  readonly applied:
    boolean;

  readonly reason:
    string;
} {
  if (
    !memory ||
    memory.source !==
      'measured' ||
    memory
      .deprioritizedModels
      .length ===
      0
  ) {
    return {
      candidates:
        [...candidates],

      applied:
        false,

      reason:
        'no recent repeated model failure signal',
    };
  }

  const deprioritized =
    new Set(
      memory
        .deprioritizedModels,
    );

  const preferred =
    candidates.filter(
      (
        modelId,
      ) =>
        !deprioritized.has(
          modelId,
        ),
    );

  const delayed =
    candidates.filter(
      (
        modelId,
      ) =>
        deprioritized.has(
          modelId,
        ),
    );

  const adjusted = [
    ...preferred,
    ...delayed,
  ];

  const applied =
    adjusted.some(
      (
        modelId,
        index,
      ) =>
        modelId !==
        candidates[index],
    );

  return {
    candidates:
      adjusted,

    applied,

    reason:
      applied
        ? `recent verified failures moved ${delayed.length} repeatedly failing route(s) behind healthier candidates`
        : 'recent failure memory did not change the available candidate order',
  };
}
