export const LIVE_PREVIEW_SCHEMA_VERSION =
  '1.0.0' as const;

export type LivePreviewKind =
  | 'browser'
  | 'api'
  | 'terminal'
  | 'logs'
  | 'extension'
  | 'mobile'
  | 'desktop'
  | 'mcp'
  | 'ai'
  | 'none';

export type LivePreviewStatus =
  | 'starting'
  | 'ready'
  | 'failed'
  | 'stopped'
  | 'not_applicable';

export interface LivePreviewGrant {
  readonly previewId:
    string;

  readonly userId:
    string;

  readonly projectId:
    string;

  readonly sessionId:
    string;

  readonly runId:
    string;

  readonly kind:
    Exclude<
      LivePreviewKind,
      'none'
    >;

  readonly port:
    number | null;

  readonly expiresAt:
    string;

  readonly revokedAt:
    string | null;

  readonly createdAt:
    string;
}

export interface LivePreviewDescriptor {
  readonly schemaVersion:
    typeof LIVE_PREVIEW_SCHEMA_VERSION;

  readonly projectId:
    string;

  readonly runId:
    string;

  readonly kind:
    LivePreviewKind;

  readonly status:
    LivePreviewStatus;

  readonly sessionId:
    string | null;

  readonly processId:
    string | null;

  readonly providerId:
    string | null;

  readonly port:
    number | null;

  readonly url:
    string | null;

  readonly expiresAt:
    string | null;

  readonly message:
    string;

  readonly updatedAt:
    string;
}

export interface LivePreviewProcessPlan {
  readonly command:
    string;

  readonly args:
    readonly string[];

  readonly cwd:
    string;

  readonly environment:
    Readonly<
      Record<
        string,
        string
      >
    >;

  readonly port:
    number;

  readonly hotReload:
    boolean;

  readonly probeCommand:
    string;

  readonly probeArgs:
    readonly string[];
}

export interface LivePreviewLaunchPlan {
  readonly kind:
    LivePreviewKind;

  readonly image:
    string | null;

  readonly installDependencies:
    boolean;

  readonly process:
    LivePreviewProcessPlan | null;

  readonly message:
    string;
}
