import {
  getSupabaseAdmin,
} from '../../config/supabase.js';

import type {
  SoftwareProject,
} from '../softwareProject.js';

import {
  SupabaseProjectRuntimeStore,
  type ProjectRevisionRecord,
  type ProjectRuntimeEventRecord,
} from './store.js';

function clone<T>(
  value:
    T,
): T {
  return structuredClone(
    value,
  );
}

function revisionFromRow(
  row:
    Record<string, unknown>,

  userId:
    string,

  projectId:
    string,
): ProjectRevisionRecord {
  return {
    revisionId:
      String(
        row.revision_id,
      ),

    userId,

    projectId,

    runId:
      String(
        row.run_id,
      ),

    revisionNumber:
      Number(
        row.revision_number,
      ),

    workspaceFingerprint:
      String(
        row.workspace_fingerprint,
      ),

    project:
      clone(
        row.software_project as
          SoftwareProject,
      ),

    createdAt:
      String(
        row.created_at,
      ),
  };
}

export async function listProjectRevisions(
  userId:
    string,

  projectId:
    string,

  limit =
    30,
): Promise<
  readonly ProjectRevisionRecord[]
> {
  const boundedLimit =
    Math.max(
      1,
      Math.min(
        limit,
        100,
      ),
    );

  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
      .from(
        'project_runtime_revisions',
      )
      .select(
        'revision_id, run_id, revision_number, workspace_fingerprint, software_project, created_at',
      )
      .eq(
        'user_id',
        userId,
      )
      .eq(
        'project_id',
        projectId,
      )
      .order(
        'revision_number',
        {
          ascending:
            false,
        },
      )
      .limit(
        boundedLimit,
      );

  if (
    error
  ) {
    throw error;
  }

  return (
    data ??
    []
  ).map(
    (row) =>
      revisionFromRow(
        row as
          Record<
            string,
            unknown
          >,

        userId,
        projectId,
      ),
  );
}

export async function loadProjectRevision(
  userId:
    string,

  projectId:
    string,

  revisionId:
    string,
): Promise<
  ProjectRevisionRecord | null
> {
  const {
    data,
    error,
  } =
    await getSupabaseAdmin()
      .from(
        'project_runtime_revisions',
      )
      .select(
        'revision_id, run_id, revision_number, workspace_fingerprint, software_project, created_at',
      )
      .eq(
        'user_id',
        userId,
      )
      .eq(
        'project_id',
        projectId,
      )
      .eq(
        'revision_id',
        revisionId,
      )
      .maybeSingle();

  if (
    error
  ) {
    throw error;
  }

  if (
    !data
  ) {
    return null;
  }

  return revisionFromRow(
    data as
      Record<
        string,
        unknown
      >,

    userId,
    projectId,
  );
}

export interface CloneProjectRevisionInput {
  readonly projectId:
    string;

  readonly runId:
    string;

  readonly sourcePrompt?:
    string;

  readonly preserveRepository?:
    boolean;

  readonly now?:
    Date;
}

/**
 * Creates a new canonical state from an old revision.
 *
 * Used by restore, undo, retry, duplicate and fork.
 *
 * The historical revision is never mutated.
 */
export function cloneSoftwareProjectRevision(
  source:
    SoftwareProject,

  input:
    CloneProjectRevisionInput,
): SoftwareProject {
  const timestamp =
    (
      input.now ??
      new Date()
    ).toISOString();

  const sameProject =
    input.projectId ===
    source.projectId;

  const preserveRepository =
    input.preserveRepository ??
    sameProject;

  const project =
    clone(
      source,
    );

  return {
    ...project,

    projectId:
      input.projectId,

    runId:
      input.runId,

    contract: {
      ...project.contract,

      projectId:
        input.projectId,

      runId:
        input.runId,

      operation:
        'modify',

      projectMode:
        'follow_up',

      sourcePrompt:
        input.sourcePrompt ??
        project.contract
          .sourcePrompt,

      repository:
        preserveRepository
          ? project.contract
              .repository
          : null,

      context: {
        existingFileCount:
          project.workspace
            .fileCount,

        continuation:
          true,
      },

      createdAt:
        timestamp,
    },

    workspace: {
      ...project.workspace,

      revision:
        project.workspace
          .revision +
        1,

      files:
        project.workspace
          .files
          .map(
            (file) => ({
              path:
                file.path,

              content:
                file.content,
            }),
          ),

      updatedAt:
        timestamp,
    },

    changeSet: {
      created: [],
      modified: [],
      deleted: [],
      renamed: [],
    },

    /*
     * A runtime machine belongs to the old working session.
     *
     * Never silently attach it to a restored/forked revision.
     */
    runtime:
      null,

    repository:
      preserveRepository
        ? project.repository
        : null,

    createdAt:
      sameProject
        ? project.createdAt
        : timestamp,

    updatedAt:
      timestamp,
  };
}

