import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

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

function encrypt(
  value:
    string,

  source:
    NodeJS.ProcessEnv,
): string {
  const iv =
    randomBytes(
      12,
    );

  const cipher =
    createCipheriv(
      'aes-256-gcm',
      encryptionKey(
        source,
      ),
      iv,
    );

  const encrypted =
    Buffer.concat([
      cipher.update(
        value,
        'utf8',
      ),

      cipher.final(),
    ]);

  const tag =
    cipher.getAuthTag();

  return [
    'v1',
    iv.toString(
      'base64',
    ),
    tag.toString(
      'base64',
    ),
    encrypted.toString(
      'base64',
    ),
  ].join(
    ':',
  );
}

function decrypt(
  value:
    string,

  source:
    NodeJS.ProcessEnv,
): string {
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
        encrypt(
          input.value,
          this.keySource,
        ),

      keyVersion:
        1,

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

      env[
        record.name
      ] =
        decrypt(
          record.encryptedValue,
          this.keySource,
        );
    }

    return env;
  }
}
