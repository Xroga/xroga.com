import {
  getSupabaseAdmin,
} from '../config/supabase.js';

import {
  recentRoutingOutcomes,
  type RoutingOutcome,
} from './routingOutcomes.js';

import {
  BUILD_OUTCOME_RETENTION_MS,
} from './learningPolicy.js';

export const BUILD_OUTCOME_SCHEMA_VERSION =
  '1.1.0' as const;

export type BuildTerminalStatus =
  | 'complete'
  | 'error'
  | 'cancelled';

export type BuildFailureCategory =
  | 'none'
  | 'user_cancelled'
  | 'interrupted'
  | 'capacity'
  | 'provider'
  | 'verification'
  | 'compile'
  | 'test'
  | 'preview'
  | 'publication'
  | 'deployment'
  | 'policy'
  | 'platform'
  | 'dependency'
  | 'runtime'
  | 'architecture'
  | 'integration'
  | 'user_configuration'
  | 'unknown';

export type BuildFailureDomain =
  | 'none'
  | 'project'
  | 'provider'
  | 'platform'
  | 'user'
  | 'delivery';

export type BuildFailureStage =
  | 'none'
  | 'planning'
  | 'implementation'
  | 'dependency'
  | 'build'
  | 'test'
  | 'browser'
  | 'runtime'
  | 'verification'
  | 'publication'
  | 'deployment'
  | 'unknown';

export interface SanitizedModelTelemetry {
  readonly modelId:
    string;

  readonly provider:
    string | null;

  readonly taskClass:
    string;

  readonly routingMode:
    string;

  readonly framework:
    string | null;

  readonly requiredCapabilities:
    readonly string[];

  readonly latencyMs:
    number | null;

  readonly inputTokens:
    number;

  readonly outputTokens:
    number;

  readonly estimatedCostUsd:
    number | null;

  readonly repairLoops:
    number;

  readonly modelSwitches:
    number;

  readonly providerFailureType:
    string | null;

  readonly reviewOk:
    boolean | null;

  readonly deploymentOk:
    boolean | null;

  readonly finalVerificationOk:
    boolean | null;
}

export interface BuildOutcomeRecord {
  readonly schemaVersion:
    typeof BUILD_OUTCOME_SCHEMA_VERSION;

  /**
   * Deliberately excludes fine-tuning.
   */
  readonly reuseScope:
    'evaluation_and_routing';

  readonly runId:
    string;

  readonly userId:
    string;

  readonly terminalStatus:
    BuildTerminalStatus;

  readonly success:
    boolean;

  readonly featureCategory:
    string | null;

  readonly failureCategory:
    BuildFailureCategory;

  readonly failureCode:
    string | null;

  readonly failureDomain:
    BuildFailureDomain;

  readonly failureStage:
    BuildFailureStage;

  readonly verified:
    boolean;

  readonly taxonomyId:
    string | null;

  readonly productSurface:
    string | null;

  readonly productSubtype:
    string | null;

  readonly domainCategory:
    string | null;

  readonly recipeId:
    string | null;

  readonly goldenExampleIds:
    readonly string[];

  readonly framework:
    string | null;

  readonly runtime:
    string | null;

  readonly adapterId:
    string | null;

  readonly generatedFileCount:
    number | null;

  readonly verificationAttempts:
    number | null;

  readonly repairRounds:
    number;

  readonly buildPassed:
    boolean | null;

  readonly testPassed:
    boolean | null;

  readonly browserPassed:
    boolean | null;

  readonly runtimePassed:
    boolean | null;

  readonly savedProjectReady:
    boolean;

  readonly publicationRequested:
    boolean;

  readonly publicationSucceeded:
    boolean;

  readonly deploymentRequested:
    boolean;

  readonly deploymentSucceeded:
    boolean;

  readonly learningEligible:
    boolean;

  readonly learningExclusionReason:
    string | null;

  readonly learningDecision: {
    readonly recipePreferenceApplied:
      boolean;

    readonly goldenExamplePreferenceApplied:
      boolean;

    readonly recipeSampleSize:
      number;

    readonly recipeConfidence:
      number | null;

    readonly goldenSampleSize:
      number;

    readonly goldenConfidence:
      number | null;
  } | null;

  readonly iterationCount:
    number;

  readonly durationMs:
    number | null;

  readonly modelTelemetry:
    readonly SanitizedModelTelemetry[];

  readonly recordedAt:
    string;
}

export interface TerminalBuildOutcomeInput {
  readonly runId:
    string;

