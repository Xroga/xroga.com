import {
  randomUUID,
} from 'node:crypto';

import type {
  ProjectFile,
} from '../../ai/patches.js';

import {
  buildSandboxEnvironment,
} from '../../sandbox/sandboxEnvironment.js';

import {
  flyProjectRuntimeProviderFromEnvironment,
} from './flyProvider.js';

import {
  ProjectSecretManager,
  redactRuntimeSecrets,
} from './secretManager.js';

import {
  SupabaseProjectRuntimeStore,
  type ProjectRuntimeStore,
} from './store.js';

import type {
  ProjectRuntimeBinding,
  ProjectRuntimeCommand,
  ProjectRuntimeCommandResult,
  ProjectRuntimeCreateInput,
  ProjectRuntimePort,
  ProjectRuntimeProcessRecord,
  ProjectRuntimeProvider,
  ProjectRuntimeSession,
  RuntimePortExposure,
  RuntimeProcessStartInput,
  RuntimeSnapshot,
} from './types.js';

export class ProjectRuntimeUnavailableError
  extends
    Error {
  readonly code =
    'PROJECT_RUNTIME_UNAVAILABLE' as const;

  constructor(
    detail:
      string,
  ) {
    super(
      detail,
    );

    this.name =
      'ProjectRuntimeUnavailableError';
  }
}

function defaultProviders():
  ProjectRuntimeProvider[] {
  const fly =
    flyProjectRuntimeProviderFromEnvironment();

  return fly
    ? [
        fly,
      ]
    : [];
}

export class ProjectRuntimeManager {
  private readonly secrets:
    ProjectSecretManager;

  constructor(
    private readonly userId:
      string,

    private readonly store:
      ProjectRuntimeStore,

    private readonly providers:
      readonly ProjectRuntimeProvider[] =
      defaultProviders(),
  ) {
    this.secrets =
      new ProjectSecretManager(
        userId,
        store,
      );
  }

  private provider(
    id:
      string,
  ): ProjectRuntimeProvider {
    const provider =
      this.providers.find(
        (
          candidate,
        ) =>
          candidate.id ===
          id,
      );

    if (
      !provider
    ) {
      throw new ProjectRuntimeUnavailableError(
        `Runtime provider "${id}" is not configured.`,
      );
    }

    return provider;
  }

  private async selectProvider(
    runtimeClass:
      'interactive'
      | 'verification',
  ): Promise<ProjectRuntimeProvider> {
    for (
      const provider of
      this.providers
    ) {
      const probe =
        await provider.probe();

      if (
        !probe.available
      ) {
        continue;
      }

      if (
        runtimeClass ===
          'interactive' &&
        (
          !provider
            .capabilities
            .persistentSessions ||
          !provider
            .capabilities
            .persistentProcesses ||
          !provider
            .capabilities
            .fileReadWrite ||
          !provider
            .capabilities
            .commandExec
        )
      ) {
        continue;
      }

      return provider;
    }

    throw new ProjectRuntimeUnavailableError(
      runtimeClass ===
        'interactive'
        ? 'No configured provider supports persistent interactive project runtimes.'
        : 'No configured project runtime provider is available.',
    );
  }

  private async session(
    sessionId:
      string,
  ): Promise<ProjectRuntimeSession> {
    const session =
      await this.store
        .loadSession(
          this.userId,
          sessionId,
        );

    if (
      !session
    ) {
      throw new Error(
        'Project runtime session does not exist.',
      );
    }

    return session;
  }

  private async resolvedSecrets(
    projectId:
      string,

    scopes:
      readonly (
        | 'development'
        | 'preview'
        | 'verification'
        | 'deployment'
        | 'shared'
      )[],
  ): Promise<Record<string, string>> {
    return this.secrets
      .resolveEnvironment(
        projectId,
        scopes,
      );
  }

  async create(
    input:
      ProjectRuntimeCreateInput,
  ): Promise<ProjectRuntimeSession> {
    const provider =
      await this.selectProvider(
        input.runtimeClass,
      );

        /*
     * A runtime session itself never receives project secrets.
     *
     * Secrets are decrypted only for the exact exec/process operation
     * that requested an allowed scope. This prevents one preview
     * process from reading credentials intended for another operation.
     */
    if (
      (
        input.secretScopes
          ?.length ??
        0
      ) >
      0
    ) {
      throw new Error(
        'Project secrets cannot be injected at runtime creation. Request secret scopes on exec/startProcess instead.',
      );
    }

    const secretEnvironment:
      Record<
        string,
        string
      > = {};

    const environment =
      buildSandboxEnvironment(
        {
          ...(input.environment ??
            {}),
        },
      );

    const session =
      await provider.create({
        userId:
          this.userId,

        projectId:
          input.projectId,

        runtimeClass:
          input.runtimeClass,

        files:
          input.files,

        image:
          input.image ??
          null,

        environment,

        secretEnvironment,

        limits:
          input.limits,

        ttlSeconds:
          input.ttlSeconds ??
          45 *
            60,
      });

    await this.store
      .saveSession(
        session,
      );

    await this.store
      .appendEvent({
        userId:
          this.userId,

        projectId:
          session.projectId,

        sessionId:
          session.sessionId,

        eventType:
          'runtime.created',

        payload: {
          providerId:
            provider.id,

          runtimeClass:
            session.runtimeClass,
        },
      });

    return session;
  }

