import type {
  ProjectFile,
} from '../../ai/patches.js';

import type {
  SandboxLimits,
  SandboxNetworkPolicy,
} from '../../sandbox/sandboxTypes.js';

export const PROJECT_RUNTIME_SCHEMA_VERSION =
  '1.0.0' as const;

export type ProjectRuntimeClass =
  | 'interactive'
  | 'verification';

export type ProjectRuntimeStatus =
  | 'creating'
  | 'running'
  | 'stopped'
  | 'failed'
  | 'destroyed';

export type ProjectSecretScope =
  | 'development'
  | 'preview'
  | 'verification'
  | 'deployment'
  | 'shared';

export type RuntimeProcessStatus =
  | 'running'
  | 'stopped'
  | 'failed';

export type RuntimeRestartPolicy =
  | 'never'
  | 'on_failure';

export interface ProjectRuntimeCapabilities {
  readonly persistentSessions:
    boolean;

  readonly persistentProcesses:
    boolean;

  readonly fileReadWrite:
    boolean;

  readonly commandExec:
    boolean;

  readonly snapshots:
    boolean;

  readonly portDiscovery:
    boolean;

  readonly publicPortExposure:
    boolean;

  readonly secretInjection:
    boolean;

  readonly networkIsolation:
    boolean;
}

export interface ProjectRuntimeProcessRecord {
  readonly processId:
    string;

  readonly pid:
    number;

  readonly command:
    string;

  readonly args:
    readonly string[];

  readonly cwd:
    string;

  readonly status:
    RuntimeProcessStatus;

  readonly restartPolicy:
    RuntimeRestartPolicy;

  readonly networkPolicy:
    SandboxNetworkPolicy;

  readonly environmentKeys:
    readonly string[];

  readonly secretScopes:
    readonly ProjectSecretScope[];

  readonly port:
    number | null;

  readonly logPath:
    string;

  readonly startedAt:
    string;

  readonly stoppedAt:
    string | null;
}

export interface ProjectRuntimePort {
  readonly port:
    number;

  readonly protocol:
    'http'
    | 'tcp';

  readonly processId:
    string;

  readonly status:
    'declared'
    | 'listening'
    | 'stopped';
}

export interface ProjectRuntimeSession {
  readonly schemaVersion:
    typeof PROJECT_RUNTIME_SCHEMA_VERSION;

  readonly sessionId:
    string;

  readonly userId:
    string;

  readonly projectId:
    string;

  readonly providerId:
    string;

  readonly runtimeClass:
    ProjectRuntimeClass;

  readonly status:
    ProjectRuntimeStatus;

  readonly image:
    string | null;

  readonly workspaceRevision:
    number;

  readonly knownFiles:
    readonly string[];

  readonly processes:
    readonly ProjectRuntimeProcessRecord[];

  readonly ports:
    readonly ProjectRuntimePort[];

  /**
   * Provider-owned identifiers only.
   *
   * Never place secrets here.
   */
  readonly providerState:
    Readonly<
      Record<
        string,
        unknown
      >
    >;

  readonly createdAt:
    string;

  readonly updatedAt:
    string;

  readonly expiresAt:
    string | null;
}

export interface ProjectRuntimeBinding {
  readonly sessionId:
    string;

  readonly providerId:
    string;

  readonly runtimeClass:
    ProjectRuntimeClass;

  readonly status:
    ProjectRuntimeStatus;

  readonly workspaceRevision:
    number;

  readonly updatedAt:
    string;
}

export interface ProjectRuntimeCreateInput {
  readonly projectId:
    string;

  readonly runtimeClass:
    ProjectRuntimeClass;

  readonly files:
    readonly ProjectFile[];

  readonly image?:
    string | null;

  readonly environment?:
    Readonly<
      Record<
        string,
        string
      >
    >;

  /**
   * Secrets are resolved internally from the project vault.
   *
   * Callers request scopes rather than passing secret values.
   */
  readonly secretScopes?:
    readonly ProjectSecretScope[];

  readonly limits?:
    Partial<
      SandboxLimits
    >;

  readonly ttlSeconds?:
    number;
}

export interface ProviderRuntimeCreateInput {
  readonly userId:
    string;

  readonly projectId:
    string;

  readonly runtimeClass:
    ProjectRuntimeClass;

  readonly files:
    readonly ProjectFile[];

  readonly image:
    string | null;

  readonly environment:
    Readonly<
      Record<
        string,
        string
      >
    >;