  readonly userId:
    string;

  readonly terminalStatus:
    BuildTerminalStatus;

  readonly featureCategory?:
    string;

  readonly iterationCount:
    number;

  readonly createdAt?:
    string;

  readonly completedAt?:
    string | null;

  /**
   * Read only for deterministic classification.
   *
   * Never persisted into BuildOutcome memory.
   */
  readonly output:
    Record<
      string,
      unknown
    > | null;

  /**
   * Tests may provide deterministic routing evidence.
   * Production reuses the existing routing-outcome cache.
   */
  readonly routingOutcomes?:
    readonly RoutingOutcome[];

  readonly recordedAt?:
    string;
}

function record(
  value:
    unknown,
): Record<
  string,
  unknown
> | null {
  return (
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
  )
    ? value as
        Record<
          string,
          unknown
        >
    : null;
}

function booleanField(
  value:
    unknown,
): boolean | null {
  return typeof value ===
    'boolean'
    ? value
    : null;
}

function normalizedFailureCode(
  output:
    Record<
      string,
      unknown
    > | null,
): string | null {
  if (
    typeof output
      ?.code !==
    'string'
  ) {
    return null;
  }

  const code =
    output.code
      .trim()
      .toUpperCase()
      .replace(
        /[^A-Z0-9_-]+/g,
        '_',
      )
      .slice(
        0,
        80,
      );

  return (
    code ||
    null
  );
}

function categoryFromCode(
  code:
    string | null,
): BuildFailureCategory | null {
  if (
    !code
  ) {
    return null;
  }

  if (
    code ===
      'BUILD_CANCELLED' ||
    code.includes(
      'CANCELLED',
    )
  ) {
    return 'user_cancelled';
  }

  if (
    code.includes(
      'INTERRUPT',
    ) ||
    code.includes(
      'WORKER_LOST',
    ) ||
    code.includes(
      'RESTART',
    )
  ) {
    return 'interrupted';
  }

  if (
    code.includes(
      'CAPACITY',
    ) ||
    code.includes(
      'RATE_LIMIT',
    ) ||
    code.includes(
      'QUOTA',
    )
  ) {
    return 'capacity';
  }

  if (
    code.includes(
      'PROVIDER',
    ) ||
    code.includes(
      'MODEL_',
    ) ||
    code.includes(
      'API_KEY',
    )
  ) {
    return 'provider';
  }

  if (
    code.includes(
      'COMPILE',
    ) ||
    code.includes(
      'TYPECHECK',
    ) ||
    code.includes(
      'BUILD_VALIDATION',
    )
  ) {
    return 'compile';
  }

  if (
    code.includes(
      'TEST',
    ) ||
    code.includes(
      'CHECK_FAILED',
    )
  ) {
    return 'test';
  }

  if (
    code.includes(
      'PREVIEW',
    ) ||
    code.includes(
      'BROWSER',
    ) ||
    code.includes(
      'SANDBOX',
    )
  ) {
    return 'preview';
  }

  if (
    code.includes(
      'DEPLOY',
    ) ||
    code.includes(
      'VERCEL',
    )
  ) {
    return 'deployment';
  }

  if (
    code.includes(
      'PUBLISH',
    ) ||
    code.includes(
      'GITHUB',
    ) ||
    code.includes(
      'COMMIT',
    ) ||
    code.includes(
      'REPOSITORY_WRITE',
    )
  ) {
    return 'publication';
  }

  if (
    code.includes(
      'VERIFY',
    ) ||
    code.includes(
      'VALIDATION',
    ) ||
    code.includes(
      'REVIEW',
    ) ||
    code.includes(
      'QA_',
    )
  ) {
    return 'verification';
  }

  if (
    code.includes(
      'DISABLED',
    ) ||
    code.includes(
      'POLICY',
    ) ||
    code.includes(
      'REFUSED',
    ) ||
    code.includes(
      'UNAUTHORIZED',
    )
  ) {
    return 'policy';
  }

  if (
    code.includes(
      'PLATFORM',
    ) ||
    code.includes(
      'DATABASE',
    ) ||
    code.includes(
      'SUPABASE',
    ) ||
    code.includes(
      'INTERNAL',
    )
  ) {
    return 'platform';
  }

  return null;
}

