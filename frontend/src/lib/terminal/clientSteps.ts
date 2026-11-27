/**
 * The one line the Workspace can vouch for on every prompt, whatever the backend streams: it is thinking
 * while the request is out, and afterwards how long that really took and which pages came back. No text
 * about the request is composed here. Real work the backend reports appears beneath it.
 */

export const CLIENT_THOUGHT = 'client-thought';
/** The first part of a prompt's life: it is being read and classified. */
export const CLIENT_READ = 'client-read';

export const isClientStep = (id: string): boolean => id.endsWith(CLIENT_THOUGHT) || id.endsWith(CLIENT_READ);

export type ClientStepStatus = 'running' | 'completed' | 'failed';

export function thoughtFrame(
  status: ClientStepStatus, text: string,
  extra: { sources?: Array<{ title: string; url: string }> } = {},
  id: string = CLIENT_THOUGHT,
): Record<string, unknown> {
  return { agent: 'session', status: 'step', activityId: id, activityStatus: status, message: text, swarmActivity: text, ...extra };
}

export const READING = 'Reading your message';

/**
 * What is being prepared, in the words the planner returned for this particular request, kept as written.
 * Different requests therefore read differently; without a description a plain line is used.
 */
export function workingText(plan: { goalContract?: { desiredOutcome?: string; deliverables?: ReadonlyArray<{ description?: string }> } }): string {
  const raw = plan.goalContract?.deliverables?.[0]?.description || plan.goalContract?.desiredOutcome || '';
  const subject = raw.split(/\s+/).filter(Boolean).join(' ').replace(/[.!?;:,]+$/, '');
  if (!subject) return 'Writing your answer';
  const short = subject.length > 90 ? subject.slice(0, 89).split(' ').slice(0, -1).join(' ') + '…' : subject;
  return 'Preparing: ' + short;
}

function seconds(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${total % 60}s`;
}

/** What a reply stopped by the reader says: how long it had been working. */
export function thoughtStopped(elapsedMs: number): string {
  return `Stopped after ${seconds(elapsedMs)}`;
}

export const STOPPED_REPLY = 'You stopped this reply.';

/** Measured time, plus the number of pages the answer really came with. */
export function thoughtDone(elapsedMs: number, sources?: ReadonlyArray<{ title?: string; url?: string }>) {
  const pages = (sources ?? []).filter(source => typeof source.url === 'string' && /^https?:\/\//i.test(source.url));
  const listed = pages
    .slice(0, 8)
    .map(source => ({ title: (source.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) || source.url!, url: source.url! }));
  const count = pages.length;
  const time = `Thought for ${seconds(elapsedMs)}`;
  return {
    text: count ? `${time} · ${count} ${count === 1 ? 'source' : 'sources'}` : time,
    sources: count ? listed : undefined,
  };
}
