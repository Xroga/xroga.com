import type {
  FileTrailEntry,
  ProjectFile,
} from '../ai/patches.js';

import type {
  ArchitecturePlan,
} from './architecturePlan.js';

import type {
  BuildContract,
} from './buildContract.js';

import type {
  BuildRecipe,
} from './buildRecipes.js';

import type {
  ProductFilePlan,
} from './filePlan.js';

import type {
  ProjectRunState,
  ProjectLifecycleStatus,
} from './projectRunState.js';

import type {
  ProjectRuntimeBinding,
} from './projectRuntime/types.js';

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

export interface SoftwareProjectVerificationEvidence {
  readonly phase:
    string;

  readonly statement:
    string;

  readonly detail:
    string;
}

export interface SoftwareProject {
  readonly schemaVersion:
    typeof SOFTWARE_PROJECT_SCHEMA_VERSION;

  readonly projectId:
    string;

  readonly runId:
    string;

  readonly contract:
    BuildContract;

  /**
   * Canonical technical state selected before implementation.
   *
   * Existing-repository facts and explicit user choices remain
   * authoritative over recipe defaults.
   */
  readonly architecture:
    ArchitecturePlan | null;

  readonly recipe:
    BuildRecipe | null;

  readonly filePlan:
    ProductFilePlan | null;

  readonly workspace: {
    readonly revision:
      number;

    readonly fileCount:
      number;

    /**
     * Complete current project.
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

    readonly renamed:
      Array<{
        from: string;
        to: string;
      }>;
  };

  readonly lifecycle:
    ProjectRunState;

  /**
   * Binding to the active project runtime when one exists.
   *
   * Step 4 will use this for live Preview.
   */
  readonly runtime:
    ProjectRuntimeBinding | null;

  readonly verification: {
    readonly status:
      ProjectLifecycleStatus;

    readonly verified:
      boolean;

    readonly reason:
      string;

    readonly blockers:
      string[];

    readonly evidence:
      SoftwareProjectVerificationEvidence[];
  };

  readonly repository:
    SoftwareProjectRepository | null;

  readonly createdAt:
    string;

  readonly updatedAt:
    string;
}

export interface CreateSoftwareProjectInput {
  readonly contract:
    BuildContract;

  readonly architecture?:
    ArchitecturePlan | null;

  readonly recipe?:
    BuildRecipe | null;

  readonly filePlan?:
    ProductFilePlan | null;

  readonly files:
    readonly ProjectFile[];

  readonly fileTrail:
    readonly FileTrailEntry[];

  readonly lifecycle:
    ProjectRunState;

  readonly runtime?:
    ProjectRuntimeBinding | null;

  readonly verified:
    boolean;

  readonly reason:
    string;

  readonly blockers:
    readonly string[];

  readonly evidence?:
    readonly SoftwareProjectVerificationEvidence[];

  readonly repository?:
    SoftwareProjectRepository | null;

  readonly now?:
    Date;
}

export function createSoftwareProject(
  input:
    CreateSoftwareProjectInput,
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

    architecture:
      input.architecture ??
      null,

    recipe:
      input.recipe ??
      null,

    filePlan:
      input.filePlan ??
      null,

    workspace: {
      revision:
        1,

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

    runtime:
      input.runtime ??
      null,

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

      evidence:
        (
          input.evidence ??
          []
        ).map(
          (entry) => ({
            phase:
              entry.phase,

            statement:
              entry.statement,

            detail:
              entry.detail,
          }),
        ),
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
