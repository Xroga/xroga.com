import {
  engineeringArtifactToText,
  isRenderableArtifact,
} from './engineeringArtifact';

/**
 * Public Software Agent V2 execution-event contract.
 *
 * Keep this intentionally aligned with the backend public run-event contract.
 * These fields are execution evidence only — never model chain-of-thought.
 */
export type SoftwareRunStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failed'
  | 'cancelled';

export type SoftwareRunEventType =
  | 'run.started'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'goal.resolved'
  | 'product.classified'
  | 'recipe.selected'
  | 'architecture.selected'
  | 'file_plan.created'
  | 'plan.updated'
  | 'project.inspect.started'
  | 'project.inspect.completed'
  | 'workspace.created'
  | 'checkpoint.created'
  | 'file.read'
  | 'file.created'
  | 'file.updated'
  | 'file.deleted'
  | 'file.renamed'
  | 'dependency.install.started'
  | 'dependency.install.completed'
  | 'command.started'
  | 'command.output'
  | 'command.completed'
  | 'runtime.started'
  | 'runtime.stopped'
  | 'process.started'
  | 'process.stopped'
  | 'check.started'
  | 'check.completed'
  | 'verification.started'
  | 'verification.completed'
  | 'repair.started'
  | 'repair.completed'
  | 'preview.starting'
  | 'preview.ready'
  | 'preview.failed'
  | 'browser.verification.started'
  | 'browser.verification.completed'
  | 'git.branch.created'
  | 'git.commit.created'
  | 'publication.started'
  | 'publication.completed'
  | 'deployment.started'
  | 'deployment.ready'
  | 'deployment.failed'
  | 'delivery.ready';

export interface SoftwareRunEventEvidence {
  filePath?: string;
  fileRevision?: string;

  diffId?: string;

  commandId?: string;

  checkId?: string;

  previewId?: string;

  commitSha?: string;

  deploymentId?: string;

  exitCode?: number;

  durationMs?: number;
  
  projectId?: string;

  runtimeSessionId?: string;

  processId?: string;

  port?: number;

  previewKind?: string;

  previewUrl?: string;
}

export interface SoftwareRunEvent {
  id: string;

  runId: string;

  sequence: number;

  createdAt: string;

  type: SoftwareRunEventType;

  status: SoftwareRunStatus;

  title: string;

  summary?: string;

  evidence?: SoftwareRunEventEvidence;
}

/** Extract human-readable text from a Swarm output payload. */
export function swarmOutputToText(
  output: unknown,
): string {
  if (
    !output ||
    typeof output !== 'object'
  ) {
    return 'Task complete.';
  }

  const o =
    output as {
      type?: string;
      content?: string;
      message?: string;
      prompt?: string;
      provider?: string;
      deployUrl?: string;
      imageUrl?: string;
      streamingUrl?: string;
      pdfUrl?: string;
    };

  /*
   * Checked before `o.message`, because an engineering artifact carrying an
   * incidental message field must still produce the full result rather than
   * one line of it.
   */
  if (
    isRenderableArtifact(
      output,
    )
  ) {
    return engineeringArtifactToText(
      output,
    );
  }

  if (
    o.type === 'chat' &&
    typeof o.content ===
      'string'
  ) {
    return o.content;
  }

  if (
    typeof o.message ===
    'string'
  ) {
    return o.message;
  }

  if (
    o.type ===
    'landing_page'
  ) {
    return '';
  }

  if (
    o.type === 'image' &&
    o.imageUrl
  ) {
    const alt =
      (
        o.prompt ??
        'Generated image'
      ).slice(
        0,
        80,
      );

    return `![${alt}](${o.imageUrl})`;
  }

  if (
    o.type ===
      'video_studio' &&
    o.streamingUrl
  ) {
    const title =
      (
        o as {
          title?: string;
        }
      ).title ??
      'Your video';

    return (
      `**${title}** is ready!\n\n` +
      `[Watch & download](${o.streamingUrl})`
    );
  }

  if (
    o.type ===
      'deep_research' &&
    o.pdfUrl
  ) {
    return `Research report: ${o.pdfUrl}`;
  }

  return 'Swarm task complete.';
}

export interface SwarmProgressEvent {
  /**
   * Monotonic persisted event sequence, present on live and replayed build
   * events.
   */
  sequence?: number;

  agent?: string;

  status?: string;

  message?: string;

  iteration?: number;

  imageStep?: string;

  videoStep?: string;

  omniPhase?: string;

  omniDetail?: string;

  imageAttempt?: {
    imageUrl: string;
    provider: string;
    matchScore: number;
    issues?: string[];
    variantLabel?: string;
    variantIndex?: number;
  };

  councilLayer?:
    | 'elite'
    | 'reserve'
    | 'blackhole';

  negotiationPhase?: number;

  userFacingPhase?: number;

  swarmLogic?: boolean;

  swarmTodos?: SwarmTodoItem[];

  swarmStatusLabel?: string;

  swarmAnalysis?: string;

  swarmActivity?: string;

  needsGitHub?: boolean;

  needsVercel?: boolean;

  needsRepoPick?: boolean;

  deepseekPeak?: boolean;

  heavyBusy?: boolean;

  /**
   * Software implementation identity.
   */
  builderVersion?:
    | 'agent-v2'
    | string;

  /**
   * Explicit marker that this progress payload came from Software Agent V2.
   */
  softwareAgentV2?: boolean;

  /**
   * Native public Software Agent V2 event.
   */
  softwareEvent?: SoftwareRunEvent;

  /**
   * Silent stream keepalive — not real progress; do not reset stall timers.
   */
  keepalive?: boolean;

  hackathonBrief?:
    import('@/lib/hackathonBrief')
      .HackathonBriefCardData;
}

export type SwarmTodoStatus =
  | 'done'
  | 'active'
  | 'pending'
  | 'skipped';

export interface SwarmTodoItem {
  id: string;

  label: string;

  status: SwarmTodoStatus;
}

export interface SwarmCompleteEvent {
  runId?: string;

  success?: boolean;

  featureCategory?: string;

  output?: unknown;

  actionsRemaining?: number;

  tokenUsage?: {
    inputTokensUsed?: number;

    outputTokensUsed?: number;

    totalTokensUsed?: number;

    totalTokensRemaining?: number;

    percentUsed?: number;

    inputTokensRemaining?: number;

    outputTokensRemaining?: number;

    quotaPeriodStart?: string;

    totalLimit?: number;

    planBudgetUsd?: number;

    rolloverUsd?: number;

    spentUsd?: number;

    creditRemainingUsd?: number;

    percentCreditUsed?: number;

    planTier?: string;
  };
}