  readonly secretEnvironment:
    Readonly<
      Record<
        string,
        string
      >
    >;

  readonly limits?:
    Partial<
      SandboxLimits
    >;

  readonly ttlSeconds:
    number;
}

export interface ProjectRuntimeCommand {
  readonly command:
    string;

  readonly args?:
    readonly string[];

  readonly cwd?:
    string;

  readonly environment?:
    Readonly<
      Record<
        string,
        string
      >
    >;

  readonly secretScopes?:
    readonly ProjectSecretScope[];

  readonly timeoutMs?:
    number;

  readonly networkPolicy?:
    SandboxNetworkPolicy;
}

export interface ProviderRuntimeCommand
  extends Omit<
    ProjectRuntimeCommand,
    'secretScopes'
  > {
  readonly environment:
    Readonly<
      Record<
        string,
        string
      >
    >;

  readonly secretEnvironment:
    Readonly<
      Record<
        string,
        string
      >
    >;
}

export interface ProjectRuntimeCommandResult {
  readonly exitCode:
    number | null;

  readonly stdout:
    string;

  readonly stderr:
    string;

  readonly timedOut:
    boolean;

  readonly durationMs:
    number;
}

export interface RuntimeProcessStartInput {
  readonly command:
    string;

  readonly args?:
    readonly string[];

  readonly cwd?:
    string;

  readonly environment?:
    Readonly<
      Record<
        string,
        string
      >
    >;

  readonly secretScopes?:
    readonly ProjectSecretScope[];

  readonly networkPolicy?:
    SandboxNetworkPolicy;

  readonly port?:
    number | null;

  readonly restartPolicy?:
    RuntimeRestartPolicy;
}

export interface ProviderRuntimeProcessStartInput
  extends Omit<
    RuntimeProcessStartInput,
    'secretScopes'
  > {
  readonly environment:
    Readonly<
      Record<
        string,
        string
      >
    >;

  readonly secretEnvironment:
    Readonly<
      Record<
        string,
        string
      >
    >;

  readonly secretScopes:
    readonly ProjectSecretScope[];
}

export interface RuntimeProcessStartResult {
  readonly pid:
    number;

  readonly logPath:
    string;
}

export interface RuntimePortExposure {
  readonly port:
    number;

  readonly url:
    string;

  readonly expiresAt:
    string | null;
}

export interface RuntimeSnapshot {
  readonly files:
    readonly ProjectFile[];

  readonly createdAt:
    string;
}

export interface ProjectRuntimeProviderProbe {
  readonly available:
    boolean;

  readonly providerId:
    string;

  readonly detail:
    string;
}

export interface ProjectRuntimeProvider {
  readonly id:
    string;

  readonly capabilities:
    ProjectRuntimeCapabilities;

  probe():
    Promise<
      ProjectRuntimeProviderProbe
    >;

  create(
    input:
      ProviderRuntimeCreateInput,
  ):
    Promise<
      ProjectRuntimeSession
    >;

  restore(
    session:
      ProjectRuntimeSession,
  ):
    Promise<
      ProjectRuntimeSession
    >;

  destroy(
    session:
      ProjectRuntimeSession,
  ):
    Promise<void>;

  writeFiles(
    session:
      ProjectRuntimeSession,

    files:
      readonly ProjectFile[],
  ):
    Promise<void>;

  readFile(
    session:
      ProjectRuntimeSession,

    path:
      string,
  ):
    Promise<
      string | null
    >;

  exec(
    session:
      ProjectRuntimeSession,

    command:
      ProviderRuntimeCommand,
  ):
    Promise<
      ProjectRuntimeCommandResult
    >;

  startProcess(
    session:
      ProjectRuntimeSession,

    input:
      ProviderRuntimeProcessStartInput,
  ):
    Promise<
      RuntimeProcessStartResult
    >;

  stopProcess(
    session:
      ProjectRuntimeSession,

    process:
      ProjectRuntimeProcessRecord,
  ):
    Promise<void>;

  processLogs(
    session:
      ProjectRuntimeSession,

    process:
      ProjectRuntimeProcessRecord,
  ):
    Promise<string>;

  snapshot(
    session:
      ProjectRuntimeSession,
  ):
    Promise<
      RuntimeSnapshot
    >;

  exposePort(
    session:
      ProjectRuntimeSession,

    port:
      number,
  ):
    Promise<
      RuntimePortExposure | null
    >;
}
