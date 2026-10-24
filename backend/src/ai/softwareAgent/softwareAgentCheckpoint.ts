import {
  createHash,
} from 'node:crypto';

import {
  getSupabaseAdmin,
} from '../../config/supabase.js';
import { requireAdmittedRunAttempt, type AdmittedRunAttempt } from '../runStore.js';

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
  private readonly attempt?: AdmittedRunAttempt;
  private writes: Promise<void> = Promise.resolve();
  constructor(
    private readonly userId:
      string,
    attempt?: AdmittedRunAttempt,
  ) { this.attempt = attempt ? requireAdmittedRunAttempt(attempt) : undefined; }

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
          'run_id,user_id,project_id,repository_identity,base_fingerprint,status,checkpoint',
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

    return restoreOwnerBoundSoftwareCheckpoint(data, this.userId, runId);
  }

  async save(
    checkpoint:
      SoftwareAgentCheckpoint,
  ): Promise<void> {
    const attempt = this.attempt;
    if (!attempt || attempt.userId !== this.userId || attempt.runId !== checkpoint.runId) {
      throw Object.assign(new Error('Software checkpoint authority is missing.'), { code: 'RUN_STATE_CONFLICT' });
    }
    requireAdmittedRunAttempt(attempt);
    const snapshot = cloneCheckpoint(checkpoint);
    const pending = this.writes.then(async () => {
      const {data,error} = await getSupabaseAdmin().rpc('persist_software_checkpoint_attempt', {
        p_run_id: attempt.runId, p_owner_id: this.userId, p_worker_id: attempt.workerId,
        p_generation: attempt.generation, p_checkpoint: snapshot,
      });
      if (error) throw Object.assign(new Error('Software checkpoint persistence is unavailable.'), { code:'RESOURCE_ACCESS_UNAVAILABLE' });
      if (data !== true) throw Object.assign(new Error('Software checkpoint is no longer authoritative.'), { code:'RUN_STATE_CONFLICT' });
    });
    this.writes = pending;
    void pending.catch(() => {});
    await pending;
  }
}

function validCheckpointRepository(value: unknown): value is SoftwareAgentCheckpointRepository | null {
  if (value === null) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const repo = value as Record<string,unknown>;
  return ['owner','repo','branch'].every(key => typeof repo[key] === 'string' && !!repo[key]) &&
    (repo.sourceCommit === undefined || typeof repo.sourceCommit === 'string');
}

function validCheckpoint(value: unknown): value is SoftwareAgentCheckpoint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string,unknown>;
  const evidence = item.evidence as Record<string,unknown> | null;
  return item.schemaVersion === '1.0.0' && typeof item.runId === 'string' && !!item.runId &&
    (item.projectId === null || typeof item.projectId === 'string') && validCheckpointRepository(item.repository) &&
    typeof item.baseFingerprint === 'string' && !!item.baseFingerprint && Array.isArray(item.changes) &&
    item.changes.every(change => change && typeof change.path === 'string' && ['created','modified','deleted'].includes(change.kind) &&
      (change.kind === 'deleted' || typeof change.content === 'string')) &&
    !!evidence && !Array.isArray(evidence) && Array.isArray(evidence.changedFiles) && Array.isArray(evidence.checks) &&
    Array.isArray(item.blockers) && item.blockers.every(value => typeof value === 'string') &&
    typeof item.status === 'string' && ['active','verified','incomplete','failed','cancelled'].includes(item.status) &&
    typeof item.updatedAt === 'string' && Number.isFinite(Date.parse(item.updatedAt));
}

/** Durable row columns remain authority, embedded JSON cannot relocate a checkpoint. */
export function restoreOwnerBoundSoftwareCheckpoint(row: unknown, userId: string, runId: string): SoftwareAgentCheckpoint | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const record = row as Record<string,unknown>, checkpoint = record.checkpoint;
  if (record.user_id !== userId || record.run_id !== runId || !validCheckpoint(checkpoint) || checkpoint.runId !== runId ||
      checkpoint.projectId !== record.project_id || checkpoint.baseFingerprint !== record.base_fingerprint ||
      checkpoint.status !== record.status || !validCheckpointRepository(record.repository_identity) ||
      !sameRepository(checkpoint.repository, record.repository_identity)) return null;
  return cloneCheckpoint(checkpoint);
}

/** Restrict every consumer of this store to the immutable authorized run-start base. */
export function bindSoftwareCheckpointRecovery(store: SoftwareAgentCheckpointStore, expected: {
  runId: string; projectId: string | null; repository: SoftwareAgentCheckpointRepository | null;
  baseFiles: readonly SoftwareAgentWorkspaceFile[];
}): SoftwareAgentCheckpointStore {
  const identity = {runId:expected.runId,projectId:expected.projectId,repository:structuredClone(expected.repository),
    baseFingerprint:softwareAgentBaseFingerprint(expected.baseFiles)};
  return {
    async load(runId) {
      if (runId !== identity.runId) return null;
      const checkpoint = await store.load(runId);
      if (!validCheckpoint(checkpoint) || checkpoint.runId !== identity.runId || checkpoint.projectId !== identity.projectId ||
          !sameRepository(checkpoint.repository,identity.repository) || checkpoint.baseFingerprint !== identity.baseFingerprint) return null;
      return cloneCheckpoint(checkpoint);
    },
    save: checkpoint => store.save(checkpoint),
  };
}
