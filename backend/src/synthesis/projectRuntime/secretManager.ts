import {
  createDecipheriv,
  createHash,
  scryptSync,
} from 'node:crypto';

import {
  openRuntimeCredential,
  requireLegacyCredentialMigrationWindow,
  sealRuntimeCredential,
} from '../../services/integrations/credentialVaultRuntime.js';

import type {
  EncryptedProjectSecretRecord,
  ProjectRuntimeStore,
} from './store.js';

import type {
  ProjectSecretScope,
} from './types.js';

function encryptionKey(
  source:
    NodeJS.ProcessEnv,
): Buffer {
  const secret =
    source
      .USER_SECRETS_ENCRYPTION_KEY ||
    source
      .SUPABASE_SERVICE_ROLE_KEY ||
    source
      .SUPABASE_JWT_SECRET ||
    '';

  if (
    !secret.trim()
  ) {
    if (
      source.NODE_ENV ===
      'production'
    ) {
      throw new Error(
        'USER_SECRETS_ENCRYPTION_KEY is required for project runtime secrets.',
      );
    }

    return scryptSync(
      'xroga-dev-project-runtime-key',
      'xroga-project-runtime-v1',
      32,
    );
  }

  return scryptSync(
    secret.slice(
      0,
      128,
    ),

    'xroga-project-runtime-v1',

    32,
  );
}

function decryptLegacy(
  value:
    string,

  source:
    NodeJS.ProcessEnv,
): string {
  requireLegacyCredentialMigrationWindow();
  const parts =
    value.split(
      ':',
    );

  if (
    parts.length !==
      4 ||
    parts[0] !==
      'v1'
  ) {
    throw new Error(
      'Unsupported project secret format.',
    );
  }

  const decipher =
    createDecipheriv(
      'aes-256-gcm',

      encryptionKey(
        source,
      ),

      Buffer.from(
        parts[1]!,
        'base64',
      ),
    );

  decipher.setAuthTag(
    Buffer.from(
      parts[2]!,
      'base64',
    ),
  );

  return Buffer.concat([
    decipher.update(
      Buffer.from(
        parts[3]!,
        'base64',
      ),
    ),

    decipher.final(),
  ]).toString(
    'utf8',
  );
}

function runtimeSecretRecordId(
  projectId: string,
  name: string,
  scope: ProjectSecretScope,
): string {
  return createHash('sha256')
    .update(JSON.stringify(['project-runtime-secret', projectId, name, scope]))
    .digest('hex');
}

function runtimeSecretBinding(
  projectId: string,
  name: string,
  scope: ProjectSecretScope,
  revision: string,
) {
  return {
    provider: 'project-runtime',
    account: projectId,
    credentialType: 'runtime-secret',
    recordId: runtimeSecretRecordId(projectId, name, scope),
    revision: new Date(revision).toISOString(),
    scope: `${scope}:${name}`,
  } as const;
}

function validName(
  value:
    string,
): string {
  const name =
    value
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z_][A-Z0-9_]{1,63}$/.test(
      name,
    )
  ) {
    throw new Error(
      'Project secret names must use UPPER_SNAKE_CASE.',
    );
  }

  return name;
}

export function redactRuntimeSecrets(
  text:
    string,

  secrets:
    readonly string[],
): string {
  let redacted =
    text;

  for (
    const secret of
    secrets
  ) {
    if (
      secret.length <
      4
    ) {
      continue;
    }

    redacted =
      redacted.split(
        secret,
      ).join(
        '[REDACTED]',
      );
  }

  return redacted;
}

export class ProjectSecretManager {
  constructor(
    private readonly userId:
      string,

    private readonly store:
      ProjectRuntimeStore,

    private readonly keySource:
      NodeJS.ProcessEnv =
      process.env,
  ) {}

