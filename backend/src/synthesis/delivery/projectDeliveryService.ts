import {
  getSupabaseAdmin,
} from '../../config/supabase.js';

import {
  deployToAllPlatforms,
  isGitHubConnected,
  pushBuildToGitHub,
} from '../../services/integrations/githubDeploy.js';

import {
  isVercelConnected,
} from '../../services/integrations/vercelAuth.js';

import {
  SupabaseProjectRuntimeStore,
} from '../projectRuntime/index.js';

import type {
  SoftwareProject,
  SoftwareProjectRepository,
} from '../softwareProject.js';

import {
  deliveryStateForProject,
  type ProjectDeliveryState,
} from './projectDelivery.js';

export interface ProjectPublicationEvidence {
  readonly status:
    'ready' |
    'failed';

  readonly repository:
    string | null;

  readonly repoUrl:
    string | null;

  readonly branch:
    string | null;

  readonly commitSha:
    string | null;

  readonly pullRequestUrl:
    string | null;

  readonly reason:
    string | null;

  readonly updatedAt:
    string;
}

export interface ProjectDeploymentEvidence {
  readonly status:
    'ready' |
    'failed';

  readonly provider:
    'vercel';

  readonly deploymentId:
    string | null;

  readonly url:
    string | null;

  readonly verified:
    boolean;

  readonly reason:
    string | null;

  readonly updatedAt:
    string;
}

export interface ProjectDeliveryEvidence {
  readonly publication:
    ProjectPublicationEvidence |
    null;

  readonly deployment:
    ProjectDeploymentEvidence |
    null;
}

export interface ProjectDeliveryIntegrations {
  readonly github: {
    readonly connected:
      boolean;
  };

  readonly vercel: {
    readonly connected:
      boolean;
  };
}

export interface ProjectDeliveryEnvelope {
  readonly delivery:
    ProjectDeliveryState;

  readonly evidence:
    ProjectDeliveryEvidence;

  readonly integrations:
    ProjectDeliveryIntegrations;

  readonly revision: {
    readonly revisionId:
      string;

    readonly revisionNumber:
      number;

    readonly createdAt:
      string;
  };
}

export class ProjectDeliveryActionError
  extends Error {
  constructor(
    readonly code:
      string,

    message:
      string,

    readonly statusCode =
      400,
  ) {
    super(
      message,
    );
  }
}

function text(
  value:
    unknown,
): string | null {
  return typeof value ===
    'string' &&
    value.trim()
    ? value.trim()
    : null;
}

function boolean(
  value:
    unknown,
): boolean {
  return value ===
    true;
}

function record(
  value:
    unknown,
): Record<
  string,
  unknown
> {
  return (
    value &&
    typeof value ===
      'object' &&
    !Array.isArray(
      value,
    )
  )
    ? value as Record<
        string,
        unknown
      >
    : {};
}

async function loadEvidence(
  userId:
    string,

  projectId:
    string,
): Promise<ProjectDeliveryEvidence> {
  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
      .from(
        'project_runtime_events',
      )
      .select(
        'event_type, payload, created_at',
      )
      .eq(
        'user_id',
        userId,
      )
      .eq(
        'project_id',
        projectId,
      )
      .in(
        'event_type',
        [
          'publication.completed',
          'publication.failed',
          'deployment.ready',
          'deployment.failed',
        ],
      )
      .order(
        'created_at',
        {
          ascending:
            false,
        },
      )
      .limit(
        40,
      );

  if (
    error
  ) {
    throw error;
  }

  let publication:
    ProjectPublicationEvidence |
    null =
      null;

  let deployment:
    ProjectDeploymentEvidence |
    null =
      null;

  for (
    const row of
    data ??
    []
  ) {
    const eventType =
      String(
        row.event_type ??
        '',
      );

    const payload =
      record(
        row.payload,
      );

    const updatedAt =
      String(
        row.created_at ??
        new Date()
          .toISOString(),
      );

    if (
      !publication &&
      (
        eventType ===
          'publication.completed' ||
        eventType ===
          'publication.failed'
      )
    ) {
      publication = {
        status:
          eventType ===
            'publication.completed'
            ? 'ready'
            : 'failed',

        repository:
          text(
            payload.repository,
          ),

        repoUrl:
          text(
            payload.repoUrl,
          ),

        branch:
          text(
            payload.branch,
          ),

        commitSha:
          text(
            payload.commitSha,
          ),

        pullRequestUrl:
          text(
            payload.pullRequestUrl,
          ),

        reason:
          text(
            payload.reason,
          ),

        updatedAt,
      };
    }

    if (
      !deployment &&
      (
        eventType ===
          'deployment.ready' ||
        eventType ===
          'deployment.failed'
      )
    ) {
      deployment = {
        status:
          eventType ===
            'deployment.ready'
            ? 'ready'
            : 'failed',

        provider:
          'vercel',

        deploymentId:
          text(
            payload.deploymentId,
          ),

        url:
          text(
            payload.url,
          ),

        verified:
          boolean(
            payload.verified,
          ),

        reason:
          text(
            payload.reason,
          ),

        updatedAt,
      };
    }

    if (
      publication &&
      deployment
    ) {
      break;
    }
  }

  return {
    publication,
    deployment,
  };
}

