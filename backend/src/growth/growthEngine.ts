import { createHash } from 'node:crypto';

export const GROWTH_EVENT_NAMES = new Set([
  'identity.linked.v1', 'onboarding.started.v1', 'onboarding.continued.v1',
  'product.defined.v1', 'product.generated.v1', 'product.deployment_verified.v1',
  'activation.completed.v1', 'recommendation.created.v1', 'recommendation.executed.v1',
  'message.queued.v1', 'message.delivered.v1', 'message.opened.v1', 'message.clicked.v1',
  'campaign.approved.v1', 'campaign.completed.v1', 'referral.attributed.v1',
  'referral.qualified.v1', 'experiment.assigned.v1', 'experiment.exposed.v1',
  'experiment.outcome.v1', 'operations.incident_opened.v1', 'operations.repair_verified.v1',
]);

const SECRET_KEY = /password|token|secret|api[_-]?key|authorization|cookie|private[_-]?key|service[_-]?role|database[_-]?url/i;
const SECRET_VALUE = /(?:bearer\s+|sk-|sb_secret_|gh[op]_|xox[baprs]-|postgres(?:ql)?:\/\/)[^\s"']+/gi;

export function validateEventName(name: string): boolean {
  return /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+\.v[1-9][0-9]*$/.test(name) && GROWTH_EVENT_NAMES.has(name);
}

export function redactGrowthPayload(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(SECRET_VALUE, '[REDACTED]');
  if (Array.isArray(value)) return value.map(redactGrowthPayload);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SECRET_KEY.test(key) ? '[REDACTED]' : redactGrowthPayload(item)]));
  }
  return value;
}

export function activationSatisfied(required: string[], observed: string[], deploymentVerified: boolean): boolean {
  if (!deploymentVerified || required.length === 0) return false;
  const events = new Set(observed);
  return required.every((name) => events.has(name));
}

export function deterministicVariant(input: { experimentId: string; subjectKey: string; seed: string; variants: Array<{ key: string; weight: number }> }): string {
  const eligible = input.variants.filter((item) => item.weight > 0);
  const total = eligible.reduce((sum, item) => sum + item.weight, 0);
  if (!eligible.length || total <= 0) throw new Error('experiment requires weighted variants');
  const digest = createHash('sha256').update(`${input.experimentId}:${input.seed}:${input.subjectKey}`).digest();
  const point = digest.readUInt32BE(0) / 0xffffffff * total;
  let cursor = 0;
  for (const variant of eligible) { cursor += variant.weight; if (point <= cursor) return variant.key; }
  return eligible.at(-1)!.key;
}

export function experimentResult(input: { assignmentCount: number; minimumSampleSize: number; outcomeCounts: Record<string, number> }): { status: 'insufficient_data' | 'measured'; winner: string | null } {
  if (input.assignmentCount < input.minimumSampleSize) return { status: 'insufficient_data', winner: null };
  const ranked = Object.entries(input.outcomeCounts).sort((a, b) => b[1] - a[1]);
  if (ranked.length < 2 || ranked[0][1] === ranked[1][1]) return { status: 'insufficient_data', winner: null };
  return { status: 'measured', winner: ranked[0][0] };
}

export function recommendationDecision(input: { criticalIncident: boolean; deploymentVerified: boolean; activated: boolean; consent: boolean; suppressed: boolean }): { type: string; status: 'proposed' | 'blocked' | 'suppressed'; priority: number; blocker: string | null } {
  if (input.criticalIncident) return { type: 'prepare_operational_repair', status: 'blocked', priority: 100, blocker: 'critical_incident' };
  if (!input.deploymentVerified) return { type: 'verify_production_deployment', status: 'blocked', priority: 95, blocker: 'deployment_unverified' };
  if (!input.activated) return { type: 'continue_activation', status: 'proposed', priority: 80, blocker: null };
  if (!input.consent || input.suppressed) return { type: 'retention_message', status: 'suppressed', priority: 30, blocker: input.suppressed ? 'suppression' : 'consent_denied' };
  return { type: 'retention_message', status: 'proposed', priority: 40, blocker: null };
}

export type MessageDeliveryState = 'submitted' | 'provider_accepted' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'failed' | 'unknown';

export function normalizedMessageState(providerState: string): MessageDeliveryState {
  const map: Record<string, MessageDeliveryState> = {
    submitted: 'submitted', accepted: 'provider_accepted', queued: 'provider_accepted', delivered: 'delivered', opened: 'opened', clicked: 'clicked', bounce: 'bounced', bounced: 'bounced', complaint: 'complained', complained: 'complained', failed: 'failed', rejected: 'failed',
  };
  return map[providerState.toLowerCase()] ?? 'unknown';
}
