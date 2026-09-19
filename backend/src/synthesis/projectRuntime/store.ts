import {
  createHash,
  randomUUID,
} from 'node:crypto';

import {
  getSupabaseAdmin,
} from '../../config/supabase.js';

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
  async saveRevision(
    userId:
      string,

    project:
      SoftwareProject,
  ): Promise<ProjectRevisionRecord> {
    const fingerprint =
      projectWorkspaceFingerprint(
        project,
      );

    const {
      data,
      error,
    } =
      await getSupabaseAdmin()
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
          'revision_id, revision_number, created_at',
        )
        .single();

    if (
      error ||
      !data
    ) {
      throw new Error(
        error?.message ??
        'Project revision was not persisted.',
      );
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

    return {
      revisionId:
        String(
          data.revision_id,
        ),

      userId,

      projectId,

      runId:
        String(
          data.run_id,
        ),

      revisionNumber:
        Number(
          data.revision_number,
        ),

      workspaceFingerprint:
        String(
          data.workspace_fingerprint,
        ),

      project:
        clone(
          data.software_project as
            SoftwareProject,
        ),

      createdAt:
        String(
          data.created_at,
        ),
    };
  }

  async saveSession(
    session:
      ProjectRuntimeSession,
  ): Promise<void> {
    const {
      error,
    } =
      await getSupabaseAdmin()
        .from(
          'project_runtime_sessions',
        )
        .upsert(
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

          {
            onConflict:
              'session_id',
          },
        );

    if (
      error
    ) {
      throw error;
    }
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
          'state',
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

    return data?.state
      ? clone(
          data.state as
            ProjectRuntimeSession,
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
          'name, scope, encrypted_value, key_version, created_at, updated_at',
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

    return (
      data ??
      []
    ).map(
      (
        row,
      ) => ({
        userId,

        projectId,

        name:
          String(
            row.name,
          ),

        scope:
          row.scope as
            ProjectSecretScope,

        encryptedValue:
          String(
            row.encrypted_value,
          ),

        keyVersion:
          Number(
            row.key_version,
          ),

        createdAt:
          String(
            row.created_at,
          ),

        updatedAt:
          String(
            row.updated_at,
          ),
      }),
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