function latestUpdatedAt(
  base:
    string,

  evidence:
    ProjectDeliveryEvidence,
): string {
  const values = [
    base,

    evidence
      .publication
      ?.updatedAt,

    evidence
      .deployment
      ?.updatedAt,
  ]
    .filter(
      (
        value,
      ): value is string =>
        Boolean(
          value,
        ),
    )
    .map(
      (
        value,
      ) => ({
        value,

        time:
          Date.parse(
            value,
          ),
      }),
    )
    .filter(
      (
        item,
      ) =>
        Number.isFinite(
          item.time,
        ),
    )
    .sort(
      (
        left,
        right,
      ) =>
        right.time -
        left.time,
    );

  return (
    values[0]
      ?.value ??
    base
  );
}

export function mergeProjectDeliveryState(
  base:
    ProjectDeliveryState,

  evidence:
    ProjectDeliveryEvidence,
): ProjectDeliveryState {
  const publication =
    evidence.publication
      ? {
          requested:
            true,

          status:
            evidence
              .publication
              .status,

          repository:
            evidence
              .publication
              .repository,

          branch:
            evidence
              .publication
              .branch,

          commitSha:
            evidence
              .publication
              .commitSha,

          reason:
            evidence
              .publication
              .reason,
        }
      : base.publication;

  const deployment =
    evidence.deployment
      ? {
          requested:
            true,

          status:
            evidence
              .deployment
              .status,

          provider:
            evidence
              .deployment
              .provider,

          deploymentId:
            evidence
              .deployment
              .deploymentId,

          url:
            evidence
              .deployment
              .url,

          reason:
            evidence
              .deployment
              .reason,
        }
      : base.deployment;

  const publicationReady =
    !publication
      .requested ||
    publication
      .status ===
      'ready';

  const deploymentReady =
    !deployment
      .requested ||
    deployment
      .status ===
      'ready';

  const status:
    ProjectDeliveryState[
      'status'
    ] =
    base.savedProject
      .status !==
      'ready'
      ? 'blocked'
      : (
          base.verification
            .status ===
            'ready' &&
          publicationReady &&
          deploymentReady
        )
        ? 'ready'
        : 'partial';

  return {
    ...base,

    status,

    publication,

    deployment,

    updatedAt:
      latestUpdatedAt(
        base.updatedAt,
        evidence,
      ),
  };
}

async function integrations(
  userId:
    string,
): Promise<ProjectDeliveryIntegrations> {
  const [
    github,
    vercel,
  ] =
    await Promise.all([
      isGitHubConnected(
        userId,
      ).catch(
        () =>
          false,
      ),

      isVercelConnected(
        userId,
      ).catch(
        () =>
          false,
      ),
    ]);

  return {
    github: {
      connected:
        github,
    },

    vercel: {
      connected:
        vercel,
    },
  };
}

export async function loadProjectDelivery(
  userId:
    string,

  projectId:
    string,
): Promise<ProjectDeliveryEnvelope> {
  const store =
    new SupabaseProjectRuntimeStore();

  const [
    revision,
    evidence,
    connected,
  ] =
    await Promise.all([
      store
        .loadLatestRevision(
          userId,
          projectId,
        ),

      loadEvidence(
        userId,
        projectId,
      ),

      integrations(
        userId,
      ),
    ]);

  if (
    !revision
  ) {
    throw new ProjectDeliveryActionError(
      'PROJECT_NOT_FOUND',

      'Project not found.',

      404,
    );
  }

  return {
    delivery:
      mergeProjectDeliveryState(
        deliveryStateForProject(
          revision.project,
        ),

        evidence,
      ),

    evidence,

    integrations:
      connected,

    revision: {
      revisionId:
        revision
          .revisionId,

      revisionNumber:
        revision
          .revisionNumber,

      createdAt:
        revision
          .createdAt,
    },
  };
}

function projectSlug(
  project:
    SoftwareProject,
): string {
  const source =
    project.repository
      ?.repo ??
    project.projectId;

  return (
    source
      .toLowerCase()
      .replace(
        /[^a-z0-9-]+/g,
        '-',
      )
      .replace(
        /^-+|-+$/g,
        '',
      )
      .slice(
        0,
        80,
      ) ||
    'xroga-project'
  );
}

