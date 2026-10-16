import {
  createHash,
  randomUUID,
} from 'node:crypto';

import {
  getSupabaseAdmin,
} from '../../config/supabase.js';
import { createTenantContext } from '../../security/tenantContext.js';
import { TenantAccessError } from '../../security/tenantErrors.js';
import { persistOwnedRuntimeSession } from '../../security/ownedRunPersistence.js';
import { captureAdmittedRunAttempt, requireAdmittedRunAttempt, type AdmittedRunAttempt } from '../../ai/runStore.js';

import type {
  SoftwareProject,
} from '../softwareProject.js';

import type {
  ProjectRuntimeSession,
  ProjectSecretScope,
} from './types.js';

export interface ProjectRevisionRecord {
  readonly revisionId:
    string;

  readonly userId:
    string;

  readonly projectId:
    string;

  readonly runId:
    string;

  readonly revisionNumber:
    number;

  readonly workspaceFingerprint:
    string;

  readonly project:
    SoftwareProject;

  readonly createdAt:
    string;
}

export interface ProjectRuntimeEventRecord {
  readonly eventId:
    string;

  readonly userId:
    string;

  readonly projectId:
    string;

  readonly sessionId:
    string | null;

  readonly eventType:
    string;

  readonly payload:
    Readonly<
      Record<
        string,
        unknown
      >
    >;

  readonly createdAt:
    string;
}

export interface EncryptedProjectSecretRecord {
  readonly userId:
    string;

  readonly projectId:
    string;

  readonly name:
    string;

  readonly scope:
    ProjectSecretScope;

  readonly encryptedValue:
    string;

  readonly keyVersion:
    number;

  readonly createdAt:
    string;

  readonly updatedAt:
    string;
}

export interface ProjectRuntimeStore {
  saveRevision(
    userId:
      string,

    project:
      SoftwareProject,
  ):
    Promise<
      ProjectRevisionRecord
    >;

  loadLatestRevision(
    userId:
      string,

    projectId:
      string,
  ):
    Promise<
      ProjectRevisionRecord |
      null
    >;

  saveSession(
    session:
      ProjectRuntimeSession,
  ):
    Promise<void>;

  loadSession(
    userId:
      string,

    sessionId:
      string,
  ):
    Promise<
      ProjectRuntimeSession |
      null
    >;

  appendEvent(
    input: {
      userId:
        string;

      projectId:
        string;

      sessionId?:
        string | null;

      eventType:
        string;

      payload?:
        Readonly<
          Record<
            string,
            unknown
          >
        >;
    },
  ):
    Promise<
      ProjectRuntimeEventRecord
    >;

  saveEncryptedSecret(
    record:
      EncryptedProjectSecretRecord,
  ):
    Promise<void>;

  loadEncryptedSecrets(
    userId:
      string,

    projectId:
      string,
  ):
    Promise<
      readonly EncryptedProjectSecretRecord[]
    >;

  deleteEncryptedSecret(
    input: {
      userId:
        string;

      projectId:
        string;

      name:
        string;

      scope:
        ProjectSecretScope;
    },
  ):
    Promise<void>;
}

export function projectWorkspaceFingerprint(
  project:
    Pick<
      SoftwareProject,
      'workspace'
    >,
): string {
  const hash =
    createHash(
      'sha256',
    );

  const files =
    [
      ...project
        .workspace
        .files,
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
    files
  ) {
    hash.update(
      file.path,
      'utf8',
    );

    hash.update(
      '\0',
    );

    hash.update(
      file.content,
      'utf8',
    );

    hash.update(
      '\0',
    );
  }

  return hash.digest(
    'hex',
  );
}

function clone<T>(
  value:
    T,
): T {
  return structuredClone(
    value,
  );
}

/** Take one immutable identity-bound snapshot before any asynchronous persistence. */
function snapshotRevision(userId: string, project: SoftwareProject): SoftwareProject {
  const snapshot = clone(project);
  if (!userId.trim() || !snapshot || typeof snapshot.projectId !== 'string' || !snapshot.projectId.trim() ||
    typeof snapshot.runId !== 'string' || !snapshot.runId.trim() ||
    snapshot.contract?.projectId !== snapshot.projectId || snapshot.contract?.runId !== snapshot.runId) {
    throw new Error('Project revision identity is invalid.');
  }
  return snapshot;
}

