/**
 * Versioned, source-neutral execution events consumed by Xroga UI surfaces.
 *
 * This is an adapter contract, not a replacement transport. Existing swarm SSE
 * and Software Agent V2 events are normalized into this shape before rendering.
 */
export const XROGA_EVENT_SCHEMA_VERSION = 1 as const;

export type XrogaEventType =
  | 'run.started'
  | 'run.updated'
  | 'run.completed'
  | 'run.failed'
  | 'run.cancelled'
  | 'run.interrupted'
  | 'plan.created'
  | 'plan.updated'
  | 'activity.started'
  | 'activity.updated'
  | 'activity.completed'
  | 'activity.failed'
  | 'activity.waiting'
  | 'message.started'
  | 'message.delta'
  | 'message.completed'
  | 'tool.started'
  | 'tool.updated'
  | 'tool.completed'
  | 'tool.failed'
  | 'state.snapshot'
  | 'state.delta'
  | 'evidence.added'
  | 'evidence.updated'
  | 'artifact.created'
  | 'artifact.updated'
  | 'artifact.completed'
  | 'artifact.failed'
  | 'file.created'
  | 'file.updated'
  | 'file.deleted'
  | 'file.renamed'
  | 'approval.requested'
  | 'approval.resolved'
  | 'approval.cancelled'
  | 'connection.required'
  | 'connection.resolved'
  | 'subagent.started'
  | 'subagent.updated'
  | 'subagent.completed'
  | 'subagent.failed'
  | 'verification.started'
  | 'verification.completed'
  | 'verification.failed'
  | 'receipt.created'
  | 'notification.created';

export type XrogaEventStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export interface XrogaCanonicalEvent {
  schemaVersion: typeof XROGA_EVENT_SCHEMA_VERSION;
  eventId: string;
  runId?: string;
  conversationId?: string;
  projectId?: string;
  messageId?: string;
  artifactId?: string;
  activityId?: string;
  toolCallId?: string;
  subagentRunId?: string;
  sequence: number;
  timestamp: string;
  type: XrogaEventType;
  status: XrogaEventStatus;
  title: string;
  summary?: string;
  details?: string;
  source: 'swarm-sse' | 'software-agent-v2' | 'client';
  parentId?: string;
  evidenceRefs?: string[];
  artifactRefs?: string[];
  metadata?: Record<string, string | number | boolean | null>;
}

const EVENT_TYPES: ReadonlySet<string> = new Set<XrogaEventType>([
  'run.started', 'run.updated', 'run.completed', 'run.failed', 'run.cancelled', 'run.interrupted',
  'plan.created', 'plan.updated',
  'activity.started', 'activity.updated', 'activity.completed', 'activity.failed', 'activity.waiting',
  'message.started', 'message.delta', 'message.completed',
  'tool.started', 'tool.updated', 'tool.completed', 'tool.failed',
  'state.snapshot', 'state.delta', 'evidence.added', 'evidence.updated',
  'artifact.created', 'artifact.updated', 'artifact.completed', 'artifact.failed',
  'file.created', 'file.updated', 'file.deleted', 'file.renamed',
  'approval.requested', 'approval.resolved', 'approval.cancelled',
  'connection.required', 'connection.resolved',
  'subagent.started', 'subagent.updated', 'subagent.completed', 'subagent.failed',
  'verification.started', 'verification.completed', 'verification.failed',
  'receipt.created', 'notification.created',
]);

const EVENT_STATUSES: ReadonlySet<string> = new Set<XrogaEventStatus>([
  'pending', 'running', 'waiting', 'completed', 'failed', 'cancelled', 'interrupted',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

/** Runtime validation keeps restored or future adapter data from crashing the UI. */
export function isXrogaCanonicalEvent(value: unknown): value is XrogaCanonicalEvent {
  if (!isRecord(value)) return false;
  return value.schemaVersion === XROGA_EVENT_SCHEMA_VERSION &&
    typeof value.eventId === 'string' && value.eventId.length > 0 &&
    typeof value.sequence === 'number' && Number.isFinite(value.sequence) && value.sequence >= 0 &&
    typeof value.timestamp === 'string' && !Number.isNaN(Date.parse(value.timestamp)) &&
    typeof value.type === 'string' && EVENT_TYPES.has(value.type) &&
    typeof value.status === 'string' && EVENT_STATUSES.has(value.status) &&
    typeof value.title === 'string' && value.title.trim().length > 0 &&
    (value.source === 'swarm-sse' || value.source === 'software-agent-v2' || value.source === 'client');
}

export function parseXrogaCanonicalEvent(value: unknown): XrogaCanonicalEvent | null {
  return isXrogaCanonicalEvent(value) ? value : null;
}
