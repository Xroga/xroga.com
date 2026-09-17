import type {
  ProjectFile,
} from '../ai/patches.js';

import type {
  ModelId,
} from '../ai/models.js';

import {
  assertCodingModel,
} from '../ai/providerPolicy.js';

import type {
  ActiveProjectContext,
} from '../ai/universal/projectContext.js';

import {
  createXrogaSoftwareAgentBindings,
} from '../ai/softwareAgent/createXrogaSoftwareAgentBindings.js';

import {
  createSoftwareAgentProductionImplementations,
} from '../ai/softwareAgent/softwareAgentProductionInfrastructure.js';

import {
  createXrogaAgentModelRoute,
} from '../ai/softwareAgent/xrogaAgentModel.js';

import {
  InMemorySoftwareRunEventSink,
} from '../ai/softwareAgent/runEvents.js';

import type {
  SoftwareRunEvent,
} from '../ai/softwareAgent/runEvents.js';

import {
  SwarmRunSoftwareEventSink,
} from '../ai/softwareAgent/swarmRunSoftwareEventSink.js';

import {
  runSoftwareAgentRuntime,
} from '../ai/softwareAgent/SoftwareAgentRuntime.js';

import type {
  PreviewRequirement,
  SoftwareTaskKind,
} from '../ai/softwareAgent/contracts.js';

import type {
  UniversalRunPlan,
} from './universalFlow.js';

export interface UniversalSoftwareImplementationInput {
  userId: string;

  runId: string;

  projectId?: string | null;

  prompt: string;

  brief: string;

  plan: UniversalRunPlan;

  existingFiles: readonly ProjectFile[];

  primaryModelId: ModelId;

  fallbackModelIds: readonly ModelId[];

  activeProjectContext?: ActiveProjectContext;

  signal?: AbortSignal;

  /**
   * Public Software Agent V2 activity callback.
   *
   * These are public execution-evidence events only — never hidden model
   * reasoning.
   *
   * When supplied by the live pipeline, the outer progress system owns
   * persistence and SSE delivery.
   */
  onEvent?: (
    event: SoftwareRunEvent,
  ) => void;

  /**
   * Temporary source-compatibility field.
   *
   * Agent V2 is authoritative. This callback is intentionally never
   * evaluated.
   */
  runLegacy?: () => Promise<readonly ProjectFile[]>;
}

const DEFINITELY_NON_BROWSER_SURFACES =
  new Set<string>([
    'api',
    'worker',
    'scheduled_job',
    'cli',
    'library',
    'sdk',
    'mobile_app',
    'desktop_app',
    'cms_plugin',
    'game',
    'smart_contract',
    'blockchain_program',
    'indexer',
    'data_pipeline',
    'etl',
    'stream_processor',
    'ai_pipeline',
    'mcp_server',
    'webhook_service',
    'infrastructure_module',
    'embedded_app',
    'database_package',
    'devtool',
    'plugin',
    'package',
    'daemon',
    'background_service',
  ]);

function surfacesOf(
  plan: UniversalRunPlan,
): string[] {
  return plan.spec.surfaces.map(
    (
      declaration,
    ) =>
      String(
        declaration.surface,
      ),
  );
}

function taskKindFor(
  plan: UniversalRunPlan,
  existingFiles: readonly ProjectFile[],
): SoftwareTaskKind {
  if (
    existingFiles.length >
    0
  ) {
    return 'existing_repo_change';
  }

  const surfaces =
    new Set(
      surfacesOf(
        plan,
      ),
    );

  if (
    surfaces.has(
      'web_frontend',
    )
  ) {
    return 'web_app';
  }

  if (
    surfaces.has(
      'api',
    ) ||
    surfaces.has(
      'webhook_service',
    ) ||
    surfaces.has(
      'mcp_server',
    )
  ) {
    return 'api';
  }

  if (
    surfaces.has(
      'cli',
    ) ||
    surfaces.has(
      'devtool',
    )
  ) {
    return 'cli';
  }

  if (
    surfaces.has(
      'library',
    ) ||
    surfaces.has(
      'sdk',
    ) ||
    surfaces.has(
      'package',
    )
  ) {
    return 'library';
  }

  if (
    surfaces.has(
      'documentation_site',
    )
  ) {
    return 'documentation';
  }

  return 'new_project';
}

