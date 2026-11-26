/**
 * Steps the Workspace itself can vouch for, shown for every prompt whatever the backend streams:
 * it sent the request to be understood, it asked for the answer, and what came back. Each one starts
 * when the call starts and ends only when that call ends.
 */

export const CLIENT_UNDERSTAND = 'client-understand';
export const CLIENT_ANSWER = 'client-answer';

export type ClientStepStatus = 'running' | 'completed' | 'failed';

export function clientStepFrame(
  id: string, status: ClientStepStatus, text: string,
  extra: { detail?: string; sources?: Array<{ title: string; url: string }> } = {},
): Record<string, unknown> {
  return { agent: 'session', status: 'step', activityId: id, activityStatus: status, message: text, swarmActivity: text, ...extra };
}

interface PlanLike {
  dispatch?: string;
  goalContract?: {
    desiredOutcome?: string;
    acceptance?: readonly string[];
    constraints?: readonly string[];
    requiredCapabilities?: readonly string[];
    freshnessRequirement?: string;
    deliverables?: ReadonlyArray<{ description?: string }>;
  };
}

const line = (value: unknown): string => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 220) : '');

/** What the planner returned about the request, in plain lines. Its private rationale is never shown. */
export function understandingDetail(plan: PlanLike): string {
  const goal = plan.goalContract ?? {};
  const list = (title: string, values: readonly unknown[] | undefined) => {
    const items = (values ?? []).map(line).filter(Boolean).slice(0, 5);
    return items.length ? `${title}\n${items.map(item => `• ${item}`).join('\n')}` : '';
  };
  const needs = (goal.requiredCapabilities ?? [])
    .filter(id => id !== 'conversation.respond')
    .map(id => id.replace(/[._-]+/g, ' '));
  return [
    line(goal.desiredOutcome) ? `Goal: ${line(goal.desiredOutcome)}` : '',
    list('What you should get', goal.deliverables?.map(item => item.description)),
    list('Will be checked', goal.acceptance),
    list('Limits', goal.constraints),
    list('Needs', needs),
    goal.freshnessRequirement === 'CURRENT_REQUIRED' ? 'Needs current information.' : '',
  ].filter(Boolean).join('\n\n');
}

export function answeredStep(sources: ReadonlyArray<{ title?: string; url?: string }> | undefined) {
  const listed = (sources ?? [])
    .filter(source => typeof source.url === 'string' && /^https?:\/\//i.test(source.url))
    .slice(0, 8)
    .map(source => ({ title: line(source.title) || source.url!, url: source.url! }));
  const count = listed.length;
  return {
    text: count ? `Wrote the answer using ${count} ${count === 1 ? 'source' : 'sources'}` : 'Wrote the answer',
    sources: count ? listed : undefined,
  };
}
