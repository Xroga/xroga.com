/**
 * The one line the Workspace can vouch for on every prompt, whatever the backend streams: it is thinking
 * while the request is out, and afterwards how long that really took and which pages came back. No text
 * about the request is composed here. Real work the backend reports appears beneath it.
 */

export const CLIENT_THOUGHT = 'client-thought';

export type ClientStepStatus = 'running' | 'completed' | 'failed';

export function thoughtFrame(
  status: ClientStepStatus, text: string,
  extra: { sources?: Array<{ title: string; url: string }> } = {},
): Record<string, unknown> {
  return { agent: 'session', status: 'step', activityId: CLIENT_THOUGHT, activityStatus: status, message: text, swarmActivity: text, ...extra };
}

export const THINKING = 'Thinking';

function seconds(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  return total < 60 ? `${total}s` : `${Math.floor(total / 60)}m ${total % 60}s`;
}

/** Measured time, plus the number of pages the answer really came with. */
export function thoughtDone(elapsedMs: number, sources?: ReadonlyArray<{ title?: string; url?: string }>) {
  const listed = (sources ?? [])
    .filter(source => typeof source.url === 'string' && /^https?:\/\//i.test(source.url))
    .slice(0, 8)
    .map(source => ({ title: (source.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 160) || source.url!, url: source.url! }));
  const count = listed.length;
  const time = `Thought for ${seconds(elapsedMs)}`;
  return {
    text: count ? `${time} · ${count} ${count === 1 ? 'source' : 'sources'}` : time,
    sources: count ? listed : undefined,
  };
}