export async function restoreProjectRevision(
  input: {
    userId:
      string;

    projectId:
      string;

    revisionId:
      string;

    runId:
      string;

    sourcePrompt?:
      string;
  },
): Promise<ProjectRevisionRecord> {
  const source =
    await loadProjectRevision(
      input.userId,
      input.projectId,
      input.revisionId,
    );

  if (
    !source
  ) {
    throw new Error(
      'Project revision does not exist.',
    );
  }

  const project =
    cloneSoftwareProjectRevision(
      source.project,
      {
        projectId:
          input.projectId,

        runId:
          input.runId,

        sourcePrompt:
          input.sourcePrompt ??
          `Restore project revision ${source.revisionNumber}.`,

        preserveRepository:
          true,
      },
    );

  const store =
    new SupabaseProjectRuntimeStore();

  const revision =
    await store.saveRevision(
      input.userId,
      project,
    );

  await store.appendEvent({
    userId:
      input.userId,

    projectId:
      input.projectId,

    eventType:
      'project.revision_restored',

    payload: {
      sourceRevisionId:
        source.revisionId,

      sourceRevisionNumber:
        source.revisionNumber,

      revisionId:
        revision.revisionId,

      revisionNumber:
        revision.revisionNumber,

      runId:
        input.runId,
    },
  });

  return revision;
}

/**
 * Restoring an earlier revision is the canonical undo operation.
 */
export const undoProjectToRevision =
  restoreProjectRevision;

/**
 * Retrying from a known-good revision uses the same immutable source
 * but receives a new run id.
 */
export const retryProjectFromRevision =
  restoreProjectRevision;

export async function forkProjectRevision(
  input: {
    userId:
      string;

    sourceProjectId:
      string;

    revisionId:
      string;

    newProjectId:
      string;

    runId:
      string;

    sourcePrompt?:
      string;

    preserveRepository?:
      boolean;
  },
): Promise<ProjectRevisionRecord> {
  const source =
    await loadProjectRevision(
      input.userId,
      input.sourceProjectId,
      input.revisionId,
    );

  if (
    !source
  ) {
    throw new Error(
      'Project revision does not exist.',
    );
  }

  const project =
    cloneSoftwareProjectRevision(
      source.project,
      {
        projectId:
          input.newProjectId,

        runId:
          input.runId,

        sourcePrompt:
          input.sourcePrompt ??
          `Fork project from revision ${source.revisionNumber}.`,

        preserveRepository:
          input.preserveRepository ??
          false,
      },
    );

  const store =
    new SupabaseProjectRuntimeStore();

  const revision =
    await store.saveRevision(
      input.userId,
      project,
    );

  await store.appendEvent({
    userId:
      input.userId,

    projectId:
      input.newProjectId,

    eventType:
      'project.revision_forked',

    payload: {
      sourceProjectId:
        input.sourceProjectId,

      sourceRevisionId:
        source.revisionId,

      sourceRevisionNumber:
        source.revisionNumber,

      revisionId:
        revision.revisionId,

      revisionNumber:
        revision.revisionNumber,

      runId:
        input.runId,
    },
  });

  return revision;
}

/**
 * Duplicate is a fork that receives another project identity.
 */
export const duplicateProjectRevision =
  forkProjectRevision;

export async function listProjectRuntimeEvents(
  input: {
    userId:
      string;

    projectId:
      string;

    sessionId?:
      string | null;

    limit?:
      number;
  },
): Promise<
  readonly ProjectRuntimeEventRecord[]
> {
  const boundedLimit =
    Math.max(
      1,
      Math.min(
        input.limit ??
          100,
        500,
      ),
    );

  let query =
    getSupabaseAdmin()
      .from(
        'project_runtime_events',
      )
      .select(
        'event_id, user_id, project_id, session_id, event_type, payload, created_at',
      )
      .eq(
        'user_id',
        input.userId,
      )
      .eq(
        'project_id',
        input.projectId,
      );

  if (
    input.sessionId
  ) {
    query =
      query.eq(
        'session_id',
        input.sessionId,
      );
  }

  const {
    data,
    error,
  } =
    await query
      .order(
        'created_at',
        {
          ascending:
            true,
        },
      )
      .limit(
        boundedLimit,
      );

  if (
    error
  ) {
    throw error;
  }

  return (
    data ??
    []
  ).map(
    (row) => ({
      eventId:
        String(
          row.event_id,
        ),

      userId:
        String(
          row.user_id,
        ),

      projectId:
        String(
          row.project_id,
        ),

      sessionId:
        row.session_id
          ? String(
              row.session_id,
            )
          : null,

      eventType:
        String(
          row.event_type,
        ),

      payload:
        (
          row.payload ??
          {}
        ) as
          Readonly<
            Record<
              string,
              unknown
            >
          >,

      createdAt:
        String(
          row.created_at,
        ),
    }),
  );
}