  async put(
    input: {
      projectId:
        string;

      name:
        string;

      value:
        string;

      scope:
        ProjectSecretScope;
    },
  ): Promise<void> {
    const name =
      validName(
        input.name,
      );

    if (
      !input.value.length
    ) {
      throw new Error(
        'Project secret value cannot be empty.',
      );
    }

    if (
      input.value.length >
      64_000
    ) {
      throw new Error(
        'Project secret is too large.',
      );
    }

    const now =
      new Date()
        .toISOString();

    const existing =
      await this.store
        .loadEncryptedSecrets(
          this.userId,
          input.projectId,
        );

    const previous =
      existing.find(
        (
          record,
        ) =>
          record.name ===
            name &&
          record.scope ===
            input.scope,
      );

    const record:
      EncryptedProjectSecretRecord = {
      userId:
        this.userId,

      projectId:
        input.projectId,

      name,

      scope:
        input.scope,

      encryptedValue:
        await sealRuntimeCredential(
          this.userId,
          runtimeSecretBinding(
            input.projectId,
            name,
            input.scope,
            now,
          ),
          input.value,
        ),

      keyVersion:
        3,

      createdAt:
        previous
          ?.createdAt ??
        now,

      updatedAt:
        now,
    };

    await this.store
      .saveEncryptedSecret(
        record,
      );
  }

  async remove(
    input: {
      projectId:
        string;

      name:
        string;

      scope:
        ProjectSecretScope;
    },
  ): Promise<void> {
    await this.store
      .deleteEncryptedSecret({
        userId:
          this.userId,

        projectId:
          input.projectId,

        name:
          validName(
            input.name,
          ),

        scope:
          input.scope,
      });
  }

  async list(
    projectId:
      string,
  ): Promise<
    Array<{
      name:
        string;

      scope:
        ProjectSecretScope;

      updatedAt:
        string;
    }>
  > {
    const records =
      await this.store
        .loadEncryptedSecrets(
          this.userId,
          projectId,
        );

    return records.map(
      (
        record,
      ) => ({
        name:
          record.name,

        scope:
          record.scope,

        updatedAt:
          record.updatedAt,
      }),
    );
  }

  async resolveEnvironment(
    projectId:
      string,

    scopes:
      readonly ProjectSecretScope[],
  ): Promise<
    Record<
      string,
      string
    >
  > {
    const allowed =
      new Set(
        scopes,
      );

    const records =
      await this.store
        .loadEncryptedSecrets(
          this.userId,
          projectId,
        );

    const env:
      Record<
        string,
        string
      > = {};

    /*
     * Shared values first.
     *
     * A scope-specific value with the same variable name may override it.
     */
    const ordered =
      [
        ...records,
      ].sort(
        (
          left,
          right,
        ) => {
          const leftShared =
            left.scope ===
            'shared'
              ? 0
              : 1;

          const rightShared =
            right.scope ===
            'shared'
              ? 0
              : 1;

          return (
            leftShared -
            rightShared
          );
        },
      );

    for (
      const record of
      ordered
    ) {
      if (
        record.scope !==
          'shared' &&
        !allowed.has(
          record.scope,
        )
      ) {
        continue;
      }

      const value = record.keyVersion === 3 && record.encryptedValue.startsWith('vault:v3:')
        ? await openRuntimeCredential(
            this.userId,
            runtimeSecretBinding(
              record.projectId,
              record.name,
              record.scope,
              record.updatedAt,
            ),
            record.encryptedValue,
          )
        : record.keyVersion === 1 && record.encryptedValue.startsWith('v1:')
          ? decryptLegacy(record.encryptedValue, this.keySource)
          : (() => { throw new Error('Unsupported project secret format.'); })();

      // Key-provider calls may wait. Re-read canonical authority so a rotation or
      // revocation completed during that wait cannot release stale plaintext.
      const current = (await this.store.loadEncryptedSecrets(this.userId, projectId))
        .find(candidate => candidate.name === record.name && candidate.scope === record.scope);
      if (!current || current.encryptedValue !== record.encryptedValue
        || current.keyVersion !== record.keyVersion || current.updatedAt !== record.updatedAt) {
        throw new Error('Project secret changed while it was being opened.');
      }

      env[record.name] = value;
    }

    return env;
  }
}