export class InMemoryProjectRuntimeStore
  implements
    ProjectRuntimeStore {
  private revisionCounter =
    0;

  private readonly revisions =
    new Map<
      string,
      ProjectRevisionRecord[]
    >();

  private readonly sessions =
    new Map<
      string,
      ProjectRuntimeSession
    >();

  private readonly events:
    ProjectRuntimeEventRecord[] =
    [];

  private readonly secrets =
    new Map<
      string,
      EncryptedProjectSecretRecord
    >();

  private revisionKey(
    userId:
      string,

    projectId:
      string,
  ): string {
    return `${userId}::${projectId}`;
  }

  private sessionKey(
    userId:
      string,

    sessionId:
      string,
  ): string {
    return `${userId}::${sessionId}`;
  }

  private secretKey(
    record: {
      userId:
        string;

      projectId:
        string;

      name:
        string;

      scope:
        ProjectSecretScope;
    },
  ): string {
    return [
      record.userId,
      record.projectId,
      record.scope,
      record.name,
    ].join(
      '::',
    );
  }

  async saveRevision(
    userId:
      string,

    project:
      SoftwareProject,
  ): Promise<ProjectRevisionRecord> {
    project = snapshotRevision(userId, project);
    this.revisionCounter +=
      1;

    const record:
      ProjectRevisionRecord = {
      revisionId:
        randomUUID(),

      userId,

      projectId:
        project.projectId,

      runId:
        project.runId,

      revisionNumber:
        this.revisionCounter,

      workspaceFingerprint:
        projectWorkspaceFingerprint(
          project,
        ),

      project:
        clone(
          project,
        ),

      createdAt:
        new Date()
          .toISOString(),
    };

    const key =
      this.revisionKey(
        userId,
        project.projectId,
      );

    const values =
      this.revisions.get(
        key,
      ) ??
      [];

    values.push(
      record,
    );

    this.revisions.set(
      key,
      values,
    );

    return clone(
      record,
    );
  }

  async loadLatestRevision(
    userId:
      string,

    projectId:
      string,
  ): Promise<ProjectRevisionRecord | null> {
    const values =
      this.revisions.get(
        this.revisionKey(
          userId,
          projectId,
        ),
      ) ??
      [];

    const latest =
      values[
        values.length -
        1
      ];

    return latest
      ? clone(
          latest,
        )
      : null;
  }

  async saveSession(
    session:
      ProjectRuntimeSession,
  ): Promise<void> {
    const existing = this.sessions.get(this.sessionKey(session.userId, session.sessionId));
    if (existing?.status === 'destroyed' && session.status !== 'destroyed') {
      throw new TenantAccessError(503, 'RESOURCE_ACCESS_UNAVAILABLE');
    }
    this.sessions.set(
      this.sessionKey(
        session.userId,
        session.sessionId,
      ),

      clone(
        session,
      ),
    );
  }

  async loadSession(
    userId:
      string,

    sessionId:
      string,
  ): Promise<ProjectRuntimeSession | null> {
    const session =
      this.sessions.get(
        this.sessionKey(
          userId,
          sessionId,
        ),
      );

    return session
      ? clone(
          session,
        )
      : null;
  }

  async appendEvent(
    input: {
      userId:
        string;

      projectId:
        string;

      sessionId?:
        string | null;

      eventType:
        string;

      payload?:
        Readonly<
          Record<
            string,
            unknown
          >
        >;
    },
  ): Promise<ProjectRuntimeEventRecord> {
    const event:
      ProjectRuntimeEventRecord = {
      eventId:
        randomUUID(),

      userId:
        input.userId,

      projectId:
        input.projectId,

      sessionId:
        input.sessionId ??
        null,

      eventType:
        input.eventType,

      payload:
        clone(
          input.payload ??
          {},
        ),

      createdAt:
        new Date()
          .toISOString(),
    };

    this.events.push(
      event,
    );

    return clone(
      event,
    );
  }

  async saveEncryptedSecret(
    record:
      EncryptedProjectSecretRecord,
  ): Promise<void> {
    this.secrets.set(
      this.secretKey(
        record,
      ),

      clone(
        record,
      ),
    );
  }

  async loadEncryptedSecrets(
    userId:
      string,

    projectId:
      string,
  ): Promise<
    readonly EncryptedProjectSecretRecord[]
  > {
    return [
      ...this.secrets
        .values(),
    ]
      .filter(
        (
          record,
        ) =>
          record.userId ===
            userId &&
          record.projectId ===
            projectId,
      )
      .map(
        (
          record,
        ) =>
          clone(
            record,
          ),
      );
  }

  async deleteEncryptedSecret(
    input: {
      userId:
        string;

      projectId:
        string;

      name:
        string;

      scope:
        ProjectSecretScope;
    },
  ): Promise<void> {
    this.secrets.delete(
      this.secretKey(
        input,
      ),
    );
  }
}

