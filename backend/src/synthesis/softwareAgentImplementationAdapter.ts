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
   * The event already contains only public execution evidence — never
   * private model chain-of-thought.
   *
   * The next integration layer uses this callback to forward events into
   * the active HTTP/SSE build stream while the durable sink continues to
   * persist them independently.
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
    (declaration) =>
      String(declaration.surface),
  );
}

function taskKindFor(
  plan: UniversalRunPlan,
  existingFiles: readonly ProjectFile[],
): SoftwareTaskKind {
  if (existingFiles.length > 0) {
    return 'existing_repo_change';
  }

  const surfaces =
    new Set(
      surfacesOf(plan),
    );

  if (
    surfaces.has('web_frontend')
  ) {
    return 'web_app';
  }

  if (
    surfaces.has('api') ||
    surfaces.has('webhook_service') ||
    surfaces.has('mcp_server')
  ) {
    return 'api';
  }

  if (
    surfaces.has('cli') ||
    surfaces.has('devtool')
  ) {
    return 'cli';
  }

  if (
    surfaces.has('library') ||
    surfaces.has('sdk') ||
    surfaces.has('package')
  ) {
    return 'library';
  }

  if (
    surfaces.has('documentation_site')
  ) {
    return 'documentation';
  }

  return 'new_project';
}

function previewRequirementFor(
  plan: UniversalRunPlan,
): PreviewRequirement {
  const surfaces =
    surfacesOf(plan);

  if (
    surfaces.includes('web_frontend') ||
    surfaces.includes('documentation_site')
  ) {
    return 'required';
  }

  if (
    surfaces.length > 0 &&
    surfaces.every(
      (surface) =>
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
  if (!context) {
    return undefined;
  }

  const [
    owner,
    repo,
  ] =
    context.repo.split('/');

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
    .filter(Boolean)
    .join('\n');
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
          value.trim().length >
            0,
      )
      .map(
        (value) =>
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
 * Software Agent V2's execution events are now written into Xroga's existing
 * durable swarm-run history instead of disappearing inside a temporary
 * in-memory sink.
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

  const model =
    createXrogaAgentModelRoute({
      userId:
        input.userId,

      modelId:
        input.primaryModelId,

      fallbackModelIds:
        input.fallbackModelIds,
    });

  /*
   * Keep a diagnostic mirror because it is useful in logs/tests, but make
   * the durable swarm-run sink the production delivery path.
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

        ...(input.projectId
          ? {
              projectId:
                input.projectId,
            }
          : {}),

        goal:
          implementationGoal(
            input,
          ),

        taskKind:
          taskKindFor(
            input.plan,
            input.existingFiles,
          ),

        ...(repository
          ? {
              repository,
            }
          : {}),

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
            (criterion) => ({
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
            (file) => ({
              path:
                file.path,

              content:
                file.content,
            }),
          ),

        signal:
          input.signal,

        timeoutMs:
          8 * 60 * 1000,

        verificationRounds:
          2,
      },
    });

  console.info(
    '[software_agent_v2_implementation]',
    JSON.stringify({
      runId:
        input.runId,

      builderVersion:
        'agent-v2',

      primaryModel:
        input.primaryModelId,

      fallbackModels:
        input.fallbackModelIds,

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