function previewRequirementFor(
  plan: UniversalRunPlan,
): PreviewRequirement {
  const surfaces =
    surfacesOf(
      plan,
    );

  if (
    surfaces.includes(
      'web_frontend',
    ) ||
    surfaces.includes(
      'documentation_site',
    )
  ) {
    return 'required';
  }

  if (
    surfaces.length >
      0 &&
    surfaces.every(
      (
        surface,
      ) =>
        DEFINITELY_NON_BROWSER_SURFACES.has(
          surface,
        ),
    )
  ) {
    return 'not_applicable';
  }

  return 'optional';
}

function repositoryFromContext(
  context:
    | ActiveProjectContext
    | undefined,
):
  | {
      owner: string;
      repo: string;
      branch: string;
    }
  | undefined {
  if (
    !context
  ) {
    return undefined;
  }

  const [
    owner,
    repo,
  ] =
    context.repo.split(
      '/',
    );

  if (
    !owner ||
    !repo
  ) {
    throw new Error(
      'SOFTWARE_AGENT_INVALID_PROJECT_CONTEXT',
    );
  }

  return {
    owner,

    repo,

    branch:
      context.branch,
  };
}

function implementationGoal(
  input: Pick<
    UniversalSoftwareImplementationInput,
    | 'prompt'
    | 'brief'
  >,
): string {
  return [
    input.prompt.trim(),
    '',
    'Xroga planner contract:',
    input.brief.trim(),
  ]
    .filter(
      Boolean,
    )
    .join(
      '\n',
    );
}

function softwareAgentFailure(
  result: {
    failureMessage?: string;
    blockers: readonly string[];
  },
): Error & {
  code: 'SOFTWARE_IMPLEMENTATION_FAILED';
  safeReasons: string[];
} {
  const safeReasons =
    [
      result.failureMessage,
      ...result.blockers,
    ]
      .filter(
        (
          value,
        ): value is string =>
          typeof value ===
            'string' &&
          value
            .trim()
            .length >
            0,
      )
      .map(
        (
          value,
        ) =>
          value
            .trim()
            .slice(
              0,
              220,
            ),
      )
      .slice(
        0,
        2,
      );

  const error =
    new Error(
      safeReasons[0] ??
        'Software Agent V2 did not reach verified completion.',
    ) as Error & {
      code:
        'SOFTWARE_IMPLEMENTATION_FAILED';

      safeReasons:
        string[];
    };

  error.code =
    'SOFTWARE_IMPLEMENTATION_FAILED';

  error.safeReasons =
    safeReasons.length
      ? safeReasons
      : [
          'the software agent did not reach verified completion',
        ];

  return error;
}

/**
 * Production bridge between Universal engineering and Software Agent V2.
 *
 * Agent V2 owns implementation.
 *
 * The outer Universal pipeline continues to own:
 *
 * - product/spec planning
 * - security requirements
 * - independent deterministic validation
 * - final browser verification
 * - final review
 * - repository publication
 *
 * Agent V2 events use Xroga's existing build/run delivery path.
 *
 * IMPORTANT:
 *
 * This layer intentionally sets no total implementation timeout and no
 * fixed total verification-round count.
 *
 * Product completion is evidence-driven, not clock-driven.
 */
