import {
  randomUUID,
} from 'node:crypto';

import type {
  ProjectFile,
} from '../../ai/patches.js';

import {
  DEFAULT_SANDBOX_LIMITS,
} from '../../sandbox/sandboxTypes.js';

import {
  allowedCpuCount,
  readExecExitCode,
  roundedMemoryMb,
} from '../../sandbox/flyMachineSandbox.js';

import type {
  ProjectRuntimeCommandResult,
  ProjectRuntimeProvider,
  ProjectRuntimeProviderProbe,
  ProjectRuntimeSession,
  ProviderRuntimeCommand,
  ProviderRuntimeCreateInput,
  ProviderRuntimeProcessStartInput,
  RuntimePortExposure,
  RuntimeProcessStartResult,
  RuntimeSnapshot,
  ProjectRuntimeProcessRecord,
} from './types.js';

const DEFAULT_API_HOST =
  'https://api.machines.dev';

const DEFAULT_IMAGE =
  'registry-1.docker.io/library/node:20-alpine';

const DEFAULT_TTL_SECONDS =
  45 * 60;

const MAX_TTL_SECONDS =
  2 * 60 * 60;

const MAX_CAPTURE =
  80_000;

function capture(
  value:
    unknown,
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value.length >
    MAX_CAPTURE
    ? value.slice(
        -MAX_CAPTURE,
      )
    : value;
}

function safePath(
  path:
    string,
): string {
  const normalized =
    path
      .replaceAll(
        '\\',
        '/',
      )
      .replace(
        /^\.\/+/,
        '',
      );

  if (
    !normalized ||
    normalized.startsWith(
      '/',
    ) ||
    normalized.includes(
      '\0',
    ) ||
    normalized
      .split(
        '/',
      )
      .some(
        (
          part,
        ) =>
          part ===
            '..' ||
          part ===
            '',
      )
  ) {
    throw new Error(
      `Unsafe runtime path: ${path}`,
    );
  }

  return normalized;
}

function runtimePath(
  path:
    string,
): string {
  return `/work/${safePath(
    path,
  )}`;
}

function shellQuote(
  value:
    string,
): string {
  return `"${value.replace(
    /(["\\$`])/g,
    '\\$1',
  )}"`;
}

function environmentPrefix(
  environment:
    Readonly<
      Record<
        string,
        string
      >
    >,
): string {
  const entries =
    Object.entries(
      environment,
    );

  if (
    !entries.length
  ) {
    return '';
  }

  for (
    const [
      name,
    ] of
    entries
  ) {
    if (
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(
        name,
      )
    ) {
      throw new Error(
        `Unsafe environment variable name: ${name}`,
      );
    }
  }

  return `env ${entries
    .map(
      (
        [
          name,
          value,
        ],
      ) =>
        `${name}=${shellQuote(
          value,
        )}`,
    )
    .join(
      ' ',
    )} `;
}

export function executableLine(
  command:
    string,

  args:
    readonly string[],

    networkPolicy:
    'none'
    | 'registry-only'
    | 'restricted'
    | 'preview',
): string {
  const argv =
    [
      command,
      ...args,
    ]
      .map(
        shellQuote,
      )
      .join(
        ' ',
      );

    /*
   * Fail closed.
   *
   * "restricted" must never mean ordinary unrestricted internet.
   * Until a host/domain-aware egress gateway is added, restricted
   * receives the same denied-egress boundary as none.
   *
   * registry-only is the one explicit networked mode used for
   * dependency resolution.
   */
    return (
    networkPolicy ===
      'registry-only' ||
    networkPolicy ===
      'preview'
  )
    ? argv
    : `unshare -n ${argv}`;
}

function commandScript(
  input:
    ProviderRuntimeCommand,
): string {
  const cwd =
    input.cwd
      ?.trim()
      ? runtimePath(
          input.cwd,
        )
      : '/work';

  const env =
    environmentPrefix({
      ...input.environment,
      ...input.secretEnvironment,
    });

  return [
    `mkdir -p ${shellQuote(
      cwd,
    )}`,

    `cd ${shellQuote(
      cwd,
    )}`,

    `${env}${executableLine(
      input.command,
      input.args ??
        [],
      input.networkPolicy ??
        'restricted',
    )}`,
  ].join(
    ' && ',
  );
}

