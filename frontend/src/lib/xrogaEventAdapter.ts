import type { SoftwareRunEvent } from './swarm';
import type { XrogaCanonicalEvent, XrogaEventStatus, XrogaEventType } from './xrogaEvent';

export interface XrogaEventAdapterInput {
  rawEvent: string;
  payload: Record<string, unknown>;
  sequence: number;
  timestamp: number;
  title: string;
  summary?: string | null;
  softwareEvent?: SoftwareRunEvent | null;
  offset?: number;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function genericType(rawEvent: string, payload: Record<string, unknown>): XrogaEventType {
  if (payload.needsGitHub === true || payload.needsVercel === true || payload.needsRepoPick === true) {
    return 'connection.required';
  }
  switch (rawEvent) {
    case 'start': return 'run.started';
    case 'pipeline': return 'plan.created';
    case 'delta': return 'message.delta';
    case 'preview': return payload.success === false ? 'artifact.failed' : 'artifact.completed';
    case 'complete': return payload.success === false ? 'run.failed' : 'run.completed';
    case 'error': return 'run.failed';
    case 'billing_webhook_failed': return 'activity.failed';
    case 'slow_request': return 'activity.waiting';
    default: return 'activity.updated';
  }
}

function genericStatus(
  type: XrogaEventType,
  payload: Record<string, unknown>,
): XrogaEventStatus {
  const presentationStatus = text(payload.presentationStatus);
  if (
    presentationStatus === 'pending' ||
    presentationStatus === 'running' ||
    presentationStatus === 'waiting' ||
    presentationStatus === 'completed' ||
    presentationStatus === 'failed' ||
    presentationStatus === 'cancelled' ||
    presentationStatus === 'interrupted'
  ) {
    return presentationStatus;
  }

  if (type.endsWith('.failed')) return 'failed';
  if (type.endsWith('.completed') || type === 'artifact.completed') return 'completed';
  if (type.endsWith('.cancelled')) return 'cancelled';
  if (type.endsWith('.interrupted')) return 'interrupted';
  if (type.endsWith('.waiting')) return 'waiting';
  return 'running';
}

function softwareType(event: SoftwareRunEvent): XrogaEventType {
  const type = event.type;
  if (type === 'run.started') return 'subagent.started';
  if (type === 'run.completed') return 'subagent.completed';
  if (type === 'run.failed') return 'subagent.failed';
  if (type === 'run.cancelled') return 'run.cancelled';
  if (type === 'plan.updated' || type === 'file_plan.created') return 'plan.updated';
  if (type.startsWith('file.')) return type as XrogaEventType;
  if (type === 'command.started') return 'tool.started';
  if (type === 'command.output') return 'tool.updated';
  if (type === 'command.completed') return event.status === 'failed' ? 'tool.failed' : 'tool.completed';
  if (type === 'check.started' || type === 'verification.started' || type === 'browser.verification.started') return 'verification.started';
  if (type === 'check.completed' || type === 'verification.completed' || type === 'browser.verification.completed') {
    return event.status === 'failed' ? 'verification.failed' : 'verification.completed';
  }
  if (type === 'preview.starting') return 'artifact.created';
  if (type === 'preview.ready') return 'artifact.completed';
  if (type === 'preview.updated') return 'artifact.updated';
  if (type === 'preview.failed') return 'artifact.failed';
  if (type === 'deployment.ready' || type === 'publication.completed' || type === 'delivery.ready') return 'receipt.created';
  if (type === 'deployment.failed') return 'activity.failed';
  if (type.endsWith('.completed')) return event.status === 'failed' ? 'activity.failed' : 'activity.completed';
  if (type.endsWith('.started') || type === 'repair.started') return 'activity.started';
  return event.status === 'failed' ? 'activity.failed' : 'activity.updated';
}

function softwareStatus(event: SoftwareRunEvent, type: XrogaEventType): XrogaEventStatus {
  if (event.status === 'failed') return 'failed';
  if (event.status === 'cancelled') return 'cancelled';
  if (type.endsWith('.completed') || type === 'receipt.created') return 'completed';
  return event.status === 'pending' ? 'pending' : 'running';
}

/** Normalize current SSE and Agent V2 evidence without changing either producer. */
export function adaptToXrogaEvent(input: XrogaEventAdapterInput): XrogaCanonicalEvent {
  const software = input.softwareEvent ?? null;
  const type = software ? softwareType(software) : genericType(input.rawEvent, input.payload);
  const rawSequence = software?.sequence ?? number(input.payload.sequence) ?? input.sequence;
  const runId = software?.runId ?? text(input.payload.runId);
  const offset = input.offset ?? 0;
  const evidence = software?.evidence;
  const eventId = software?.id ?? text(input.payload.eventId) ??
    `${runId ?? 'client'}:${rawSequence}:${input.rawEvent}:${offset}`;

  return {
    schemaVersion: 1,
    eventId,
    runId,
    conversationId: text(input.payload.conversationId),
    projectId: evidence?.projectId ?? text(input.payload.projectId),
    messageId: text(input.payload.messageId),
    artifactId: evidence?.previewId ?? text(input.payload.artifactId),
    activityId: text(input.payload.activityId),
    toolCallId: evidence?.commandId ?? text(input.payload.toolCallId),
    subagentRunId: software?.runId,
    sequence: rawSequence,
    timestamp: software?.createdAt ?? new Date(input.timestamp).toISOString(),
    type,
    status: software ? softwareStatus(software, type) : genericStatus(type, input.payload),
    title: input.title,
    summary: input.summary ?? undefined,
    source: software ? 'software-agent-v2' : 'swarm-sse',
    evidenceRefs: [evidence?.checkId, evidence?.diffId, evidence?.commitSha, evidence?.deploymentId]
      .filter((value): value is string => Boolean(value)),
    artifactRefs: evidence?.previewId ? [evidence.previewId] : undefined,
    metadata: {
      rawEvent: input.rawEvent,
      ...(text(input.payload.presentationKind)
        ? { presentationKind: text(input.payload.presentationKind)! }
        : {}),
      ...(text(input.payload.presentationStatus)
        ? { presentationStatus: text(input.payload.presentationStatus)! }
        : {}),
      ...(evidence?.filePath ? { filePath: evidence.filePath } : {}),
      ...(evidence?.exitCode != null ? { exitCode: evidence.exitCode } : {}),
      ...(evidence?.durationMs != null ? { durationMs: evidence.durationMs } : {}),
      ...(evidence?.runtimeSessionId ? { runtimeSessionId: evidence.runtimeSessionId } : {}),
    },
  };
}

/** Optional AG-UI and future runtimes adapt through this boundary, never into components. */
export interface XrogaCanonicalEventAdapter<T> {
  readonly source: string;
  adapt(input: T): XrogaCanonicalEvent[];
}
