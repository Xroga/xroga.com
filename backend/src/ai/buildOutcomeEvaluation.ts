import type {
  BuildFailureDomain,
  BuildFailureStage,
} from './buildOutcomeMemory.js';

export const BUILD_OUTCOME_EVALUATION_SCHEMA_VERSION =
  '1.0.0' as const;

export interface StoredBuildOutcomeEvaluationRow {
  readonly schema_version?:
    unknown;

  readonly success?:
    unknown;

  readonly verified?:
    unknown;

  readonly learning_eligible?:
    unknown;

  readonly failure_domain?:
    unknown;

  readonly failure_stage?:
    unknown;

  readonly repair_rounds?:
    unknown;

  readonly verification_attempts?:
    unknown;

  readonly model_telemetry?:
    unknown;

  readonly learning_decision?:
    unknown;
}

export interface NormalizedBuildOutcomeEvaluationRow {
  readonly schemaVersion:
    string;

  readonly success:
    boolean;

  readonly verified:
    boolean;

  readonly learningEligible:
    boolean;

  readonly failureDomain:
    BuildFailureDomain;

  readonly failureStage:
    BuildFailureStage;

  readonly repairRounds:
    number;

  readonly verificationAttempts:
    number | null;

  readonly fallbackUsed:
    boolean;

  readonly learningDecisionApplied:
    boolean;
}

export interface BuildOutcomeEvaluation {
  readonly schemaVersion:
    typeof BUILD_OUTCOME_EVALUATION_SCHEMA_VERSION;

  readonly comparableOutcomes:
    number;

  readonly verifiedSuccessRate:
    number | null;

  readonly conservativeVerifiedSuccess:
    number | null;

  readonly averageRepairRounds:
    number | null;

  readonly averageVerificationAttempts:
    number | null;

  readonly modelFallbackRate:
    number | null;

  readonly projectFailureRate:
    number | null;

  readonly providerFailureRate:
    number | null;

  readonly browserFailureRate:
    number | null;

  readonly runtimeFailureRate:
    number | null;

  readonly learningDecisionRate:
    number | null;
}

const DOMAINS:
  readonly BuildFailureDomain[] = [
  'none',
  'project',
  'provider',
  'platform',
  'user',
  'delivery',
];

const STAGES:
  readonly BuildFailureStage[] = [
  'none',
  'planning',
  'implementation',
  'dependency',
  'build',
  'test',
  'browser',
  'runtime',
  'verification',
  'publication',
  'deployment',
  'unknown',
];

