import {
  createHash,
} from 'node:crypto';

import {
  getSupabaseAdmin,
} from '../../config/supabase.js';

import type {
  SoftwareExecutionContract,
  SoftwareRunEvidence,
} from './contracts.js';

import type {
  SoftwareAgentWorkspaceChange,
  SoftwareAgentWorkspaceFile,
} from './SoftwareAgentWorkspace.js';

export type SoftwareAgentCheckpointStatus =
  | 'active'
  | 'verified'
  | 'incomplete'
  | 'failed'
  | 'cancelled';

export interface SoftwareAgentCheckpointChange {
  path: string;

  kind:
    | 'created'
    | 'modified'
    | 'deleted';

  /**
   * Present for created/modified files.
   *
   * Deleted files intentionally carry no content.
   */
  content?: string;
}

export interface SoftwareAgentCheckpointRepository {
  owner: string;
  repo: string;
  branch: string;
  sourceCommit?: string;
}

export interface SoftwareAgentCheckpoint {
  schemaVersion:
    '1.0.0';

  runId:
    string;

  projectId:
    string | null;

  repository:
    SoftwareAgentCheckpointRepository | null;

  /**
   * SHA-256 over the exact authorized run-start repository snapshot.
   *
   * A checkpoint may be restored only when this still matches.
   */
  baseFingerprint:
    string;

  /**
   * Only the delta from the authorized base is persisted.
   *
   * This avoids duplicating an entire large repository in every
   * checkpoint.
   */
  changes:
    SoftwareAgentCheckpointChange[];

  evidence:
    SoftwareRunEvidence;

  status:
    SoftwareAgentCheckpointStatus;

  blockers:
    string[];

  failureCode:
    string | null;

  updatedAt:
    string;
}

export interface SoftwareAgentCheckpointStore {
  load(
    runId: string,
  ): Promise<
    SoftwareAgentCheckpoint |
    null
  >;

  save(
    checkpoint:
      SoftwareAgentCheckpoint,
  ): Promise<void>;
}

function cloneCheckpoint(
  checkpoint:
    SoftwareAgentCheckpoint,
): SoftwareAgentCheckpoint {
  return structuredClone(
    checkpoint,
  );
}

export function softwareAgentBaseFingerprint(
  files:
    readonly SoftwareAgentWorkspaceFile[],
): string {
  const hash =
    createHash(
      'sha256',
    );

  const ordered =
    [
      ...files,
    ].sort(
      (
        left,
        right,
      ) =>
        left.path.localeCompare(
          right.path,
        ),
    );

  for (
    const file of
    ordered
  ) {
    hash.update(
      file.path,
      'utf8',
    );

    hash.update(
      '\u0000',
    );

    hash.update(
      file.content,
      'utf8',
    );

    hash.update(
      '\u0000',
    );
  }

  return hash.digest(
    'hex',
  );
}

export function checkpointChangesFromWorkspace(
  changes:
    readonly SoftwareAgentWorkspaceChange[],
): SoftwareAgentCheckpointChange[] {
  return changes.map(
    (
      change,
    ) => {
      if (
        change.kind ===
        'deleted'
      ) {
        return {
          path:
            change.path,

          kind:
            'deleted',
        };
      }

      return {
        path:
          change.path,

        kind:
          change.kind,

        content:
          change.after ??
          '',
      };
    },
  );
}

export function workingFilesFromCheckpoint(
  baseFiles:
    readonly SoftwareAgentWorkspaceFile[],

  checkpoint:
    Pick<
      SoftwareAgentCheckpoint,
      'changes'
    >,
): SoftwareAgentWorkspaceFile[] {
  const files =
    new Map<
      string,
      string
    >();

  for (
    const file of
    baseFiles
  ) {
    files.set(
      file.path,
      file.content,
    );
  }

  for (
    const change of
    checkpoint.changes
  ) {
    if (
      change.kind ===
      'deleted'
    ) {
      files.delete(
        change.path,
      );

      continue;
    }

    files.set(
      change.path,
      change.content ??
      '',
    );
  }

  return [
    ...files.entries(),
  ]
    .map(
      (
        [
          path,
          content,
        ],
      ) => ({
        path,
        content,
      }),
    )
    .sort(
      (
        left,
        right,
      ) =>
        left.path.localeCompare(
          right.path,
        ),
    );
}

