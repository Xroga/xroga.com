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

import type {
  BuildContract,
} from './buildContract.js';

import {
  createAgentLivePreviewBridge,
} from './livePreview/agentBridge.js';

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

import {
  SupabaseSoftwareAgentCheckpointStore,
  inMemorySoftwareAgentCheckpointStore,
  type SoftwareAgentCheckpointStore,
} from '../ai/softwareAgent/softwareAgentCheckpoint.js';

import type {
  PreviewRequirement,
  SoftwareTaskKind,
} from '../ai/softwareAgent/contracts.js';

import type {
  UniversalRunPlan,
} from './universalFlow.js';

import {
  createStaticWebBootstrap,
} from './staticWebBootstrap.js';

export interface UniversalSoftwareImplementationInput {
  userId:
    string;

  runId:
    string;

  buildContract:
  BuildContract;

  projectId?:
    | string
    | null;

  prompt:
    string;

  brief:
    string;

  plan:
    UniversalRunPlan;

  existingFiles:
    readonly ProjectFile[];

  primaryModelId:
    ModelId;

  fallbackModelIds:
    readonly ModelId[];

  activeProjectContext?:
    ActiveProjectContext;

  signal?:
    AbortSignal;

  onEvent?: (
    event:
      SoftwareRunEvent,
  ) => void;

  checkpointStore?:
    SoftwareAgentCheckpointStore;

  runLegacy?: () =>
    Promise<
      readonly ProjectFile[]
    >;
}

