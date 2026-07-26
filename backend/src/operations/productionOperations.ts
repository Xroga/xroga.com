import { createHash, randomUUID } from 'node:crypto';

export type OperationalStatus = 'verified' | 'degraded' | 'blocked' | 'unknown';
export type DeploymentState =
  | 'created' | 'building' | 'ready' | 'promoted' | 'rolled_back'
  | 'failed' | 'cancelled';

export interface Evidence {
  id: string;
  kind: string;
  source: string;
  observedAt: string;
  status: OperationalStatus;
  summary: string;
  reference?: string;
}

export interface ReleaseManifest {
  id: string;
  commitSha: string;
  artifactDigest: string;
  environment: 'preview' | 'staging' | 'production';
  buildCommand: string;
  buildExitCode: number;
  createdAt: string;
}

export interface GateInput {
  release: ReleaseManifest;
  requiredChecks: Array<{ id: string; passed: boolean; evidenceId?: string }>;
  approvals: Array<{ actorId: string; role: string; approvedAt: string }>;
  requiredApprovalRoles?: string[];
}

export interface ReadinessCheck {
  id: string;
  required: boolean;
  status: OperationalStatus;
  evidenceId?: string;
  blocker?: string;
}

export interface ReadinessResult {
  status: OperationalStatus;
  checks: ReadinessCheck[];
  blockers: string[];
  evaluatedAt: string;
}

const SECRET_PATTERN = /(authorization|cookie|token|secret|password|api[-_]?key)\s*[:=]\s*([^\s,;]+)/gi;

export function redactOperationalText(value: string): string {
  return value.replace(SECRET_PATTERN, '$1=[REDACTED]');
}