export class SupabaseProjectRuntimeStore
  implements
    ProjectRuntimeStore {
  private readonly attempt?: AdmittedRunAttempt;
  constructor(attempt?: AdmittedRunAttempt) {
    this.attempt = attempt ? requireAdmittedRunAttempt(attempt) : undefined;
  }
  async saveRevision(
    userId:
      string,

    project:
      SoftwareProject,
  ): Promise<ProjectRevisionRecord> {
    project = snapshotRevision(userId, project);
    const fingerprint =
      projectWorkspaceFingerprint(
        project,
      );

    const {
      data,
      error,
    } =
      this.attempt
        ? await this.saveWorkerRevision(userId, project, fingerprint)
        : await getSupabaseAdmin()
        .from(
          'project_runtime_revisions',
        )
        .insert({
          user_id:
            userId,

          project_id:
            project.projectId,

          run_id:
            project.runId,

          workspace_fingerprint:
            fingerprint,

          software_project:
            project,
        })
        .select(
          'revision_id, user_id, project_id, run_id, revision_number, workspace_fingerprint, created_at',
        )
        .single();

    if (
      error ||
      !data
    ) {
      throw new Error(
        'Project revision was not persisted.',
      );
    }

    if (data.user_id !== userId || data.project_id !== project.projectId || data.run_id !== project.runId ||
      data.workspace_fingerprint !== fingerprint || typeof data.revision_id !== 'string' ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(data.revision_id) ||
      !(typeof data.revision_number === 'number' || (typeof data.revision_number === 'string' && /^\d+$/.test(data.revision_number))) ||
      !Number.isSafeInteger(Number(data.revision_number)) || Number(data.revision_number) < 1 ||
      typeof data.created_at !== 'string' || !Number.isFinite(Date.parse(data.created_at))) {
      throw new Error('Project revision persistence evidence is invalid.');
    }

    return {
      revisionId:
        String(
          data.revision_id,
        ),

      userId,

      projectId:
        project.projectId,

      runId:
        project.runId,

      revisionNumber:
        Number(
          data.revision_number,
        ),

      workspaceFingerprint:
        fingerprint,

      project:
        clone(
          project,
        ),

      createdAt:
        String(
          data.created_at,
        ),
    };
  }

  private async saveWorkerRevision(userId: string, project: SoftwareProject, fingerprint: string) {
    const attempt = requireAdmittedRunAttempt(this.attempt!);
    if (attempt.userId !== userId || attempt.runId !== project.runId) {
      throw Object.assign(new Error('Project revision authority is invalid.'), { code: 'RUN_STATE_CONFLICT' });
    }
    const result = await getSupabaseAdmin().rpc('persist_worker_project_revision', {
      p_owner_id: userId, p_run_id: attempt.runId, p_worker_id: attempt.workerId,
      p_generation: attempt.generation, p_project: project, p_fingerprint: fingerprint,
    });
    if (result.error) throw Object.assign(new Error('Project revision was not persisted.'), { code: 'RESOURCE_ACCESS_UNAVAILABLE' });
    if (!result.error && result.data === null) {
      throw Object.assign(new Error('Project revision attempt is no longer authoritative.'), { code: 'RUN_STATE_CONFLICT' });
    }
    return result;
  }

  async loadLatestRevision(
    userId:
      string,

    projectId:
      string,
  ): Promise<ProjectRevisionRecord | null> {
    const {
      data,
      error,
    } =
      await getSupabaseAdmin()
        .from(
          'project_runtime_revisions',
        )
        .select(
          'revision_id, user_id, project_id, run_id, revision_number, workspace_fingerprint, software_project, created_at',
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
          1,
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

    return restoreOwnerBoundProjectRevision(data, userId, projectId);
  }

  async saveSession(
    session:
      ProjectRuntimeSession,
  ): Promise<void> {
    await persistOwnedRuntimeSession(
      getSupabaseAdmin(),
      createTenantContext({userId:session.userId,via:'persisted_owner'}),
          {
            session_id:
              session.sessionId,

            user_id:
              session.userId,

            project_id:
              session.projectId,

            provider_id:
              session.providerId,

            runtime_class:
              session.runtimeClass,

            status:
              session.status,

            state:
              session,

            expires_at:
              session.expiresAt,

            updated_at:
              session.updatedAt,
          },
    );
  }

  async loadSession(
    userId:
      string,

    sessionId:
      string,
  ): Promise<ProjectRuntimeSession | null> {
    const {
      data,
      error,
    } =
      await getSupabaseAdmin()
        .from(
          'project_runtime_sessions',
        )
        .select(
          'state,user_id,session_id,project_id',
        )
        .eq(
          'user_id',
          userId,
        )
        .eq(
          'session_id',
          sessionId,
        )
        .maybeSingle();

    if (
      error
    ) {
      throw error;
    }

    return restoreOwnerBoundRuntimeSession(data,userId,sessionId);
  }

  async appendEvent(
    input: {
      userId:
        string;

      projectId:
        string;

      sessionId?:
        string | null;

      eventType:
        string;

      payload?:
        Readonly<
          Record<
            string,
            unknown
          >
        >;
    },
  ): Promise<ProjectRuntimeEventRecord> {
    const {
      data,
      error,
    } =
      await getSupabaseAdmin()
        .from(
          'project_runtime_events',
        )
        .insert({
          user_id:
            input.userId,

          project_id:
            input.projectId,

          session_id:
            input.sessionId ??
            null,

          event_type:
            input.eventType,

          payload:
            input.payload ??
            {},
        })
        .select(
          'event_id, created_at',
        )
        .single();

    if (
      error ||
      !data
    ) {
      throw new Error(
        error?.message ??
        'Runtime event was not persisted.',
      );
    }

    return {
      eventId:
        String(
          data.event_id,
        ),

      userId:
        input.userId,

      projectId:
        input.projectId,

      sessionId:
        input.sessionId ??
        null,

      eventType:
        input.eventType,

      payload:
        clone(
          input.payload ??
          {},
        ),

      createdAt:
        String(
          data.created_at,
        ),
    };
  }

  async saveEncryptedSecret(
    record:
      EncryptedProjectSecretRecord,
  ): Promise<void> {
    const {
      error,
    } =
      await getSupabaseAdmin()
        .from(
          'project_runtime_secrets',
        )
        .upsert(
          {
            user_id:
              record.userId,

            project_id:
              record.projectId,

            name:
              record.name,

            scope:
              record.scope,

            encrypted_value:
              record.encryptedValue,

            key_version:
              record.keyVersion,

            updated_at:
              record.updatedAt,
          },

          {
            onConflict:
              'user_id,project_id,name,scope',
          },
        );

    if (
      error
    ) {
      throw error;
    }
  }

  async loadEncryptedSecrets(
    userId:
      string,

    projectId:
      string,
  ): Promise<
    readonly EncryptedProjectSecretRecord[]
  > {
    const {
      data,
      error,
    } =
      await getSupabaseAdmin()
        .from(
          'project_runtime_secrets',
        )
        .select(
          'user_id, project_id, name, scope, encrypted_value, key_version, created_at, updated_at',
        )
        .eq(
          'user_id',
          userId,
        )
        .eq(
          'project_id',
          projectId,
        );

    if (
      error
    ) {
      throw error;
    }

    return (data ?? []).map(row => restoreOwnerBoundEncryptedSecret(row, userId, projectId));
  }

  async deleteEncryptedSecret(
    input: {
      userId:
        string;

      projectId:
        string;

      name:
        string;

      scope:
        ProjectSecretScope;
    },
  ): Promise<void> {
    const {
      error,
    } =
      await getSupabaseAdmin()
        .from(
          'project_runtime_secrets',
        )
        .delete()
        .eq(
          'user_id',
          input.userId,
        )
        .eq(
          'project_id',
          input.projectId,
        )
        .eq(
          'name',
          input.name,
        )
        .eq(
          'scope',
          input.scope,
        );

    if (
      error
    ) {
      throw error;
    }
  }
}

/** Validate the existing v1 envelope without decrypting or asserting key custody. */
export function restoreOwnerBoundEncryptedSecret(row: unknown, userId: string, projectId: string): EncryptedProjectSecretRecord {
  const fail = (): never => { throw new TenantAccessError(503, 'RESOURCE_ACCESS_UNAVAILABLE'); };
  if (!row || typeof row !== 'object' || Array.isArray(row)) return fail();
  const record = row as Record<string, unknown>;
  if (!userId || !projectId || record.user_id !== userId || record.project_id !== projectId ||
    typeof record.name !== 'string' || !/^[A-Z_][A-Z0-9_]{1,63}$/.test(record.name) ||
    typeof record.scope !== 'string' || !['development','preview','verification','deployment','shared'].includes(record.scope) ||
    record.key_version !== 1 || typeof record.encrypted_value !== 'string' || record.encrypted_value.length > 342000 ||
    typeof record.created_at !== 'string' || !Number.isFinite(Date.parse(record.created_at)) ||
    typeof record.updated_at !== 'string' || !Number.isFinite(Date.parse(record.updated_at))) return fail();
  const parts = record.encrypted_value.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') return fail();
  const bytes = parts.slice(1).map(part => Buffer.from(part, 'base64'));
  if (bytes.some((value,index) => value.toString('base64') !== parts[index+1]) ||
    bytes[0].length !== 12 || bytes[1].length !== 16 || bytes[2].length < 1 || bytes[2].length > 256000) return fail();
  return {userId, projectId, name:record.name, scope:record.scope as ProjectSecretScope,
    encryptedValue:record.encrypted_value, keyVersion:1, createdAt:record.created_at, updatedAt:record.updated_at};
}

/** Bind persisted snapshot identity before any restore/runtime consumer uses it.
 * This is not a full SoftwareProject schema, repository authorization or credential check.
 */
export function restoreOwnerBoundProjectRevision(row: unknown, userId: string, projectId: string): ProjectRevisionRecord | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const record = row as Record<string, unknown>;
  if (!userId || !projectId || record.user_id !== userId || record.project_id !== projectId || typeof record.run_id !== 'string' || !record.run_id) return null;
  const project = record.software_project;
  if (!project || typeof project !== 'object' || Array.isArray(project)) return null;
  const snapshot = project as Record<string, unknown>;
  const contract = snapshot.contract;
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return null;
  const identity = contract as Record<string, unknown>;
  if (snapshot.projectId !== projectId || snapshot.runId !== record.run_id || identity.projectId !== projectId || identity.runId !== record.run_id) return null;
  return {
    revisionId: String(record.revision_id), userId, projectId, runId: record.run_id,
    revisionNumber: Number(record.revision_number), workspaceFingerprint: String(record.workspace_fingerprint),
    project: clone(project as SoftwareProject), createdAt: String(record.created_at),
  };
}