function processScript(
  input:
    ProviderRuntimeProcessStartInput,

  logPath:
    string,
): string {
  const cwd =
    input.cwd
      ?.trim()
      ? runtimePath(
          input.cwd,
        )
      : '/work';

  const env =
    environmentPrefix({
      ...input.environment,
      ...input.secretEnvironment,
    });

  const executable =
    `${env}${executableLine(
      input.command,
      input.args ??
        [],
      input.networkPolicy ??
        'restricted',
    )}`;

  return [
    `mkdir -p ${shellQuote(
      cwd,
    )}`,

    `cd ${shellQuote(
      cwd,
    )}`,

    `nohup ${executable} > ${shellQuote(
      logPath,
    )} 2>&1 < /dev/null & echo $!`,
  ].join(
    ' && ',
  );
}

export interface FlyProjectRuntimeProviderOptions {
  readonly app:
    string;

  readonly token:
    string;

  readonly region?:
    string;

  readonly apiHost?:
    string;

  readonly defaultImage?:
    string;

  readonly ownApp?:
    string;

  readonly fetchImpl?:
    typeof fetch;
}

export class FlyProjectRuntimeProvider
  implements
    ProjectRuntimeProvider {
  readonly id =
    'fly-project-runtime';

  readonly capabilities = {
    persistentSessions:
      true,

    persistentProcesses:
      true,

    fileReadWrite:
      true,

    commandExec:
      true,

    snapshots:
      true,

        /*
     * Ports are currently tracked from declared process metadata.
     * We do not yet inspect the guest's listening sockets.
     */
    portDiscovery:
      false,

    /*
     * Step 4 owns the Preview Gateway.
     *
     * The runtime does not directly publish a random generated server.
     */
    publicPortExposure:
      false,

    secretInjection:
      true,

    networkIsolation:
      true,
  } as const;

  private readonly app:
    string;

  private readonly token:
    string;

  private readonly region?:
    string;

  private readonly apiHost:
    string;

  private readonly defaultImage:
    string;

  private readonly ownApp?:
    string;

  private readonly fetchImpl:
    typeof fetch;

  constructor(
    options:
      FlyProjectRuntimeProviderOptions,
  ) {
    this.app =
      options.app;

    this.token =
      options.token;

    this.region =
      options.region;

    this.apiHost =
      (
        options.apiHost ??
        DEFAULT_API_HOST
      ).replace(
        /\/+$/,
        '',
      );

    this.defaultImage =
      options.defaultImage ??
      DEFAULT_IMAGE;

    this.ownApp =
      options.ownApp;

    this.fetchImpl =
      options.fetchImpl ??
      fetch;
  }

  private headers():
    Record<
      string,
      string
    > {
    return {
      'content-type':
        'application/json',

      authorization:
        `Bearer ${this.token}`,
    };
  }

  private selfTargeting():
    boolean {
    return Boolean(
      this.ownApp &&
      this.ownApp ===
        this.app,
    );
  }

  private machineId(
    session:
      ProjectRuntimeSession,
  ): string {
    const machineId =
      session
        .providerState
        .machineId;

    if (
      typeof machineId !==
        'string' ||
      !machineId
    ) {
      throw new Error(
        'Runtime session does not contain a Fly machine id.',
      );
    }

    return machineId;
  }

  private async execRaw(
    session:
      ProjectRuntimeSession,

    script:
      string,

    timeoutMs =
      120_000,
  ): Promise<ProjectRuntimeCommandResult> {
    const started =
      Date.now();

    const machineId =
      this.machineId(
        session,
      );

    const response =
      await this.fetchImpl(
        `${this.apiHost}/v1/apps/${this.app}/machines/${machineId}/exec`,

        {
          method:
            'POST',

          headers:
            this.headers(),

          body:
            JSON.stringify({
              command: [
                '/bin/sh',
                '-lc',
                script,
              ],

              timeout:
                Math.ceil(
                  timeoutMs /
                    1000,
                ),
            }),
        },
      );

    if (
      !response.ok
    ) {
      return {
        exitCode:
          null,

        stdout:
          '',

        stderr:
          `Fly runtime exec returned HTTP ${response.status}.`,

        timedOut:
          false,

        durationMs:
          Date.now() -
          started,
      };
    }

    const body =
      await response.json() as
        Record<
          string,
          unknown
        >;

    return {
      exitCode:
        readExecExitCode(
          body,
        ),

      stdout:
        capture(
          body.stdout,
        ),

      stderr:
        capture(
          body.stderr,
        ),

      timedOut:
        false,

      durationMs:
        Date.now() -
        started,
    };
  }

  async probe():
    Promise<ProjectRuntimeProviderProbe> {
    if (
      this.selfTargeting()
    ) {
      return {
        available:
          false,

        providerId:
          this.id,

        detail:
          'Project runtimes must run in a separate Fly app that carries no Xroga control-plane secrets.',
      };
    }

    try {
      const response =
        await this.fetchImpl(
          `${this.apiHost}/v1/apps/${this.app}/machines`,

          {
            method:
              'GET',

            headers:
              this.headers(),
          },
        );

      return {
        available:
          response.ok,

        providerId:
          this.id,

        detail:
          response.ok
            ? 'Fly project runtime is available.'
            : `Fly Machines API returned HTTP ${response.status}.`,
      };
    } catch (
      error
    ) {
      return {
        available:
          false,

        providerId:
          this.id,

        detail:
          error instanceof Error
            ? error.message
            : String(
                error,
              ),
      };
    }
  }

  async create(
    input:
      ProviderRuntimeCreateInput,
  ): Promise<ProjectRuntimeSession> {
    if (
      this.selfTargeting()
    ) {
      throw new Error(
        'Refusing to create a project runtime inside the Xroga API app.',
      );
    }

        if (
      Object.keys(
        input.secretEnvironment,
      ).length >
      0
    ) {
      throw new Error(
        'Project runtime secrets may only be injected into scoped commands/processes, never into the machine-wide environment.',
      );
    }
    

    const now =
      new Date();

    const ttl =
      Math.max(
        60,

        Math.min(
          input.ttlSeconds,
          MAX_TTL_SECONDS,
        ),
      );

    const expires =
      new Date(
        now.getTime() +
          ttl *
            1000,
      );

    const limits = {
      ...DEFAULT_SANDBOX_LIMITS,
      ...input.limits,
    };

    const cpus =
      allowedCpuCount(
        limits.cpuSeconds /
          60,
      );

    const machineConfig = {
      region:
        this.region,

      config: {
        image:
          input.image ??
          this.defaultImage,

        init: {
          exec: [
            '/bin/sleep',
            String(
              ttl,
            ),
          ],
        },

        auto_destroy:
          true,

        restart: {
          policy:
            'no',
        },

        guest: {
          cpu_kind:
            'shared',

          cpus,

          memory_mb:
            roundedMemoryMb(
              limits.memoryMb,
              cpus,
            ),
        },

                env: {
          ...input.environment,
        },

        /*
         * Deliberately no services.
         *
         * Step 4's gateway becomes the only public Preview path.
         */
        files:
          input.files.map(
            (
              file,
            ) => ({
              guest_path:
                runtimePath(
                  file.path,
                ),

              raw_value:
                Buffer.from(
                  file.content,
                  'utf8',
                ).toString(
                  'base64',
                ),
            }),
          ),
      },
    };

    const response =
      await this.fetchImpl(
        `${this.apiHost}/v1/apps/${this.app}/machines`,

        {
          method:
            'POST',

          headers:
            this.headers(),

          body:
            JSON.stringify(
              machineConfig,
            ),
        },
      );

    if (
      !response.ok
    ) {
      throw new Error(
        `Could not create project runtime machine: HTTP ${response.status}.`,
      );
    }

    const machine =
      await response.json() as
        Record<
          string,
          unknown
        >;

    const machineId =
      typeof machine.id ===
        'string'
        ? machine.id
        : null;

    if (
      !machineId
    ) {
      throw new Error(
        'Fly did not return a machine id.',
      );
    }

    const waited =
      await this.fetchImpl(
        `${this.apiHost}/v1/apps/${this.app}/machines/${machineId}/wait?state=started&timeout=60`,

        {
          method:
            'GET',

          headers:
            this.headers(),
        },
      );

    if (
      !waited.ok
    ) {
      await this.fetchImpl(
        `${this.apiHost}/v1/apps/${this.app}/machines/${machineId}?force=true`,

        {
          method:
            'DELETE',

          headers:
            this.headers(),
        },
      ).catch(
        () =>
          undefined,
      );

      throw new Error(
        'Project runtime machine did not reach started state.',
      );
    }

    return {
      schemaVersion:
        '1.0.0',

      sessionId:
        randomUUID(),

      userId:
        input.userId,

      projectId:
        input.projectId,

      providerId:
        this.id,

      runtimeClass:
        input.runtimeClass,

      status:
        'running',

      image:
        input.image ??
        this.defaultImage,

      workspaceRevision:
        1,

      knownFiles:
        input.files
          .map(
            (
              file,
            ) =>
              file.path,
          )
          .sort(),

      processes:
        [],

      ports:
        [],

      providerState: {
        machineId,
        app:
          this.app,
      },

      createdAt:
        now.toISOString(),

      updatedAt:
        now.toISOString(),

      expiresAt:
        expires.toISOString(),
    };
  }

  async restore(
    session:
      ProjectRuntimeSession,
  ): Promise<ProjectRuntimeSession> {

        if (
      session.expiresAt &&
      Date.parse(
        session.expiresAt,
      ) <=
        Date.now()
    ) {
      throw new Error(
        'Persisted runtime session has expired.',
      );
    }
    
    const machineId =
      this.machineId(
        session,
      );

    const response =
      await this.fetchImpl(
        `${this.apiHost}/v1/apps/${this.app}/machines/${machineId}`,

        {
          method:
            'GET',

          headers:
            this.headers(),
        },
      );

        if (
      !response.ok
    ) {
      throw new Error(
        'Persisted runtime machine no longer exists.',
      );
    }

    const machine =
      await response.json() as
        Record<
          string,
          unknown
        >;

    const state =
      typeof machine.state ===
        'string'
        ? machine.state
        : null;

    if (
      state &&
      state !==
        'started'
    ) {
      throw new Error(
        `Persisted runtime machine is not running (${state}).`,
      );
    }

    return {
      ...session,

      status:
        'running',

      updatedAt:
        new Date()
          .toISOString(),
    };
  }

  async destroy(
    session:
      ProjectRuntimeSession,
  ): Promise<void> {
    const machineId =
      this.machineId(
        session,
      );

    await this.fetchImpl(
      `${this.apiHost}/v1/apps/${this.app}/machines/${machineId}?force=true`,

      {
        method:
          'DELETE',

        headers:
          this.headers(),
      },
    ).catch(
      () =>
        undefined,
    );
  }

  async writeFiles(
    session:
      ProjectRuntimeSession,

    files:
      readonly ProjectFile[],
  ): Promise<void> {
    for (
      const file of
      files
    ) {
      const target =
        runtimePath(
          file.path,
        );

      const slash =
        target.lastIndexOf(
          '/',
        );

      const directory =
        slash >
        0
          ? target.slice(
              0,
              slash,
            )
          : '/work';

      const encoded =
        Buffer.from(
          file.content,
          'utf8',
        ).toString(
          'base64',
        );

      const result =
        await this.execRaw(
          session,

          [
            `mkdir -p ${shellQuote(
              directory,
            )}`,

            `printf %s ${shellQuote(
              encoded,
            )} | base64 -d > ${shellQuote(
              target,
            )}`,
          ].join(
            ' && ',
          ),
        );

      if (
        result.exitCode !==
        0
      ) {
        throw new Error(
          `Could not write runtime file ${file.path}: ${result.stderr}`,
        );
      }
    }
  }

  async readFile(
    session:
      ProjectRuntimeSession,

    path:
      string,
  ): Promise<string | null> {
    const result =
      await this.execRaw(
        session,

        `base64 ${shellQuote(
          runtimePath(
            path,
          ),
        )}`,
      );

    if (
      result.exitCode !==
      0
    ) {
      return null;
    }

    try {
      return Buffer.from(
        result.stdout.replace(
          /\s+/g,
          '',
        ),
        'base64',
      ).toString(
        'utf8',
      );
    } catch {
      return null;
    }
  }

  async exec(
    session:
      ProjectRuntimeSession,

    command:
      ProviderRuntimeCommand,
  ): Promise<ProjectRuntimeCommandResult> {
    return this.execRaw(
      session,

      commandScript(
        command,
      ),

      command.timeoutMs ??
        120_000,
    );
  }

  async startProcess(
    session:
      ProjectRuntimeSession,

    input:
      ProviderRuntimeProcessStartInput,
  ): Promise<RuntimeProcessStartResult> {
    const processId =
      randomUUID();

    const logPath =
      `/tmp/xroga-${processId}.log`;

    const result =
      await this.execRaw(
        session,

        processScript(
          input,
          logPath,
        ),

        15_000,
      );

    if (
      result.exitCode !==
        0
    ) {
      throw new Error(
        `Could not start runtime process: ${result.stderr}`,
      );
    }

    const pid =
      Number.parseInt(
        result.stdout.trim(),
        10,
      );

    if (
      !Number.isFinite(
        pid,
      ) ||
      pid <=
        0
    ) {
      throw new Error(
        'Runtime process did not return a valid PID.',
      );
    }

    return {
      pid,
      logPath,
    };
  }

  async stopProcess(
    session:
      ProjectRuntimeSession,

    process:
      ProjectRuntimeProcessRecord,
  ): Promise<void> {
    await this.execRaw(
      session,

      [
        `kill -TERM ${process.pid} 2>/dev/null || true`,
        'sleep 1',
        `kill -KILL ${process.pid} 2>/dev/null || true`,
      ].join(
        '; ',
      ),

      5_000,
    );
  }

  async processLogs(
    session:
      ProjectRuntimeSession,

    process:
      ProjectRuntimeProcessRecord,
  ): Promise<string> {
    const result =
      await this.execRaw(
        session,

        `tail -c ${MAX_CAPTURE} ${shellQuote(
          process.logPath,
        )} 2>/dev/null || true`,

        5_000,
      );

    return result.stdout;
  }

  async snapshot(
    session:
      ProjectRuntimeSession,
  ): Promise<RuntimeSnapshot> {
    const files:
      ProjectFile[] =
      [];

    for (
      const path of
      session.knownFiles
    ) {
      const content =
        await this.readFile(
          session,
          path,
        );

      if (
        content !==
        null
      ) {
        files.push({
          path,
          content,
        });
      }
    }

    return {
      files,

      createdAt:
        new Date()
          .toISOString(),
    };
  }

  async exposePort(
    _session:
      ProjectRuntimeSession,

    _port:
      number,
  ): Promise<RuntimePortExposure | null> {
    /*
     * Public exposure is intentionally Step 4 Preview Gateway work.
     *
     * Returning null is capability truth, not an implementation failure.
     */
    return null;
  }
}

export function flyProjectRuntimeProviderFromEnvironment(
  env:
    NodeJS.ProcessEnv =
    process.env,
): FlyProjectRuntimeProvider | null {
  const app =
    env
      .XROGA_SANDBOX_FLY_APP
      ?.trim();

  const token =
    env
      .XROGA_SANDBOX_FLY_TOKEN
      ?.trim();

  if (
    !app ||
    !token
  ) {
    return null;
  }

  return new FlyProjectRuntimeProvider({
    app,
    token,

    region:
      env
        .XROGA_SANDBOX_FLY_REGION
        ?.trim() ||
      undefined,

    defaultImage:
      env
        .XROGA_SANDBOX_FLY_IMAGE
        ?.trim() ||
      undefined,

    ownApp:
      env
        .FLY_APP_NAME
        ?.trim() ||
      undefined,
  });
}