function booleanValue(
  value:
    unknown,
): boolean {
  return value ===
    true;
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

function optionalNonNegativeInteger(
  value:
    unknown,
): number | null {
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
    : null;
}

function domain(
  value:
    unknown,
): BuildFailureDomain {
  return (
    typeof value ===
      'string' &&
    DOMAINS.includes(
      value as
        BuildFailureDomain,
    )
  )
    ? value as
        BuildFailureDomain
    : 'none';
}

function stage(
  value:
    unknown,
): BuildFailureStage {
  return (
    typeof value ===
      'string' &&
    STAGES.includes(
      value as
        BuildFailureStage,
    )
  )
    ? value as
        BuildFailureStage
    : 'unknown';
}

function fallbackUsed(
  telemetry:
    unknown,
): boolean {
  if (
    !Array.isArray(
      telemetry,
    )
  ) {
    return false;
  }

  return telemetry.some(
    (
      item,
    ) => {
      if (
        !item ||
        typeof item !==
          'object' ||
        Array.isArray(
          item,
        )
      ) {
        return false;
      }

      const row =
        item as
          Record<
            string,
            unknown
          >;

      return (
        nonNegativeInteger(
          row.modelSwitches,
        ) >
        0
      );
    },
  );
}

function decisionApplied(
  value:
    unknown,
): boolean {
  if (
    !value ||
    typeof value !==
      'object' ||
    Array.isArray(
      value,
    )
  ) {
    return false;
  }

  const decision =
    value as
      Record<
        string,
        unknown
      >;

  return (
    decision.recipePreferenceApplied ===
      true ||
    decision.goldenExamplePreferenceApplied ===
      true ||
    decision.modelPreferenceApplied ===
      true ||
    decision.verificationPriorityApplied ===
      true
  );
}

/**
 * Historical rows are deliberately normalized rather than rewritten.
 *
 * Step 7B.1 rows predate the expanded lifecycle columns. Missing optional
 * fields become conservative defaults so a schema extension never turns old
 * data into invented evidence.
 */
export function normalizeBuildOutcomeEvaluationRow(
  row:
    StoredBuildOutcomeEvaluationRow,
): NormalizedBuildOutcomeEvaluationRow {
  return {
    schemaVersion:
      typeof row.schema_version ===
        'string' &&
      row.schema_version.trim()
        ? row.schema_version
            .trim()
            .slice(
              0,
              32,
            )
        : '1.0.0',

    success:
      booleanValue(
        row.success,
      ),

    verified:
      booleanValue(
        row.verified,
      ),

    learningEligible:
      booleanValue(
        row.learning_eligible,
      ),

    failureDomain:
      domain(
        row.failure_domain,
      ),

    failureStage:
      stage(
        row.failure_stage,
      ),

    repairRounds:
      nonNegativeInteger(
        row.repair_rounds,
      ),

    verificationAttempts:
      optionalNonNegativeInteger(
        row.verification_attempts,
      ),

    fallbackUsed:
      fallbackUsed(
        row.model_telemetry,
      ),

    learningDecisionApplied:
      decisionApplied(
        row.learning_decision,
      ),
  };
}

function ratio(
  numerator:
    number,

  denominator:
    number,
): number | null {
  return denominator > 0
    ? numerator /
        denominator
    : null;
}

function average(
  values:
    readonly number[],
): number | null {
  if (
    !values.length
  ) {
    return null;
  }

  return values.reduce(
    (
      total,
      value,
    ) =>
      total +
      value,

    0,
  ) /
    values.length;
}

function wilsonLower(
  successes:
    number,

  total:
    number,
): number | null {
  if (
    total <=
    0
  ) {
    return null;
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

  return Math.max(
    0,
    (
      centre -
      margin
    ) /
    denominator,
  );
}

export function evaluateBuildOutcomes(
  rows:
    readonly StoredBuildOutcomeEvaluationRow[],
): BuildOutcomeEvaluation {
  const normalized =
    rows.map(
      normalizeBuildOutcomeEvaluationRow,
    );

  const comparable =
    normalized.filter(
      (
        row,
      ) =>
        row.learningEligible,
    );

  const verifiedSuccesses =
    comparable.filter(
      (
        row,
      ) =>
        row.verified &&
        (
          row.success ||
          row.failureDomain ===
            'delivery'
        ),
    )
      .length;

  const verificationAttempts =
    comparable
      .map(
        (
          row,
        ) =>
          row.verificationAttempts,
      )
      .filter(
        (
          value,
        ): value is number =>
          value !==
          null,
      );

  return {
    schemaVersion:
      BUILD_OUTCOME_EVALUATION_SCHEMA_VERSION,

    comparableOutcomes:
      comparable.length,

    verifiedSuccessRate:
      ratio(
        verifiedSuccesses,
        comparable.length,
      ),

    conservativeVerifiedSuccess:
      wilsonLower(
        verifiedSuccesses,
        comparable.length,
      ),

    averageRepairRounds:
      average(
        comparable.map(
          (
            row,
          ) =>
            row.repairRounds,
        ),
      ),

    averageVerificationAttempts:
      average(
        verificationAttempts,
      ),

    modelFallbackRate:
      ratio(
        comparable.filter(
          (
            row,
          ) =>
            row.fallbackUsed,
        )
          .length,

        comparable.length,
      ),

    projectFailureRate:
      ratio(
        comparable.filter(
          (
            row,
          ) =>
            row.failureDomain ===
            'project',
        )
          .length,

        comparable.length,
      ),

    providerFailureRate:
      ratio(
        normalized.filter(
          (
            row,
          ) =>
            row.failureDomain ===
            'provider',
        )
          .length,

        normalized.length,
      ),

    browserFailureRate:
      ratio(
        comparable.filter(
          (
            row,
          ) =>
            row.failureStage ===
            'browser',
        )
          .length,

        comparable.length,
      ),

    runtimeFailureRate:
      ratio(
        comparable.filter(
          (
            row,
          ) =>
            row.failureStage ===
            'runtime',
        )
          .length,

        comparable.length,
      ),

    learningDecisionRate:
      ratio(
        comparable.filter(
          (
            row,
          ) =>
            row.learningDecisionApplied,
        )
          .length,

        comparable.length,
      ),
  };
}