const DEFINITELY_NON_BROWSER_SURFACES =
  new Set<
    string
  >([
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
  plan:
    UniversalRunPlan,
): string[] {
  return plan
    .spec
    .surfaces
    .map(
      (
        declaration,
      ) =>
        String(
          declaration.surface,
        ),
    );
}

function usesStaticWebArchitecture(
  plan:
    UniversalRunPlan,
): boolean {
  return plan
    .architecture
    .components
    .some(
      (
        component,
      ) =>
        component.adapterId ===
        'static-web',
    );
}

function staticWebConstraints(
  plan:
    UniversalRunPlan,
): string[] {
  if (
    !usesStaticWebArchitecture(
      plan,
    )
  ) {
    return [];
  }

  return [
    'STATIC WEB CONTRACT: The canonical Xroga architecture selected the dependency-free static-web runtime. Follow that architecture exactly.',

    'Create and preserve a directly servable browser project centered on index.html, with local CSS and JavaScript files as needed.',

    'Do not create package.json, package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lock, tsconfig.json, next.config.*, vite.config.*, or another package-manager/build-tool manifest.',

    'Do not introduce Next.js, React, Vue, Svelte, Angular, Vite, Tailwind build tooling, npm packages, or another framework unless the validated architecture itself explicitly selected that framework.',

    'Do not run npm install, npm view, npx, pnpm, yarn, bun install, or package-registry discovery for this static-web project.',

    'Use browser-native HTML, CSS, and JavaScript only.',

    'The finished product must work when index.html and its local assets are served by Xroga static preview infrastructure.',

    'All local href/src references required by the page must point to files that exist in the workspace.',

    'A greenfield static-web workspace may already contain a deterministic Xroga bootstrap. Improve it rather than deleting correct sections merely to recreate boilerplate.',

    'For this architecture, dependency installation is not an implementation requirement and must not be invented as a verification step.',
  ];
}

function taskKindFor(
  plan:
    UniversalRunPlan,

  existingFiles:
    readonly ProjectFile[],
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
  plan:
    UniversalRunPlan,
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
      owner:
        string;

      repo:
        string;

      branch:
        string;
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
  input:
    Pick<
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
    failureMessage?:
      string;

    blockers:
      readonly string[];
  },
): Error & {
  code:
    'SOFTWARE_IMPLEMENTATION_FAILED';

  safeReasons:
    string[];
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

function checkpointStoreFor(
  input:
    UniversalSoftwareImplementationInput,
): SoftwareAgentCheckpointStore {
  if (
    input.checkpointStore
  ) {
    return input
      .checkpointStore;
  }

  if (
    process.env
      .SUPABASE_SERVICE_ROLE_KEY
  ) {
    return new SupabaseSoftwareAgentCheckpointStore(
      input.userId,
    );
  }

  return inMemorySoftwareAgentCheckpointStore;
}

export async function runUniversalSoftwareImplementation(
  input:
    UniversalSoftwareImplementationInput,
): Promise<
  readonly ProjectFile[]
> {
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

  const modelTelemetry = {
    actualModels:
      new Set<
        string
      >(),

    actualProviders:
      new Set<
        string
      >(),

    fallbackUsed:
      false,

    fallbackReasons:
      new Set<
        string
      >(),

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

  const diagnosticEvents =
  new InMemorySoftwareRunEventSink();

  const repository =
    repositoryFromContext(
      input.activeProjectContext,
    );

  const staticWeb =
    usesStaticWebArchitecture(
      input.plan,
    );

  /*
   * The connected repository itself is still authoritative.
   *
   * We bootstrap only:
   * - static-web architecture
   * - completely empty repository
   *
   * Existing repositories are never replaced by this fallback.
   */
  const agentInitialFiles:
    readonly ProjectFile[] =
    staticWeb &&
    input.existingFiles.length ===
      0
      ? createStaticWebBootstrap(
          input.prompt,
        )
      : input.existingFiles;

  const implementationConstraints = [
    input.brief,

    'Treat Xroga planner architecture decisions as authoritative.',

    'Preserve unrelated repository files and make the smallest coherent change.',

    'Do not merge, deploy, or persist a repository branch from inside the implementation phase.',

'This phase owns implementation only. The outer UniversalExecution verifier owns deterministic checks, browser verification, repair acceptance, review, and final verification.',
    'If this run was restored from a checkpoint, continue from the checkpointed workspace rather than rebuilding correct work from scratch.',

    ...staticWebConstraints(
      input.plan,
    ),
  ];

  const checkpointStore =
  checkpointStoreFor(
    input,
  );

const livePreviewBridge =
  createAgentLivePreviewBridge({
    userId:
      input.userId,

    runId:
      input.runId,

    buildContract:
      input.buildContract,

    plan:
      input.plan,

    baseFiles:
      agentInitialFiles,

    checkpointStore,

    emit:
      input.onEvent,
  });

const eventObserver =
  input.onEvent
    ? (
        event:
          SoftwareRunEvent,
      ) => {
        input.onEvent?.(
          event,
        );

        livePreviewBridge
          .handle(
            event,
          );
      }
    : undefined;

const events =
  new SwarmRunSoftwareEventSink(
    diagnosticEvents,
    eventObserver,
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

        /*
         * Use the real repository state here.
         *
         * The deterministic bootstrap must not turn a greenfield task into
         * "existing_repo_change".
         */
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

        allowedPaths:
          [],

        deniedPaths:
          [],

        allowCreate:
          true,

        allowDelete:
          true,

        allowRename:
          true,

        preview:
          previewRequirementFor(
            input.plan,
          ),
verificationAuthority:
  'universal',
        /*
         * Publication belongs to the outer verified Universal pipeline.
         */
        persistence:
          'none',

        deployment:
          'forbidden',

        acceptanceCriteria:
          input
            .plan
            .acceptance
            .map(
              (
                criterion,
              ) => ({
                id:
                  criterion.id,

                description:
                  criterion
                    .statement,

                required:
                  criterion
                    .required,
              }),
            ),

        constraints:
          implementationConstraints,
      },

      agentV2: {
        bindings,

        model,

        events,

        initialFiles:
          agentInitialFiles
            .map(
              (
                file,
              ) => ({
                path:
                  file.path,

                content:
                  file.content,
              }),
            ),

        signal:
          input.signal,

        checkpointStore,
      },
    });

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
        runtime
          .result
          .status,

      iterations:
        runtime
          .result
          .iterations,

      eventCount:
        diagnosticEvents
          .getEvents()
          .length,

      checkpointing:
        process.env
          .SUPABASE_SERVICE_ROLE_KEY
          ? 'durable'
          : 'process-local',

      staticWebArchitecture:
        staticWeb,

      deterministicBootstrapFiles:
        staticWeb &&
        input.existingFiles.length ===
          0
          ? agentInitialFiles.length
          : 0,
    }),
  );

  /*
   * This is the important resilience boundary.
   *
   * A provider can fail after, or even before, Agent V2 improves the
   * deterministic static workspace.
   *
   * We do NOT publish here.
   *
   * We return the best non-empty workspace to UniversalExecution, which
   * remains responsible for:
   *
   * - deterministic checks
   * - real browser Preview
   * - review
   * - verified gate
   * - GitHub commit
   *
   * Therefore a provider outage no longer destroys a valid static product,
   * while broken files still cannot pass the outer verified gate.
   */
  const files =
    runtime
      .result
      .workspace
      .getFiles();

  if (
    files.length ===
    0
  ) {
    throw softwareAgentFailure({
      failureMessage:
        runtime
          .result
          .failureMessage ??
        'Software Agent V2 produced an empty project snapshot.',

      blockers:
        runtime
          .result
          .blockers,
    });
  }

  if (
  runtime
    .result
    .status !==
  'implemented'
) {
    console.warn(
      '[software_agent_v2_implementation_incomplete]',

      JSON.stringify({
        runId:
          input.runId,

        status:
          runtime
            .result
            .status,

        failureCode:
          runtime
            .result
            .failureCode,

        failureMessage:
          runtime
            .result
            .failureMessage,

        blockers:
          runtime
            .result
            .blockers
            .slice(
              0,
              4,
            ),

        preservedFiles:
          files.length,

        staticWebArchitecture:
          staticWeb,

        deterministicBootstrapActive:
          staticWeb &&
          input.existingFiles.length ===
            0,

        action:
          'returning workspace to outer universal verification',
      }),
    );
  }

  return files;
}