  async restore(
    sessionId:
      string,
  ): Promise<ProjectRuntimeSession> {
    const persisted =
      await this.session(
        sessionId,
      );

    const restored =
      await this.provider(
        persisted.providerId,
      ).restore(
        persisted,
      );

    await this.store
      .saveSession(
        restored,
      );

    return restored;
  }

  async destroy(
    sessionId:
      string,
  ): Promise<void> {
    const session =
      await this.session(
        sessionId,
      );

    const provider =
      this.provider(
        session.providerId,
      );

    await provider.destroy(
      session,
    );

    const updated:
      ProjectRuntimeSession = {
      ...session,

      status:
        'destroyed',

      processes:
        session.processes.map(
          (
            process,
          ) => ({
            ...process,

            status:
              'stopped',

            stoppedAt:
              process.stoppedAt ??
              new Date()
                .toISOString(),
          }),
        ),

      ports:
        session.ports.map(
          (
            port,
          ) => ({
            ...port,

            status:
              'stopped',
          }),
        ),

      updatedAt:
        new Date()
          .toISOString(),
    };

    await this.store
      .saveSession(
        updated,
      );

    await this.store
      .appendEvent({
        userId:
          this.userId,

        projectId:
          session.projectId,

        sessionId:
          session.sessionId,

        eventType:
          'runtime.destroyed',
      });
  }

  async writeFiles(
    sessionId:
      string,

    files:
      readonly ProjectFile[],
  ): Promise<ProjectRuntimeSession> {
    const session =
      await this.session(
        sessionId,
      );

    const provider =
      this.provider(
        session.providerId,
      );

    await provider.writeFiles(
      session,
      files,
    );

    const paths =
      new Set([
        ...session.knownFiles,

        ...files.map(
          (
            file,
          ) =>
            file.path,
        ),
      ]);

    const updated:
      ProjectRuntimeSession = {
      ...session,

      knownFiles:
        [...paths]
          .sort(),

      workspaceRevision:
        session
          .workspaceRevision +
        1,

      updatedAt:
        new Date()
          .toISOString(),
    };

    await this.store
      .saveSession(
        updated,
      );

    await this.store
      .appendEvent({
        userId:
          this.userId,

        projectId:
          session.projectId,

        sessionId:
          session.sessionId,

        eventType:
          'runtime.files_written',

        payload: {
          paths:
            files.map(
              (
                file,
              ) =>
                file.path,
            ),

          workspaceRevision:
            updated.workspaceRevision,
        },
      });

    return updated;
  }

  async exec(
    sessionId:
      string,

    input:
      ProjectRuntimeCommand,
  ): Promise<ProjectRuntimeCommandResult> {
    const session =
      await this.session(
        sessionId,
      );

    const provider =
      this.provider(
        session.providerId,
      );

    const secretEnvironment =
      await this.resolvedSecrets(
        session.projectId,
        input.secretScopes ??
          [],
      );

    const environment =
      buildSandboxEnvironment(
        {
          ...(input.environment ??
            {}),
        },
      );

    const result =
      await provider.exec(
        session,
        {
          ...input,

          environment,

          secretEnvironment,
        },
      );

    const secretValues =
      Object.values(
        secretEnvironment,
      );

    const safe:
      ProjectRuntimeCommandResult = {
      ...result,

      stdout:
        redactRuntimeSecrets(
          result.stdout,
          secretValues,
        ),

      stderr:
        redactRuntimeSecrets(
          result.stderr,
          secretValues,
        ),
    };

    await this.store
      .appendEvent({
        userId:
          this.userId,

        projectId:
          session.projectId,

        sessionId:
          session.sessionId,

        eventType:
          'runtime.command',

        payload: {
          command:
            input.command,

          args:
            input.args ??
            [],

          cwd:
            input.cwd ??
            '',

          exitCode:
            safe.exitCode,

          durationMs:
            safe.durationMs,

          networkPolicy:
            input.networkPolicy ??
            'restricted',
        },
      });

    return safe;
  }