async function appendProjectEvent(
  input: {
    userId:
      string;

    projectId:
      string;

    eventType:
      string;

    payload:
      Readonly<
        Record<
          string,
          unknown
        >
      >;
  },
): Promise<void> {
  const store =
    new SupabaseProjectRuntimeStore();

  await store
    .appendEvent({
      userId:
        input.userId,

      projectId:
        input.projectId,

      eventType:
        input.eventType,

      payload:
        input.payload,
    });
}

async function saveDeliveryLifecycle(
  input: {
    userId:
      string;

    project:
      SoftwareProject;

    phase:
      'publication' |
      'deployment';

    status:
      'succeeded' |
      'failed';

    detail:
      string;

    repository?:
      SoftwareProjectRepository |
      null;
  },
): Promise<SoftwareProject> {
  const now =
    new Date()
      .toISOString();

  const next:
    SoftwareProject = {
    ...input.project,

    ...(
      input.repository !==
      undefined
        ? {
            repository:
              input.repository,
          }
        : {}
    ),

    lifecycle: {
      ...input
        .project
        .lifecycle,

      [input.phase]: {
        status:
          input.status,

        detail:
          input.detail,
      },
    },

    updatedAt:
      now,
  };

  const store =
    new SupabaseProjectRuntimeStore();

  await store
    .saveRevision(
      input.userId,
      next,
    );

  return next;
}

async function emitReadyIfComplete(
  userId:
    string,

  projectId:
    string,
): Promise<void> {
  const envelope =
    await loadProjectDelivery(
      userId,
      projectId,
    );

  if (
    envelope.delivery
      .status !==
    'ready'
  ) {
    return;
  }

  await appendProjectEvent({
    userId,

    projectId,

    eventType:
      'delivery.ready',

    payload: {
      runId:
        envelope.delivery
          .runId,

      status:
        'ready',

      archive:
        envelope.delivery
          .archive
          .href,

      repository:
        envelope.delivery
          .publication
          .repository,

      deploymentUrl:
        envelope.delivery
          .deployment
          .url,
    },
  });
}

export interface PublishProjectDeliveryInput {
  readonly repository?:
    string;

  readonly branch?:
    string;

  readonly directWriteAuthorized?:
    boolean;

  readonly visibility?:
    'private' |
    'public';
}

export async function publishProjectDelivery(
  userId:
    string,

  projectId:
    string,

  input:
    PublishProjectDeliveryInput =
      {},
): Promise<ProjectDeliveryEnvelope> {
  const store =
    new SupabaseProjectRuntimeStore();

  const revision =
    await store
      .loadLatestRevision(
        userId,
        projectId,
      );

  if (
    !revision
  ) {
    throw new ProjectDeliveryActionError(
      'PROJECT_NOT_FOUND',

      'Project not found.',

      404,
    );
  }

  const project =
    revision.project;

  if (
    !project.verification
      .verified
  ) {
    throw new ProjectDeliveryActionError(
      'PROJECT_NOT_VERIFIED',

      'The project must pass verification before GitHub publication.',

      409,
    );
  }

  if (
    !(
      await isGitHubConnected(
        userId,
      )
    )
  ) {
    throw new ProjectDeliveryActionError(
      'GITHUB_NOT_CONNECTED',

      'Connect GitHub before publishing this project.',

      409,
    );
  }

  const currentRepository =
    project.repository
      ? `${project.repository.owner}/${project.repository.repo}`
      : null;

  const targetRepository =
    input.repository
      ?.trim() ||
    currentRepository ||
    project.contract
      .repository
      ?.repo ||
    undefined;

  const targetBranch =
    input.branch
      ?.trim() ||
    project.repository
      ?.baseBranch ||
    project.contract
      .repository
      ?.branch ||
    project.repository
      ?.branch ||
    'main';

  try {
    const result =
      await pushBuildToGitHub(
        userId,

        project.workspace
          .files,

        {
          slug:
            projectSlug(
              project,
            ),

          targetRepo:
            targetRepository,

          targetBranch,

          deletePaths:
            project.changeSet
              .deleted,

          runId:
            project.runId,

          directWriteAuthorized:
            input
              .directWriteAuthorized ===
            true,

          allowEmptyBootstrap:
            true,

          visibility:
            input.visibility ??
            'private',
        },
      );

    if (
      !result.commitSha
    ) {
      throw new Error(
        'GitHub did not return a resulting commit SHA.',
      );
    }

    const [
      owner,
      repo,
    ] =
      result.repoName
        .split(
          '/',
        );

    if (
      !owner ||
      !repo
    ) {
      throw new Error(
        'GitHub returned an invalid repository identity.',
      );
    }

    const repository:
      SoftwareProjectRepository = {
      owner,

      repo,

      branch:
        result.branch ??
        targetBranch,

      baseBranch:
        targetBranch,

      commitSha:
        result.commitSha,
    };

    await saveDeliveryLifecycle({
      userId,

      project,

      phase:
        'publication',

      status:
        'succeeded',

      detail:
        `Published commit ${result.commitSha}.`,

      repository,
    });

    await appendProjectEvent({
      userId,

      projectId,

      eventType:
        'publication.completed',

      payload: {
        repository:
          result.repoName,

        repoUrl:
          result.htmlUrl,

        branch:
          repository.branch,

        commitSha:
          result.commitSha,

        pullRequestUrl:
          result.pullRequestUrl ??
          null,

        warning:
          result.warning ??
          null,

        reason:
          null,
      },
    });

    await emitReadyIfComplete(
      userId,
      projectId,
    );

    return loadProjectDelivery(
      userId,
      projectId,
    );
  } catch (
    error
  ) {
    const reason =
      error instanceof
        Error
        ? error.message
        : String(
            error,
          );

    await appendProjectEvent({
      userId,

      projectId,

      eventType:
        'publication.failed',

      payload: {
        repository:
          targetRepository ??
          null,

        branch:
          targetBranch,

        reason:
          reason.slice(
            0,
            500,
          ),
      },
    }).catch(
      () => {},
    );

    await saveDeliveryLifecycle({
      userId,

      project,

      phase:
        'publication',

      status:
        'failed',

      detail:
        reason.slice(
          0,
          500,
        ),
    }).catch(
      () => {},
    );

    throw new ProjectDeliveryActionError(
      'GITHUB_PUBLICATION_FAILED',

      reason,

      502,
    );
  }
}