export function classifyBuildFailure(
  input: {
    readonly terminalStatus:
      BuildTerminalStatus;

    readonly output:
      Record<
        string,
        unknown
      > | null;
  },
): {
  category:
    BuildFailureCategory;

  code:
    string | null;
} {
  const code =
    normalizedFailureCode(
      input.output,
    );

  if (
    input.terminalStatus ===
    'cancelled'
  ) {
    return {
      category:
        'user_cancelled',

      code:
        code ??
        'BUILD_CANCELLED',
    };
  }

  const explicit =
    categoryFromCode(
      code,
    );

  if (
    explicit
  ) {
    return {
      category:
        explicit,

      code,
    };
  }

  const compile =
    record(
      input.output
        ?.compile,
    );

  if (
    booleanField(
      compile?.ok,
    ) ===
    false
  ) {
    return {
      category:
        'compile',

      code,
    };
  }

  const qa =
    record(
      input.output
        ?.qa,
    );

  if (
    booleanField(
      qa?.ok,
    ) ===
    false
  ) {
    return {
      category:
        'verification',

      code,
    };
  }

  const security =
    record(
      input.output
        ?.security,
    );

  if (
    booleanField(
      security?.ok,
    ) ===
    false
  ) {
    return {
      category:
        'verification',

      code,
    };
  }

  if (
    input.terminalStatus ===
    'complete'
  ) {
    return {
      category:
        'none',

      code:
        null,
    };
  }

  return {
    category:
      'unknown',

    code,
  };
}