function repositoryFromContract(
  contract:
    SoftwareExecutionContract,
):
  | SoftwareAgentCheckpointRepository
  | null {
  if (
    !contract.repository
  ) {
    return null;
  }

  return {
    owner:
      contract.repository
        .owner,

    repo:
      contract.repository
        .repo,

    branch:
      contract.repository
        .branch,

    ...(
      contract.repository
        .sourceCommit
        ? {
            sourceCommit:
              contract.repository
                .sourceCommit,
          }
        : {}
    ),
  };
}

function sameRepository(
  left:
    SoftwareAgentCheckpointRepository |
    null,

  right:
    SoftwareAgentCheckpointRepository |
    null,
): boolean {
  if (
    !left ||
    !right
  ) {
    return (
      left === null &&
      right === null
    );
  }

  return (
    left.owner ===
      right.owner &&
    left.repo ===
      right.repo &&
    left.branch ===
      right.branch &&
    (
      left.sourceCommit ??
      null
    ) ===
      (
        right.sourceCommit ??
        null
      )
  );
}

/**
 * A checkpoint is valid only against exactly the project/repository
 * state from which it was produced.
 *
 * This prevents applying generated edits on top of a repository that
 * changed while the worker was unavailable.
 */
export function checkpointMatchesExecution(
  checkpoint:
    SoftwareAgentCheckpoint,

  input: {
    contract:
      SoftwareExecutionContract;

    baseFiles:
      readonly SoftwareAgentWorkspaceFile[];
  },
): boolean {
  if (
    checkpoint.runId !==
    input.contract.runId
  ) {
    return false;
  }

  if (
    checkpoint.projectId !==
    (
      input.contract
        .projectId ??
      null
    )
  ) {
    return false;
  }

  if (
    !sameRepository(
      checkpoint.repository,

      repositoryFromContract(
        input.contract,
      ),
    )
  ) {
    return false;
  }

  return (
    checkpoint
      .baseFingerprint ===
    softwareAgentBaseFingerprint(
      input.baseFiles,
    )
  );
}

export class InMemorySoftwareAgentCheckpointStore
  implements
    SoftwareAgentCheckpointStore
{
  private readonly checkpoints =
    new Map<
      string,
      SoftwareAgentCheckpoint
    >();

  async load(
    runId:
      string,
  ): Promise<
    SoftwareAgentCheckpoint |
    null
  > {
    const checkpoint =
      this.checkpoints.get(
        runId,
      );

    return checkpoint
      ? cloneCheckpoint(
          checkpoint,
        )
      : null;
  }

  async save(
    checkpoint:
      SoftwareAgentCheckpoint,
  ): Promise<void> {
    this.checkpoints.set(
      checkpoint.runId,

      cloneCheckpoint(
        checkpoint,
      ),
    );
  }
}

/**
 * Shared process-local fallback.
 *
 * Production uses Supabase. This singleton still allows local/dev
 * re-entry with the same run id while the process remains alive.
 */
export const inMemorySoftwareAgentCheckpointStore =
  new InMemorySoftwareAgentCheckpointStore();

export class SupabaseSoftwareAgentCheckpointStore
  implements
    SoftwareAgentCheckpointStore
{
  constructor(
    private readonly userId:
      string,
  ) {}

  async load(
    runId:
      string,
  ): Promise<
    SoftwareAgentCheckpoint |
    null
  > {
    const {
      data,
      error,
    } =
      await getSupabaseAdmin()
        .from(
          'software_agent_checkpoints',
        )
        .select(
          'checkpoint',
        )
        .eq(
          'run_id',
          runId,
        )
        .eq(
          'user_id',
          this.userId,
        )
        .maybeSingle();

    if (
      error
    ) {
      throw error;
    }

    if (
      !data?.checkpoint
    ) {
      return null;
    }

    return structuredClone(
      data.checkpoint as
        SoftwareAgentCheckpoint,
    );
  }

  async save(
    checkpoint:
      SoftwareAgentCheckpoint,
  ): Promise<void> {
    const {
      error,
    } =
      await getSupabaseAdmin()
        .from(
          'software_agent_checkpoints',
        )
        .upsert(
          {
            run_id:
              checkpoint.runId,

            user_id:
              this.userId,

            project_id:
              checkpoint.projectId,

            repository_identity:
              checkpoint.repository,

            base_fingerprint:
              checkpoint
                .baseFingerprint,

            status:
              checkpoint.status,

            checkpoint,

            updated_at:
              checkpoint.updatedAt,
          },

          {
            onConflict:
              'run_id,user_id',
          },
        );

    if (
      error
    ) {
      throw error;
    }
  }
}