export async function deployProjectDelivery(
  userId:
    string,

  projectId:
    string,
): Promise<ProjectDeliveryEnvelope> {
  const store =
    new SupabaseProjectRuntimeStore();

  const revision =
    await store
      .loadLatestRevision(
        userId,
        projectId,
      );

  if (
    !revision
  ) {
    throw new ProjectDeliveryActionError(
      'PROJECT_NOT_FOUND',

      'Project not found.',

      404,
    );
  }

  const project =
    revision.project;

  if (
    !project.verification
      .verified
  ) {
    throw new ProjectDeliveryActionError(
      'PROJECT_NOT_VERIFIED',

      'The project must pass verification before deployment.',

      409,
    );
  }

  if (
    !(
      await isVercelConnected(
        userId,
      )
    )
  ) {
    throw new ProjectDeliveryActionError(
      'VERCEL_NOT_CONNECTED',

      'Connect Vercel before deploying this project.',

      409,
    );
  }

  const repository =
    project.repository
      ? `${project.repository.owner}/${project.repository.repo}`
      : undefined;

  try {
    /*
     * This deploys directly from the canonical current workspace.
     *
     * GitHub is optional.
     *
     * githubRepo is supplied only when publication evidence already exists,
     * allowing Vercel to link the repository without making it mandatory.
     */
    const result =
      await deployToAllPlatforms(
        projectSlug(
          project,
        ),

        project.workspace
          .files,

        userId,

        {
          githubRepo:
            repository,

          githubBranch:
            project.repository
              ?.branch,
        },
      );

    const vercel =
      result.vercel;

    if (
      !vercel ||
      vercel.authority !==
        'user' ||
      !vercel.deployVerified ||
      !vercel.deployUrl ||
      !vercel.vercelDeploymentId
    ) {
      throw new Error(
        vercel
          ?.error ||
        result.deployError ||
        'Vercel did not return a verified user-owned deployment.',
      );
    }

    await saveDeliveryLifecycle({
      userId,

      project,

      phase:
        'deployment',

      status:
        'succeeded',

      detail:
        `Verified Vercel deployment ${vercel.vercelDeploymentId}.`,
    });

    await appendProjectEvent({
      userId,

      projectId,

      eventType:
        'deployment.ready',

      payload: {
        provider:
          'vercel',

        deploymentId:
          vercel
            .vercelDeploymentId,

        url:
          vercel.deployUrl,

        verified:
          true,

        reason:
          null,
      },
    });

    await emitReadyIfComplete(
      userId,
      projectId,
    );

    return loadProjectDelivery(
      userId,
      projectId,
    );
  } catch (
    error
  ) {
    const reason =
      error instanceof
        Error
        ? error.message
        : String(
            error,
          );

    await appendProjectEvent({
      userId,

      projectId,

      eventType:
        'deployment.failed',

      payload: {
        provider:
          'vercel',

        verified:
          false,

        reason:
          reason.slice(
            0,
            500,
          ),
      },
    }).catch(
      () => {},
    );

    await saveDeliveryLifecycle({
      userId,

      project,

      phase:
        'deployment',

      status:
        'failed',

      detail:
        reason.slice(
          0,
          500,
        ),
    }).catch(
      () => {},
    );

    throw new ProjectDeliveryActionError(
      'VERCEL_DEPLOYMENT_FAILED',

      reason,

      502,
    );
  }
}
