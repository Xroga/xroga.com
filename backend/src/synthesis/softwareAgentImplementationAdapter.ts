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
   * Temporary source-compatibility field for the current universal entrypoint.
   *
   * Agent V2 is authoritative. This callback is NEVER evaluated. It remains
   * in the input shape only so the final cleanup batch can remove the old
   * coherent-builder callback from universalEntrypoint.ts without coupling
   * that large-file cleanup to this production cutover.
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

  /*
   * Unknown or mixed surfaces remain optional. The outer universal path
   * still runs its own browser gate after deterministic validation, so
   * optional here never upgrades missing evidence into a verified claim.
   */
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
          value.trim().slice(
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
      safeReasons: string[];
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
 * Production bridge between the universal implementation phase and
 * Software Agent V2.
 *
 * Agent V2 is now the authoritative implementation engine.
 *
 * The universal pipeline still owns:
 * - product/spec planning
 * - architecture/security requirements
 * - deterministic validation
 * - browser verification
 * - review
 * - the final atomic repository commit
 *
 * The old coherent implementation callback may still be present on the
 * caller's object during this cutover batch, but this adapter never reads or
 * invokes it.
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

  const events =
    new InMemorySoftwareRunEventSink();

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
         * The universal implementation adapter currently authorizes
         * repository-wide implementation, matching the existing universal
         * path. Normal repository/path safety still applies.
         */
        allowedPaths:
          [],

        deniedPaths:
          [],

        allowCreate:
          true,

        /*
         * Deletion/rename stay closed during migration. The current
         * universal merge contract is upsert-oriented and cannot truthfully
         * carry a deletion through its final snapshot merge yet.
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
         * The outer universal pipeline owns publication. Agent V2 must not
         * create its own review branch or deployment from inside the
         * implementation phase.
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

        /*
         * Keep the universal request's existing bounded execution semantics.
         * AgentSoftwareExecutor clamps this to its own hard ceiling.
         */
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

      status:
        runtime.result.status,

      iterations:
        runtime.result
          .iterations,

      eventCount:
        events.getEvents()
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