export function immutableRelease(input: Omit<ReleaseManifest, 'id' | 'artifactDigest' | 'createdAt'> & {
  artifact: string | Buffer;
  createdAt?: string;
}): Readonly<ReleaseManifest> {
  if (!/^[a-f0-9]{7,64}$/i.test(input.commitSha)) throw new Error('Invalid commit SHA');
  if (input.buildExitCode !== 0) throw new Error('A failed build cannot become a release');
  const artifactDigest = createHash('sha256').update(input.artifact).digest('hex');
  return Object.freeze({
    id: `rel_${artifactDigest.slice(0, 16)}`,
    commitSha: input.commitSha,
    artifactDigest,
    environment: input.environment,
    buildCommand: input.buildCommand,
    buildExitCode: input.buildExitCode,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function evaluatePromotion(input: GateInput): { allowed: boolean; blockers: string[] } {
  const blockers = input.requiredChecks
    .filter((check) => !check.passed || !check.evidenceId)
    .map((check) => `${check.id}: missing passing evidence`);
  if (input.release.buildExitCode !== 0) blockers.push('production build failed');
  for (const role of input.requiredApprovalRoles ?? ['release_manager']) {
    if (!input.approvals.some((approval) => approval.role === role)) {
      blockers.push(`missing ${role} approval`);
    }
  }
  return { allowed: blockers.length === 0, blockers };
}

const TRANSITIONS: Record<DeploymentState, DeploymentState[]> = {
  created: ['building', 'cancelled'],
  building: ['ready', 'failed', 'cancelled'],
  ready: ['promoted', 'failed', 'cancelled'],
  promoted: ['rolled_back'],
  rolled_back: [], failed: [], cancelled: [],
};

export function transitionDeployment(current: DeploymentState, next: DeploymentState): DeploymentState {
  if (!TRANSITIONS[current].includes(next)) throw new Error(`Invalid deployment transition: ${current} -> ${next}`);
  return next;
}

export function evaluateReadiness(checks: ReadinessCheck[], now = new Date()): ReadinessResult {
  const blockers = checks
    .filter((check) => check.required && check.status !== 'verified')
    .map((check) => check.blocker ?? `${check.id} is ${check.status}`);
  const hasDegraded = checks.some((check) => check.status === 'degraded');
  const hasUnknown = checks.some((check) => check.status === 'unknown');
  return {
    status: blockers.length ? 'blocked' : hasDegraded ? 'degraded' : hasUnknown ? 'unknown' : 'verified',
    checks,
    blockers,
    evaluatedAt: now.toISOString(),
  };
}

export interface AlertSignal {
  id: string;
  breached: boolean;
  consecutiveBreaches: number;
  threshold: number;
  evidenceId?: string;
}

export function shouldOpenIncident(signal: AlertSignal): boolean {
  return Boolean(signal.evidenceId && signal.breached && signal.consecutiveBreaches >= signal.threshold);
}

export interface WebhookDelivery {
  deliveryId: string;
  receivedAt: string;
  payloadDigest: string;
}

export class IdempotencyRegistry {
  private readonly seen = new Map<string, WebhookDelivery>();

  accept(deliveryId: string, rawBody: string, receivedAt = new Date().toISOString()): WebhookDelivery | null {
    if (!deliveryId.trim()) throw new Error('deliveryId is required');
    if (this.seen.has(deliveryId)) return null;
    const delivery = {
      deliveryId,
      receivedAt,
      payloadDigest: createHash('sha256').update(rawBody).digest('hex'),
    };
    this.seen.set(deliveryId, delivery);
    return delivery;
  }
}

export class EvidenceStore {
  private readonly records = new Map<string, Evidence>();

  add(input: Omit<Evidence, 'id' | 'observedAt'> & { id?: string; observedAt?: string }): Evidence {
    const evidence: Evidence = {
      ...input,
      id: input.id ?? `ev_${randomUUID()}`,
      observedAt: input.observedAt ?? new Date().toISOString(),
      summary: redactOperationalText(input.summary).slice(0, 500),
    };
    this.records.set(evidence.id, evidence);
    return evidence;
  }

  list(): Evidence[] { return [...this.records.values()]; }
}

export function safeConfigurationStatus(keys: string[], env: NodeJS.ProcessEnv = process.env) {
  return keys.map((key) => ({ key, configured: Boolean(env[key]?.trim()) }));
}

export function createRollbackPlan(input: {
  currentReleaseId: string;
  previousVerifiedReleaseId?: string;
  schemaBackwardCompatible: boolean;
}) {
  const blockers: string[] = [];
  if (!input.previousVerifiedReleaseId) blockers.push('no previous verified release');
  if (!input.schemaBackwardCompatible) blockers.push('schema is not backward compatible');
  return {
    executable: blockers.length === 0,
    fromReleaseId: input.currentReleaseId,
    toReleaseId: input.previousVerifiedReleaseId ?? null,
    blockers,
  };
}

export interface InventoryNode { id: string; kind: string; environment: string; dependsOn: string[] }

export function validateInventory(nodes: InventoryNode[]) {
  const ids = new Set(nodes.map((node) => node.id));
  const duplicate = ids.size !== nodes.length;
  const dangling = nodes.flatMap((node) => node.dependsOn.filter((id) => !ids.has(id)).map((id) => `${node.id}->${id}`));
  return { valid: !duplicate && dangling.length === 0, duplicate, dangling };
}

export function compareSchema(expected: string[], actual: string[]) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  return {
    missing: expected.filter((item) => !actualSet.has(item)),
    unexpected: actual.filter((item) => !expectedSet.has(item)),
    matches: expected.every((item) => actualSet.has(item)) && actual.every((item) => expectedSet.has(item)),
  };
}

export function evaluateSloWindow(input: { good: number; total: number; target: number; minimumSamples: number }) {
  if (input.total < input.minimumSamples) return { status: 'insufficient_data' as const, ratio: null };
  const ratio = input.total === 0 ? 0 : input.good / input.total;
  return { status: ratio >= input.target ? 'met' as const : 'breached' as const, ratio };
}

export function authorizeOperation(role: string, action: 'read' | 'promote' | 'rollback' | 'restore') {
  const allowed: Record<string, string[]> = {
    viewer: ['read'], operator: ['read'], release_manager: ['read', 'promote', 'rollback'],
    recovery_manager: ['read', 'restore'],
  };
  return Boolean(allowed[role]?.includes(action));
}

export function finalProductionOutcome(input: { required: ReadinessCheck[]; deploymentId?: string; verifiedUrl?: string }) {
  const readiness = evaluateReadiness(input.required);
  const blockers = [...readiness.blockers];
  if (!input.deploymentId) blockers.push('missing real deployment ID');
  if (!input.verifiedUrl) blockers.push('missing verified production URL');
  return { status: blockers.length ? 'blocked' as const : 'verified' as const, blockers, readiness };
}
