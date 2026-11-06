import type { TerminalEvent } from './terminalEvent';

/**
 * A read-only VIEW of approval state for one assistant turn. It is derived from canonical `approval.*` events
 * and never grants anything: the server verifies identity, ownership, scope, digest, expiry and one-time use
 * when the person confirms. Only a UUID confirmation id is trusted from an event; every label shown to the
 * person is fetched from the server's own safe confirmation record, never taken from event text.
 */
export type RequiredInteractionStatus = 'requested' | 'approved' | 'declined' | 'expired' | 'cancelled';

export interface RequiredInteraction {
  /** Server confirmation id (UUID). The only value used to talk to the server. */
  confirmationId: string;
  runId?: string;
  stepId?: string;
  status: RequiredInteractionStatus;
  /** Epoch ms of the event that last changed this interaction. */
  updatedAt: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isConfirmationId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

function statusOf(event: TerminalEvent): RequiredInteractionStatus | null {
  const canonical = event.canonical;
  if (!canonical) return null;
  if (canonical.type === 'approval.requested') return 'requested';
  if (canonical.type === 'approval.cancelled') return 'cancelled';
  if (canonical.type === 'approval.resolved') {
    const outcome = canonical.metadata?.outcome;
    if (outcome === 'declined' || outcome === 'denied') return 'declined';
    if (outcome === 'expired') return 'expired';
    if (outcome === 'cancelled') return 'cancelled';
    return canonical.status === 'failed' ? 'declined' : 'approved';
  }
  return null;
}

/**
 * Reduce a run's events to one entry per confirmation id. Events replay safely: a later event for the same id
 * replaces an earlier one, a stale earlier event never reopens a resolved interaction, and duplicates collapse.
 */
export function requiredInteractionsFromEvents(events: readonly TerminalEvent[]): RequiredInteraction[] {
  const byId = new Map<string, RequiredInteraction>();
  for (const event of events) {
    const status = statusOf(event);
    const canonical = event.canonical;
    if (!status || !canonical) continue;
    const id = canonical.metadata?.confirmationId;
    if (!isConfirmationId(id)) continue;
    const key = id.toLowerCase();
    const previous = byId.get(key);
    const at = Number.isFinite(event.at) ? event.at : 0;
    if (previous && previous.status !== 'requested' && status === 'requested') continue; // replayed request must not reopen
    if (previous && previous.updatedAt > at && previous.status !== 'requested') continue;
    byId.set(key, { confirmationId: key, runId: canonical.runId, stepId: canonical.activityId, status, updatedAt: at });
  }
  return [...byId.values()];
}

/**
 * Open interactions for one assistant turn that are not already shown as an inline review inside the answer text
 * (a message whose markdown carries the confirmation link already renders that review). Prevents two cards.
 */
export function openInteractionsForTurn(events: readonly TerminalEvent[], messageContent: string): RequiredInteraction[] {
  const content = messageContent.toLowerCase();
  return openInteractions(requiredInteractionsFromEvents(events)).filter(item => !content.includes(item.confirmationId));
}

/** Interactions that still need the person's decision. */
export const openInteractions = (list: readonly RequiredInteraction[]): RequiredInteraction[] => list.filter(item => item.status === 'requested');