  async startProcess(
    sessionId:
      string,

    input:
      RuntimeProcessStartInput,
  ): Promise<ProjectRuntimeProcessRecord> {
    const session =
      await this.session(
        sessionId,
      );

    const provider =
      this.provider(
        session.providerId,
      );

    const secretScopes =
      input.secretScopes ??
      [];

    const secretEnvironment =
      await this.resolvedSecrets(
        session.projectId,
        secretScopes,
      );

    const environment =
      buildSandboxEnvironment(
        {
          ...(input.environment ??
            {}),
        },
      );

    const started =
      await provider
        .startProcess(
          session,
          {
            ...input,

            environment,

            secretEnvironment,

            secretScopes,
          },
        );

    const processId =
      randomUUID();

    const record:
      ProjectRuntimeProcessRecord = {
      processId,

      pid:
        started.pid,

      command:
        input.command,

      args:
        input.args ??
        [],

      cwd:
        input.cwd ??
        '',

      status:
        'running',

      restartPolicy:
        input.restartPolicy ??
        'never',

      networkPolicy:
        input.networkPolicy ??
        'restricted',

      environmentKeys:
        Object.keys(
          input.environment ??
          {},
        ),

      secretScopes,

      port:
        input.port ??
        null,

      logPath:
        started.logPath,

      startedAt:
        new Date()
          .toISOString(),

      stoppedAt:
        null,
    };

    const ports:
      ProjectRuntimePort[] = [
      ...session.ports,
    ];

    if (
      record.port
    ) {
      ports.push({
        port:
          record.port,

        protocol:
          'http',

        processId,

        status:
          'declared',
      });
    }

    const updated:
      ProjectRuntimeSession = {
      ...session,

      processes: [
        ...session.processes,
        record,
      ],

      ports,

      updatedAt:
        new Date()
          .toISOString(),
    };

    await this.store
      .saveSession(
        updated,
      );

    await this.store
      .appendEvent({
        userId:
          this.userId,

        projectId:
          session.projectId,

        sessionId:
          session.sessionId,

        eventType:
          'runtime.process_started',

        payload: {
          processId,
          command:
            input.command,
          port:
            record.port,
        },
      });

    return record;
  }

  async stopProcess(
    sessionId:
      string,

    processId:
      string,
  ): Promise<void> {
    const session =
      await this.session(
        sessionId,
      );

    const process =
      session.processes.find(
        (
          candidate,
        ) =>
          candidate.processId ===
          processId,
      );

    if (
      !process
    ) {
      throw new Error(
        'Runtime process does not exist.',
      );
    }

    await this.provider(
      session.providerId,
    ).stopProcess(
      session,
      process,
    );

    const stoppedAt =
      new Date()
        .toISOString();

    const updated:
      ProjectRuntimeSession = {
      ...session,

      processes:
        session.processes.map(
          (
            candidate,
          ) =>
            candidate.processId ===
              processId
              ? {
                  ...candidate,

                  status:
                    'stopped',

                  stoppedAt,
                }
              : candidate,
        ),

      ports:
        session.ports.map(
          (
            port,
          ) =>
            port.processId ===
              processId
              ? {
                  ...port,

                  status:
                    'stopped',
                }
              : port,
        ),

      updatedAt:
        stoppedAt,
    };

    await this.store
      .saveSession(
        updated,
      );
  }

  async logs(
    sessionId:
      string,

    processId:
      string,
  ): Promise<string> {
    const session =
      await this.session(
        sessionId,
      );

    const process =
      session.processes.find(
        (
          candidate,
        ) =>
          candidate.processId ===
          processId,
      );

    if (
      !process
    ) {
      throw new Error(
        'Runtime process does not exist.',
      );
    }

    const logs =
      await this.provider(
        session.providerId,
      ).processLogs(
        session,
        process,
      );

    const secrets =
      await this.resolvedSecrets(
        session.projectId,
        process.secretScopes,
      );

    return redactRuntimeSecrets(
      logs,
      Object.values(
        secrets,
      ),
    );
  }

  async snapshot(
    sessionId:
      string,
  ): Promise<RuntimeSnapshot> {
    const session =
      await this.session(
        sessionId,
      );

    return this.provider(
      session.providerId,
    ).snapshot(
      session,
    );
  }

  async listPorts(
    sessionId:
      string,
  ): Promise<
    readonly ProjectRuntimePort[]
  > {
    const session =
      await this.session(
        sessionId,
      );

    return session.ports;
  }

  async exposePort(
    sessionId:
      string,

    port:
      number,
  ): Promise<RuntimePortExposure | null> {
    const session =
      await this.session(
        sessionId,
      );

    return this.provider(
      session.providerId,
    ).exposePort(
      session,
      port,
    );
  }

  async binding(
    sessionId:
      string,
  ): Promise<ProjectRuntimeBinding> {
    const session =
      await this.session(
        sessionId,
      );

    return {
      sessionId:
        session.sessionId,

      providerId:
        session.providerId,

      runtimeClass:
        session.runtimeClass,

      status:
        session.status,

      workspaceRevision:
        session.workspaceRevision,

      updatedAt:
        session.updatedAt,
    };
  }

  secretManager():
    ProjectSecretManager {
    return this.secrets;
  }
}

export function createProjectRuntimeManager(
  userId:
    string,
): ProjectRuntimeManager {
  return new ProjectRuntimeManager(
    userId,

    new SupabaseProjectRuntimeStore(),
  );
}