/** Ownership columns, not embedded restored JSON, are the durable authority. */
export function restoreOwnerBoundRuntimeSession(row: unknown, userId: string, sessionId: string): ProjectRuntimeSession | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const record = row as Record<string,unknown>;
  const state = record.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const snapshot = state as Record<string,unknown>;
  if (record.user_id !== userId || record.session_id !== sessionId || typeof record.project_id !== 'string' || !record.project_id || snapshot.userId !== userId || snapshot.sessionId !== sessionId || snapshot.projectId !== record.project_id) return null;
  return clone(state as ProjectRuntimeSession);
}

export interface ProjectRevisionPersistenceResult {
  readonly saved:
    boolean;

  readonly revisionId:
    string | null;

  readonly revisionNumber:
    number | null;

  readonly reason:
    string | null;
}

export async function persistSoftwareProjectRevision(
  userId:
    string,

  project:
    SoftwareProject,
): Promise<ProjectRevisionPersistenceResult> {
  try {
    const store =
      new SupabaseProjectRuntimeStore();

    const revision =
      await store.saveRevision(
        userId,
        project,
      );

    return {
      saved:
        true,

      revisionId:
        revision.revisionId,

      revisionNumber:
        revision.revisionNumber,

      reason:
        null,
    };
  } catch (
    error
  ) {
    return {
      saved:
        false,

      revisionId:
        null,

      revisionNumber:
        null,

      reason:
        error instanceof Error
          ? error.message
          : String(
              error,
            ),
    };
  }
}

/** Worker-only path. Failed persistence must stop completion and delivery claims. */
export async function persistWorkerSoftwareProjectRevision(userId: string, project: SoftwareProject): Promise<ProjectRevisionPersistenceResult> {
  const attempt = captureAdmittedRunAttempt(project.runId, userId);
  const revision = await new SupabaseProjectRuntimeStore(attempt).saveRevision(userId, project);
  return { saved: true, revisionId: revision.revisionId, revisionNumber: revision.revisionNumber, reason: null };
}
