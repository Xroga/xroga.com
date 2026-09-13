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

  | 'plan.updated'

  | 'project.inspect.started'
  | 'project.inspect.completed'

  | 'file.read'
  | 'file.created'
  | 'file.updated'
  | 'file.deleted'

  | 'command.started'
  | 'command.output'
  | 'command.completed'

  | 'check.started'
  | 'check.completed'

  | 'repair.started'
  | 'repair.completed'

  | 'preview.starting'
  | 'preview.ready'
  | 'preview.failed'

  | 'browser.verification.started'
  | 'browser.verification.completed'

  | 'git.branch.created'
  | 'git.commit.created'

  | 'deployment.started'
  | 'deployment.ready'
  | 'deployment.failed';

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
}

export interface SoftwareRunEvent {
  id: string;
  runId: string;

  /**
   * Monotonically increasing within one run.
   * Used for deterministic replay/reconnect.
   */
  sequence: number;

  createdAt: string;

  type: SoftwareRunEventType;

  status: SoftwareRunStatus;

  /**
   * Short public activity description.
   *
   * Never chain-of-thought.
   */
  title: string;

  /**
   * Optional compact public evidence.
   */
  summary?: string;

  evidence?: SoftwareRunEventEvidence;
}

export interface SoftwareRunEventSink {
  emit(event: SoftwareRunEvent): Promise<void> | void;
}

export class InMemorySoftwareRunEventSink
  implements SoftwareRunEventSink
{
  private readonly events: SoftwareRunEvent[] = [];

  emit(event: SoftwareRunEvent): void {
    this.events.push(event);
  }

  getEvents(): readonly SoftwareRunEvent[] {
    return this.events;
  }
}
