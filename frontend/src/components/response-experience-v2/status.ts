export type StatusToneV2 = 'success' | 'danger' | 'warning' | 'info' | 'neutral';

const vocabulary: Record<Exclude<StatusToneV2, 'neutral'>, string[]> = {
  danger: ['error', 'errors', 'failed', 'failure', 'blocked', 'denied', 'rejected', 'critical', 'invalid', 'unavailable', 'offline', 'down', 'expired', 'declined', 'refused', 'unsafe'],
  warning: ['processing', 'pending', 'running', 'in progress', 'queued', 'waiting', 'warning', 'needs review', 'review required', 'partial', 'estimated', 'estimate', 'hypothetical', 'draft', 'retrying', 'paused', 'scheduled', 'degraded', 'deprecated', 'stale'],
  success: ['complete', 'completed', 'done', 'success', 'successful', 'succeeded', 'passed', 'pass', 'ok', 'healthy', 'active', 'live', 'verified', 'ready', 'resolved', 'enabled', 'approved', 'connected', 'available', 'online', 'paid', 'delivered', 'accepted'],
  info: ['info', 'note', 'new', 'beta', 'proposed', 'planned', 'optional', 'illustrative', 'example'],
};
const lookup = new Map<string, StatusToneV2>();
// Danger is registered last so a word that appears in two lists keeps the more cautious meaning.
for (const tone of ['info', 'success', 'warning', 'danger'] as const) for (const word of vocabulary[tone]) lookup.set(word, tone);

const normalize = (value: string) => value.toLowerCase().replace(/[_-]+/g, ' ').replace(/[.!:;,]+$/u, '').replace(/\s+/g, ' ').trim();

/** Tone of a short status word. Only an exact, whole-string status counts, so a sentence that merely contains
 * "failed" or "active" is never turned into a badge and keeps its authored words. */
export function statusToneV2(value: unknown): StatusToneV2 {
  if (typeof value !== 'string' || value.length > 28 || /[\r\n\[\]`<>|]/u.test(value)) return 'neutral';
  return lookup.get(normalize(value)) ?? 'neutral';
}
