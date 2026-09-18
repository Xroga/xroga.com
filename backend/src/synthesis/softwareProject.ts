import type {
  FileTrailEntry,
  ProjectFile,
} from '../ai/patches.js';

import type {
  BuildContract,
} from './buildContract.js';

import type {
  ProjectRunState,
  ProjectLifecycleStatus,
} from './projectRunState.js';

export const SOFTWARE_PROJECT_SCHEMA_VERSION =
  '1.0.0' as const;

export interface SoftwareProjectRepository {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string;
  readonly baseBranch:
    string | null;
  readonly commitSha:
    string | null;
}

export interface SoftwareProject {
  readonly schemaVersion:
    typeof SOFTWARE_PROJECT_SCHEMA_VERSION;

  readonly projectId: string;
  readonly runId: string;

  readonly contract:
    BuildContract;

  readonly workspace: {
    readonly revision: number;
    readonly fileCount: number;

    /**
     * Full current project snapshot.
     *
     * Never a diff.
     */
    readonly files:
      ProjectFile[];

    readonly updatedAt:
      string;
  };

  readonly changeSet: {
    readonly created:
      string[];

    readonly modified:
      string[];

    readonly deleted:
      string[];

    /**
     * Agent V2 does not yet publish rename operations end-to-end.
     * Step 5 will populate this once rename/move becomes a canonical
     * mutation.
     */
    readonly renamed:
      Array<{
        from: string;
        to: string;
      }>;
  };

  readonly lifecycle:
    ProjectRunState;

  readonly verification: {
    readonly status:
      ProjectLifecycleStatus;

    readonly verified:
      boolean;

    readonly reason:
      string;

    readonly blockers:
      string[];
  };

  readonly repository:
    SoftwareProjectRepository |
    null;

  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateSoftwareProjectInput {
  readonly contract:
    BuildContract;

  readonly files:
    readonly ProjectFile[];

  readonly fileTrail:
    readonly FileTrailEntry[];

  readonly lifecycle:
    ProjectRunState;

  readonly verified:
    boolean;

  readonly reason:
    string;

  readonly blockers:
    readonly string[];

  readonly repository?:
    SoftwareProjectRepository |
    null;

  readonly now?: Date;
}

export function createSoftwareProject(
  input: CreateSoftwareProjectInput,
): SoftwareProject {
  const timestamp =
    (
      input.now ??
      new Date()
    ).toISOString();

  const files =
    input.files
      .map(
        (file) => ({
          path:
            file.path,

          content:
            file.content,
        }),
      )
      .sort(
        (left, right) =>
          left.path.localeCompare(
            right.path,
          ),
      );

  const created =
    input.fileTrail
      .filter(
        (entry) =>
          entry.action ===
          'created',
      )
      .map(
        (entry) =>
          entry.path,
      );

  const modified =
    input.fileTrail
      .filter(
        (entry) =>
          entry.action ===
          'modified',
      )
      .map(
        (entry) =>
          entry.path,
      );

  const deleted =
    input.fileTrail
      .filter(
        (entry) =>
          entry.action ===
          'deleted',
      )
      .map(
        (entry) =>
          entry.path,
      );

  return {
    schemaVersion:
      SOFTWARE_PROJECT_SCHEMA_VERSION,

    projectId:
      input.contract.projectId,

    runId:
      input.contract.runId,

    contract:
      input.contract,

    workspace: {
      revision: 1,

      fileCount:
        files.length,

      files,

      updatedAt:
        timestamp,
    },

    changeSet: {
      created,
      modified,
      deleted,
      renamed: [],
    },

    lifecycle:
      input.lifecycle,

    verification: {
      status:
        input.lifecycle
          .verification
          .status,

      verified:
        input.verified,

      reason:
        input.reason,

      blockers:
        [...input.blockers],
    },

    repository:
      input.repository ??
      null,

    createdAt:
      input.contract
        .createdAt,

    updatedAt:
      timestamp,
  };
}
