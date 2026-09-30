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

    readonly modelPreferenceApplied:
      boolean;

    readonly modelSampleSize:
      number;

    readonly modelConfidence:
      number | null;

    readonly verificationPriorityApplied:
      boolean;
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
      'USER_CONFIG',
    ) ||
    code.includes(
      'MISSING_CONFIG',
    ) ||
    code.includes(
      'CONFIGURATION',
    ) ||
    code.includes(
      'API_KEY',
    )
  ) {
    return 'user_configuration';
  }

  if (
    code.includes(
      'PROVIDER',
    ) ||
    code.includes(
      'MODEL_',
    )
  ) {
    return 'provider';
  }

  if (
    code.includes(
      'REGISTRY',
    ) ||
    code.includes(
      'DEPENDENCY',
    ) ||
    code.includes(
      'INSTALL',
    ) ||
    code.includes(
      'PACKAGE_MANAGER',
    )
  ) {
    return 'dependency';
  }

  if (
    code.includes(
      'ARCHITECTURE',
    ) ||
    code.includes(
      'NO_ADAPTER',
    ) ||
    code.includes(
      'UNSUPPORTED_PRODUCT',
    )
  ) {
    return 'architecture';
  }

  if (
    code.includes(
      'INTEGRATION',
    ) ||
    code.includes(
      'OAUTH',
    ) ||
    code.includes(
      'CONNECTOR',
    )
  ) {
    return 'integration';
  }

  if (
    code.includes(
      'RUNTIME',
    ) ||
    code.includes(
      'PROCESS_',
    ) ||
    code.includes(
      'HEALTH_CHECK',
    )
  ) {
    return 'runtime';
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

  const phaseReached =
    safeText(
      input.output
        ?.phaseReached,
      40,
    );

  if (
    input.terminalStatus ===
      'error' &&
    (
      phaseReached ===
        'architecture' ||
      phaseReached ===
        'spec' ||
      phaseReached ===
        'planning'
    )
  ) {
    return {
      category:
        'architecture',

      code,
    };
  }

  if (
    input.terminalStatus ===
      'error' &&
    phaseReached ===
      'implementation'
  ) {
    return {
      category:
        'runtime',

      code,
    };
  }

  if (
    input.terminalStatus ===
      'error' &&
    (
      phaseReached ===
        'validation' ||
      phaseReached ===
        'repair' ||
      phaseReached ===
        'review'
    )
  ) {
    return {
      category:
        'verification',

      code,
    };
  }

  if (
    input.terminalStatus ===
      'error' &&
    phaseReached ===
      'commit'
  ) {
    return {
      category:
        'publication',

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

function safeIdentifiers(
  value:
    unknown,

  maximum =
    12,
): string[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return [
    ...new Set(
      value
        .map(
          (
            item,
          ) =>
            safeText(
              item,
              100,
            ),
        )
        .filter(
          (
            item,
          ): item is string =>
            Boolean(
              item,
            ),
        )
        .slice(
          0,
          maximum,
        ),
    ),
  ];
}

function failureDomainFor(
  category:
    BuildFailureCategory,
): BuildFailureDomain {
  if (
    category ===
    'none'
  ) {
    return 'none';
  }

  if (
    category ===
      'provider' ||
    category ===
      'capacity'
  ) {
    return 'provider';
  }

  if (
    category ===
    'platform'
  ) {
    return 'platform';
  }

  if (
    category ===
      'publication' ||
    category ===
      'deployment'
  ) {
    return 'delivery';
  }

  if (
    category ===
      'user_cancelled' ||
    category ===
      'user_configuration' ||
    category ===
      'policy'
  ) {
    return 'user';
  }

  return 'project';
}

function failureStageFor(
  category:
    BuildFailureCategory,
): BuildFailureStage {
  switch (
    category
  ) {
    case 'none':
      return 'none';

    case 'dependency':
      return 'dependency';

    case 'compile':
      return 'build';

    case 'test':
      return 'test';

    case 'preview':
      return 'browser';

    case 'runtime':
      return 'runtime';

    case 'verification':
      return 'verification';

    case 'publication':
      return 'publication';

    case 'deployment':
      return 'deployment';

    case 'architecture':
      return 'planning';

    case 'integration':
      return 'implementation';

    default:
      return 'unknown';
  }
}

function phaseStatus(
  output:
    Record<
      string,
      unknown
    > | null,

  key:
    string,
): string | null {
  const lifecycle =
    record(
      output
        ?.projectRunState,
    );

  const phase =
    record(
      lifecycle?.[key],
    );

  return safeText(
    phase?.status,
    40,
  );
}

function statusBoolean(
  status:
    string | null,
): boolean | null {
  if (
    status ===
    'succeeded'
  ) {
    return true;
  }

  if (
    status ===
      'failed' ||
    status ===
      'blocked' ||
    status ===
      'cancelled'
  ) {
    return false;
  }

  return null;
}

function browserOutcome(
  output:
    Record<
      string,
      unknown
    > | null,
): boolean | null {
  const browser =
    record(
      output
        ?.browserVerification,
    );

  const direct =
    booleanField(
      browser?.verified,
    ) ??
    booleanField(
      browser?.ok,
    ) ??
    booleanField(
      browser?.passed,
    );

  if (
    direct !==
    null
  ) {
    return direct;
  }

  const status =
    safeText(
      browser?.status,
      40,
    );

  if (
    status ===
      'passed' ||
    status ===
      'succeeded' ||
    status ===
      'ready'
  ) {
    return true;
  }

  if (
    status ===
      'failed' ||
    status ===
      'blocked' ||
    status ===
      'error'
  ) {
    return false;
  }

  return null;
}

function sanitizedLearningContext(
  output:
    Record<
      string,
      unknown
    > | null,
) {
  const context =
    record(
      output
        ?.learningContext,
    );

  const decision =
    record(
      context
        ?.learningDecision,
    );

  return {
    taxonomyId:
      safeText(
        context?.taxonomyId,
        100,
      ),

    productSurface:
      safeText(
        context?.surface,
        80,
      ),

    productSubtype:
      safeText(
        context?.subtype,
        100,
      ),

    domainCategory:
      safeText(
        context?.domain,
        100,
      ),

    recipeId:
      safeText(
        context?.recipeId,
        120,
      ),

    goldenExampleIds:
      safeIdentifiers(
        context
          ?.goldenExampleIds,
      ),

    framework:
      safeText(
        context?.framework,
        100,
      ),

    runtime:
      safeText(
        context?.runtime,
        100,
      ),

    adapterId:
      safeText(
        context?.adapterId,
        120,
      ),

    learningDecision:
      decision
        ? {
            recipePreferenceApplied:
              booleanField(
                decision
                  .recipePreferenceApplied,
              ) ===
              true,

            goldenExamplePreferenceApplied:
              booleanField(
                decision
                  .goldenExamplePreferenceApplied,
              ) ===
              true,

            recipeSampleSize:
              nonNegativeInt(
                decision
                  .recipeSampleSize,
              ),

            recipeConfidence:
              nullableNumber(
                decision
                  .recipeConfidence,
              ),

            goldenSampleSize:
              nonNegativeInt(
                decision
                  .goldenSampleSize,
              ),

            goldenConfidence:
              nullableNumber(
                decision
                  .goldenConfidence,
              ),

            modelPreferenceApplied:
              booleanField(
                decision
                  .modelPreferenceApplied,
              ) ===
              true,

            modelSampleSize:
              nonNegativeInt(
                decision
                  .modelSampleSize,
              ),

            modelConfidence:
              nullableNumber(
                decision
                  .modelConfidence,
              ),

            verificationPriorityApplied:
              booleanField(
                decision
                  .verificationPriorityApplied,
              ) ===
              true,
          }
        : null,
  };
}

function learningEligibility(
  input: {
    readonly verified:
      boolean;

    readonly failureCategory:
      BuildFailureCategory;

    readonly failureDomain:
      BuildFailureDomain;
  },
): {
  readonly eligible:
    boolean;

  readonly reason:
    string | null;
} {
  if (
    input.verified &&
    (
      input.failureCategory ===
        'none' ||
      input.failureDomain ===
        'delivery'
    )
  ) {
    return {
      eligible:
        true,

      reason:
        null,
    };
  }

  if (
    input.failureDomain ===
      'project' &&
    [
      'verification',
      'compile',
      'test',
      'preview',
      'dependency',
      'runtime',
      'architecture',
      'integration',
    ].includes(
      input.failureCategory,
    )
  ) {
    return {
      eligible:
        true,

      reason:
        null,
    };
  }

  const reason =
    input.failureCategory ===
      'user_cancelled'
      ? 'user_cancelled'
      : input.failureCategory ===
          'interrupted'
        ? 'interrupted'
        : input.failureDomain ===
            'provider'
          ? 'provider_or_capacity'
          : input.failureDomain ===
              'platform'
            ? 'platform_failure'
            : input.failureDomain ===
                'user'
              ? 'user_or_policy'
              : input.verified
                ? 'delivery_only'
                : 'unverified';

  return {
    eligible:
      false,

    reason,
  };
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

  const learningContext =
    sanitizedLearningContext(
      input.output,
    );

  const verificationStatus =
    phaseStatus(
      input.output,
      'verification',
    );

  const persistenceStatus =
    phaseStatus(
      input.output,
      'persistence',
    );

  const publicationStatus =
    phaseStatus(
      input.output,
      'publication',
    );

  const deploymentStatus =
    phaseStatus(
      input.output,
      'deployment',
    );

  const runtimeStatus =
    phaseStatus(
      input.output,
      'runtime',
    );

  const verified =
    booleanField(
      input.output
        ?.verified,
    ) ===
      true ||
    verificationStatus ===
      'succeeded' ||
    routing.some(
      (
        outcome,
      ) =>
        outcome.finalVerificationOk ===
        true,
    );

  const failureDomain =
    failureDomainFor(
      failure.category,
    );

  const failureStage =
    failureStageFor(
      failure.category,
    );

  const eligibility =
    learningEligibility({
      verified,
      failureCategory:
        failure.category,
      failureDomain,
    });

  const compile =
    record(
      input.output
        ?.compile,
    );

  const tests =
    record(
      input.output
        ?.tests,
    );

  const generatedFiles =
    Array.isArray(
      input.output
        ?.generatedFiles,
    )
      ? input.output
          ?.generatedFiles
      : Array.isArray(
          input.output
            ?.projectFiles,
        )
        ? input.output
            ?.projectFiles
        : null;

  const rawVerificationAttempts =
    input.output
      ?.verificationAttempts;

  const verificationAttempts =
    typeof rawVerificationAttempts ===
        'number' &&
      Number.isFinite(
        rawVerificationAttempts,
      )
      ? nonNegativeInt(
          rawVerificationAttempts,
        )
      : null;

  const repairRounds =
    routing.reduce(
      (
        maximum,
        outcome,
      ) =>
        Math.max(
          maximum,
          outcome.repairLoops,
        ),

      0,
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

    failureDomain,

    failureStage,

    verified,

    taxonomyId:
      learningContext
        .taxonomyId,

    productSurface:
      learningContext
        .productSurface,

    productSubtype:
      learningContext
        .productSubtype,

    domainCategory:
      learningContext
        .domainCategory,

    recipeId:
      learningContext
        .recipeId,

    goldenExampleIds:
      learningContext
        .goldenExampleIds,

    framework:
      learningContext
        .framework,

    runtime:
      learningContext
        .runtime,

    adapterId:
      learningContext
        .adapterId,

    generatedFileCount:
      generatedFiles
        ? generatedFiles.length
        : null,

    verificationAttempts,

    repairRounds,

    buildPassed:
      booleanField(
        compile?.ok,
      ),

    testPassed:
      booleanField(
        tests?.ok,
      ),

    browserPassed:
      browserOutcome(
        input.output,
      ),

    runtimePassed:
      statusBoolean(
        runtimeStatus,
      ),

    savedProjectReady:
      persistenceStatus ===
        'succeeded' ||
      Boolean(
        record(
          input.output
            ?.projectRevision,
        ),
      ),

    publicationRequested:
      publicationStatus !==
        null &&
      publicationStatus !==
        'not_requested',

    publicationSucceeded:
      publicationStatus ===
        'succeeded',

    deploymentRequested:
      deploymentStatus !==
        null &&
      deploymentStatus !==
        'not_requested',

    deploymentSucceeded:
      deploymentStatus ===
        'succeeded',

    learningEligible:
      eligibility.eligible,

    learningExclusionReason:
      eligibility.reason,

    learningDecision:
      learningContext
        .learningDecision,

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

            failure_domain:
              outcome.failureDomain,

            failure_stage:
              outcome.failureStage,

            verified:
              outcome.verified,

            taxonomy_id:
              outcome.taxonomyId,

            product_surface:
              outcome.productSurface,

            product_subtype:
              outcome.productSubtype,

            domain_category:
              outcome.domainCategory,

            recipe_id:
              outcome.recipeId,

            golden_example_ids:
              outcome.goldenExampleIds,

            framework:
              outcome.framework,

            runtime:
              outcome.runtime,

            adapter_id:
              outcome.adapterId,

            generated_file_count:
              outcome.generatedFileCount,

            verification_attempts:
              outcome.verificationAttempts,

            repair_rounds:
              outcome.repairRounds,

            build_passed:
              outcome.buildPassed,

            test_passed:
              outcome.testPassed,

            browser_passed:
              outcome.browserPassed,

            runtime_passed:
              outcome.runtimePassed,

            saved_project_ready:
              outcome.savedProjectReady,

            publication_requested:
              outcome.publicationRequested,

            publication_succeeded:
              outcome.publicationSucceeded,

            deployment_requested:
              outcome.deploymentRequested,

            deployment_succeeded:
              outcome.deploymentSucceeded,

            learning_eligible:
              outcome.learningEligible,

            learning_exclusion_reason:
              outcome.learningExclusionReason,

            learning_decision:
              outcome.learningDecision,

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