function nonNegativeInt(
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

function nullableNumber(
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
    ? value
    : null;
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

function safeText(
  value:
    unknown,
  maximum =
    80,
): string | null {
  if (
    typeof value !==
      'string'
  ) {
    return null;
  }

  const text =
    value
      .trim()
      .slice(
        0,
        maximum,
      );

  return (
    text ||
    null
  );
}

export function sanitizeRoutingOutcome(
  outcome:
    RoutingOutcome,
): SanitizedModelTelemetry {
  return {
    modelId:
      String(
        outcome.modelId,
      )
        .slice(
          0,
          100,
        ),

    provider:
      safeText(
        outcome.provider,
        100,
      ),

    taskClass:
      String(
        outcome.taskClass,
      )
        .slice(
          0,
          100,
        ),

    routingMode:
      String(
        outcome.mode,
      )
        .slice(
          0,
          40,
        ),

    framework:
      safeText(
        outcome.framework,
        100,
      ),

    requiredCapabilities:
      (
        outcome.requiredCapabilities ??
        []
      )
        .slice(
          0,
          32,
        )
        .map(
          (
            capability,
          ) =>
            String(
              capability,
            )
              .slice(
                0,
                100,
              ),
        ),

    latencyMs:
      nullableNumber(
        outcome.latencyMs,
      ),

    inputTokens:
      nonNegativeInt(
        outcome.inputTokens,
      ),

    outputTokens:
      nonNegativeInt(
        outcome.outputTokens,
      ),

    estimatedCostUsd:
      nullableNumber(
        outcome.estimatedCostUsd,
      ),

    repairLoops:
      nonNegativeInt(
        outcome.repairLoops,
      ),

    modelSwitches:
      nonNegativeInt(
        outcome.modelSwitches,
      ),

    providerFailureType:
      safeText(
        outcome.providerFailureType,
        120,
      ),

    reviewOk:
      nullableBoolean(
        outcome.reviewOk,
      ),

    deploymentOk:
      nullableBoolean(
        outcome.deploymentOk,
      ),

    finalVerificationOk:
      nullableBoolean(
        outcome.finalVerificationOk,
      ),
  };
}

function durationMs(
  createdAt?:
    string,

  completedAt?:
    string | null,
): number | null {
  if (
    !createdAt ||
    !completedAt
  ) {
    return null;
  }

  const start =
    Date.parse(
      createdAt,
    );

  const end =
    Date.parse(
      completedAt,
    );

  if (
    !Number.isFinite(
      start,
    ) ||
    !Number.isFinite(
      end,
    )
  ) {
    return null;
  }

  return Math.max(
    0,
    end -
      start,
  );
}

export function buildOutcomeFromTerminalRun(
  input:
    TerminalBuildOutcomeInput,
): BuildOutcomeRecord {
  const failure =
    classifyBuildFailure({
      terminalStatus:
        input.terminalStatus,

      output:
        input.output,
    });

  const routing =
    (
      input.routingOutcomes ??
      recentRoutingOutcomes()
    )
      .filter(
        (
          outcome,
        ) =>
          outcome.runId ===
          input.runId,
      )
      .slice(
        -12,
      )
      .map(
        sanitizeRoutingOutcome,
      );

  return {
    schemaVersion:
      BUILD_OUTCOME_SCHEMA_VERSION,

    reuseScope:
      'evaluation_and_routing',

    runId:
      input.runId,

    userId:
      input.userId,

    terminalStatus:
      input.terminalStatus,

    success:
      input.terminalStatus ===
        'complete' &&
      failure.category ===
        'none',

    featureCategory:
      safeText(
        input.featureCategory,
        100,
      ),

    failureCategory:
      failure.category,

    failureCode:
      failure.code,

    iterationCount:
      nonNegativeInt(
        input.iterationCount,
      ),

    durationMs:
      durationMs(
        input.createdAt,
        input.completedAt,
      ),

    modelTelemetry:
      routing,

    recordedAt:
      input.recordedAt ??
      new Date()
        .toISOString(),
  };
}

export interface BuildOutcomeStore {
  upsert(
    outcome:
      BuildOutcomeRecord,
  ): Promise<void>;
}

export class SupabaseBuildOutcomeStore
implements BuildOutcomeStore {
  async upsert(
    outcome:
      BuildOutcomeRecord,
  ): Promise<void> {
    const supabase =
      getSupabaseAdmin();

    const {
      error,
    } =
      await supabase
        .from(
          'build_outcomes',
        )
        .upsert(
          {
            run_id:
              outcome.runId,

            user_id:
              outcome.userId,

            schema_version:
              outcome.schemaVersion,

            reuse_scope:
              outcome.reuseScope,

            terminal_status:
              outcome.terminalStatus,

            success:
              outcome.success,

            feature_category:
              outcome.featureCategory,

            failure_category:
              outcome.failureCategory,

            failure_code:
              outcome.failureCode,

            iteration_count:
              outcome.iterationCount,

            duration_ms:
              outcome.durationMs,

            model_telemetry:
              outcome.modelTelemetry,

            recorded_at:
              outcome.recordedAt,

            updated_at:
              new Date()
                .toISOString(),
          },

          {
            onConflict:
              'run_id',
          },
        );

    if (
      error
    ) {
      throw new Error(
        'BuildOutcome persistence failed',
      );
    }

    /*
     * Keep evaluation memory finite. Selection uses much tighter row/time
     * bounds, while this longer retention window preserves enough aggregate
     * history for quality evaluation without becoming an indefinite archive.
     *
     * Cleanup is best-effort and user-scoped; a cleanup outage must never turn
     * an otherwise recorded build outcome into a user-visible build failure.
     */
    const cutoff =
      new Date(
        Date.now() -
        BUILD_OUTCOME_RETENTION_MS,
      )
        .toISOString();

    const {
      error:
        retentionError,
    } =
      await supabase
        .from(
          'build_outcomes',
        )
        .delete()
        .eq(
          'user_id',
          outcome.userId,
        )
        .lt(
          'updated_at',
          cutoff,
        );

    if (
      retentionError
    ) {
      console.warn(
        '[learning_store_unavailable]',
        JSON.stringify({
          component:
            'build_outcome_retention',
        }),
      );
    }
  }
}

/**
 * Evaluation memory must never break a user build.
 *
 * Recording is intentionally fail-open.
 */
export async function recordBuildOutcomeFailOpen(
  outcome:
    BuildOutcomeRecord,

  store?:
    BuildOutcomeStore,
): Promise<boolean> {
  const target =
    store ??
    (
      process.env
        .SUPABASE_SERVICE_ROLE_KEY
        ? new SupabaseBuildOutcomeStore()
        : null
    );

  if (
    !target
  ) {
    return false;
  }

  try {
    await target
      .upsert(
        outcome,
      );

    console.info(
      '[learning_outcome_recorded]',
      JSON.stringify({
        runId:
          outcome.runId,
        featureCategory:
          outcome.featureCategory,
        failureCategory:
          outcome.failureCategory,
        schemaVersion:
          outcome.schemaVersion,
      }),
    );

    return true;
  } catch {
    console.warn(
      '[learning_store_unavailable]',
      JSON.stringify({
        component:
          'build_outcome_record',
        runId:
          outcome.runId,
      }),
    );

    return false;
  }
}

export async function recordTerminalBuildOutcomeFailOpen(
  input:
    TerminalBuildOutcomeInput,

  store?:
    BuildOutcomeStore,
): Promise<boolean> {
  return recordBuildOutcomeFailOpen(
    buildOutcomeFromTerminalRun(
      input,
    ),

    store,
  );
}