export async function runUniversalSoftwareImplementation(
  input: UniversalSoftwareImplementationInput,
): Promise<readonly ProjectFile[]> {
  assertCodingModel(
    input.primaryModelId,
    'universal software-agent primary model',
  );

  for (
    const fallbackModelId of
    input.fallbackModelIds
  ) {
    assertCodingModel(
      fallbackModelId,
      'universal software-agent fallback model',
    );
  }

  const bindings =
    createXrogaSoftwareAgentBindings({
      userId:
        input.userId,

      implementations:
        createSoftwareAgentProductionImplementations(),
    });

  /**
   * Aggregate every Cline/model turn used during this implementation.
   *
   * A single software build can contain many model turns, so storing only
   * the final turn would make fallback telemetry misleading.
   */
  const modelTelemetry = {
    actualModels:
      new Set<string>(),

    actualProviders:
      new Set<string>(),

    fallbackUsed:
      false,

    fallbackReasons:
      new Set<string>(),

    fallbackFailureCount:
      0,

    turnCount:
      0,
  };

  const model =
    createXrogaAgentModelRoute({
      userId:
        input.userId,

      runId:
        input.runId,

      modelId:
        input.primaryModelId,

      fallbackModelIds:
        input.fallbackModelIds,

      onTelemetry:
        (
          telemetry,
        ) => {
          modelTelemetry
            .turnCount +=
            1;

          modelTelemetry
            .actualModels
            .add(
              telemetry
                .actualModelId,
            );

          modelTelemetry
            .actualProviders
            .add(
              telemetry
                .actualProvider,
            );

          modelTelemetry
            .fallbackFailureCount +=
            telemetry
              .fallbackFailureCount;

          if (
            telemetry
              .fallbackUsed
          ) {
            modelTelemetry
              .fallbackUsed =
              true;

            if (
              telemetry
                .fallbackReason
            ) {
              modelTelemetry
                .fallbackReasons
                .add(
                  telemetry
                    .fallbackReason,
                );
            }
          }
        },
    });

  /*
   * Keep a diagnostic mirror for tests and server diagnostics.
   *
   * SwarmRunSoftwareEventSink itself decides whether the outer live pipeline
   * or direct persistence owns delivery, preventing duplicate run events.
   */
  const diagnosticEvents =
    new InMemorySoftwareRunEventSink();

  const events =
    new SwarmRunSoftwareEventSink(
      diagnosticEvents,
      input.onEvent,
    );

  const repository =
    repositoryFromContext(
      input.activeProjectContext,
    );

  const runtime =
    await runSoftwareAgentRuntime({
      contract: {
        runId:
          input.runId,

        ...(
          input.projectId
            ? {
                projectId:
                  input.projectId,
              }
            : {}
        ),

        goal:
          implementationGoal(
            input,
          ),

        taskKind:
          taskKindFor(
            input.plan,
            input.existingFiles,
          ),

        ...(
          repository
            ? {
                repository,
              }
            : {}
        ),

        /*
         * Universal implementation currently authorizes repository-wide
         * implementation. Individual filesystem safety controls still apply.
         */
        allowedPaths:
          [],

        deniedPaths:
          [],

        allowCreate:
          true,

        /*
         * Delete and rename remain closed until the outer snapshot/commit
         * contract carries those mutations truthfully.
         */
        allowDelete:
          false,

        allowRename:
          false,

        preview:
          previewRequirementFor(
            input.plan,
          ),

        /*
         * Universal owns repository publication.
         */
        persistence:
          'none',

        deployment:
          'forbidden',

        acceptanceCriteria:
          input.plan.acceptance.map(
            (
              criterion,
            ) => ({
              id:
                criterion.id,

              description:
                criterion.statement,

              required:
                criterion.required,
            }),
          ),

        constraints: [
          input.brief,
          'Treat Xroga planner architecture decisions as authoritative.',
          'Preserve unrelated repository files and make the smallest coherent change.',
          'Do not merge, deploy, or persist a repository branch from inside the implementation phase.',
          'Use Xroga deterministic checks and browser verification when applicable before claiming completion.',
        ],
      },

      agentV2: {
        bindings,

        model,

        events,

        initialFiles:
          input.existingFiles.map(
            (
              file,
            ) => ({
              path:
                file.path,

              content:
                file.content,
            }),
          ),

        /*
         * Caller cancellation remains supported.
         *
         * There is deliberately no total timeoutMs and no fixed
         * verificationRounds value here.
         */
        signal:
          input.signal,
      },
    });

  /**
   * One summary record for the complete implementation run.
   *
   * This makes operational debugging answer:
   *
   * - which builder ran
   * - which model was requested
   * - which model(s) actually ran
   * - whether fallback happened
   * - why fallback happened
   * - how many Agent V2 turns happened
   * - whether Agent V2 reached verified completion
   */
  console.info(
    '[software_agent_v2_implementation]',
    JSON.stringify({
      runId:
        input.runId,

      builderVersion:
        'agent-v2',

      executor:
        runtime.executor,

      requestedModel:
        input.primaryModelId,

      configuredFallbackModels:
        input.fallbackModelIds,

      actualModelsUsed: [
        ...modelTelemetry
          .actualModels,
      ],

      actualProvidersUsed: [
        ...modelTelemetry
          .actualProviders,
      ],

      fallbackUsed:
        modelTelemetry
          .fallbackUsed,

      fallbackReasons: [
        ...modelTelemetry
          .fallbackReasons,
      ],

      fallbackFailureCount:
        modelTelemetry
          .fallbackFailureCount,

      modelTurnCount:
        modelTelemetry
          .turnCount,

      status:
        runtime.result.status,

      iterations:
        runtime.result.iterations,

      eventCount:
        diagnosticEvents
          .getEvents()
          .length,
    }),
  );

  if (
    runtime.result.status !==
    'verified'
  ) {
    throw softwareAgentFailure(
      runtime.result,
    );
  }

  const files =
    runtime.result.workspace
      .getFiles();

  if (
    files.length ===
    0
  ) {
    throw softwareAgentFailure({
      failureMessage:
        'Software Agent V2 produced an empty project snapshot.',

      blockers:
        [],
    });
  }

  return files;
}
