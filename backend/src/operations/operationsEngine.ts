import { createHash } from 'node:crypto';
import type {
  ActionDefinition, ActionStatus, OperationalResource, PortfolioProduct,
  ProviderResult, RiskLevel, SafeActionRequest, TruthStatus,
} from './types.js';

export const ACTION_DEFINITIONS: Record<string, ActionDefinition> = {
  refresh_health: { type: 'refresh_health', permission: 'view_health', riskLevel: 'read_only', confirmationRequired: false, supportedTargetTypes: ['health_check','service'], providerCapability: 'refresh_health', maxAttempts: 2 },
  verify_domain: { type: 'verify_domain', permission: 'view_domains', riskLevel: 'read_only', confirmationRequired: false, supportedTargetTypes: ['domain'], providerCapability: 'verify_domain', maxAttempts: 2 },
  run_synthetic_check: { type: 'run_synthetic_check', permission: 'view_health', riskLevel: 'read_only', confirmationRequired: false, supportedTargetTypes: ['workflow_check'], providerCapability: 'run_synthetic_check', maxAttempts: 2 },
  acknowledge_incident: { type: 'acknowledge_incident', permission: 'manage_incidents', riskLevel: 'low', confirmationRequired: false, supportedTargetTypes: ['incident'], providerCapability: 'acknowledge_incident', maxAttempts: 2 },
  resolve_incident: { type: 'resolve_incident', permission: 'manage_incidents', riskLevel: 'medium', confirmationRequired: true, supportedTargetTypes: ['incident'], providerCapability: 'resolve_incident', maxAttempts: 2 },
  retry_job: { type: 'retry_job', permission: 'retry_jobs', riskLevel: 'low', confirmationRequired: true, supportedTargetTypes: ['job'], providerCapability: 'retry_job', maxAttempts: 3 },
  retry_webhook: { type: 'retry_webhook', permission: 'retry_webhooks', riskLevel: 'medium', confirmationRequired: true, supportedTargetTypes: ['webhook'], providerCapability: 'retry_webhook', maxAttempts: 3 },
  emergency_stop: { type: 'emergency_stop', permission: 'manage_automation', riskLevel: 'high', confirmationRequired: true, supportedTargetTypes: ['automation'], providerCapability: 'emergency_stop', maxAttempts: 1 },
  resume_automation: { type: 'resume_automation', permission: 'manage_automation', riskLevel: 'high', confirmationRequired: true, approvalRole: 'recovery_manager', supportedTargetTypes: ['automation'], providerCapability: 'resume_automation', maxAttempts: 1 },
  prepare_repair: { type: 'prepare_repair', permission: 'start_repair', riskLevel: 'medium', confirmationRequired: true, supportedTargetTypes: ['incident','service','deployment'], providerCapability: 'prepare_repair', maxAttempts: 1 },
  promote_release: { type: 'promote_release', permission: 'promote_release', riskLevel: 'high', confirmationRequired: true, approvalRole: 'release_manager', supportedTargetTypes: ['release'], providerCapability: 'promote_release', maxAttempts: 1 },
  rollback_release: { type: 'rollback_release', permission: 'rollback_release', riskLevel: 'critical', confirmationRequired: true, approvalRole: 'recovery_manager', supportedTargetTypes: ['release'], providerCapability: 'rollback_release', maxAttempts: 1 },
  apply_migration: { type: 'apply_migration', permission: 'apply_migration', riskLevel: 'high', confirmationRequired: true, approvalRole: 'release_manager', supportedTargetTypes: ['migration'], providerCapability: 'apply_migration', maxAttempts: 1 },
  restore_backup: { type: 'restore_backup', permission: 'run_restore_test', riskLevel: 'critical', confirmationRequired: true, approvalRole: 'recovery_manager', supportedTargetTypes: ['backup'], providerCapability: 'restore_backup', maxAttempts: 1 },
  purge_queue: { type: 'purge_queue', permission: 'manage_queues', riskLevel: 'critical', confirmationRequired: true, approvalRole: 'recovery_manager', supportedTargetTypes: ['queue'], providerCapability: 'purge_queue', maxAttempts: 1 },
  schedule_maintenance: { type: 'schedule_maintenance', permission: 'manage_automation', riskLevel: 'medium', confirmationRequired: true, supportedTargetTypes: ['environment'], providerCapability: 'schedule_maintenance', maxAttempts: 1 },
  cancel_maintenance: { type: 'cancel_maintenance', permission: 'manage_automation', riskLevel: 'medium', confirmationRequired: true, supportedTargetTypes: ['maintenance'], providerCapability: 'cancel_maintenance', maxAttempts: 1 },
  enable_automation: { type: 'enable_automation', permission: 'manage_automation', riskLevel: 'medium', confirmationRequired: true, supportedTargetTypes: ['automation'], providerCapability: 'enable_automation', maxAttempts: 1 },
  disable_automation: { type: 'disable_automation', permission: 'manage_automation', riskLevel: 'low', confirmationRequired: true, supportedTargetTypes: ['automation'], providerCapability: 'disable_automation', maxAttempts: 1 },
  execute_growth_campaign: { type: 'execute_growth_campaign', permission: 'manage_automation', riskLevel: 'high', confirmationRequired: true, approvalRole: 'recovery_manager', supportedTargetTypes: ['growth_campaign'], providerCapability: 'execute_growth_campaign', maxAttempts: 1 },
  // Spends real provider budget against real credentials, so it carries the same gate as a
  // release promotion: confirmation, then a second person's approval bound to the plan
  // digest. `maxAttempts: 1` because a retry is another paid run, not a free repeat.
  run_model_benchmark: { type: 'run_model_benchmark', permission: 'manage_provider_routing', riskLevel: 'high', confirmationRequired: true, approvalRole: 'release_manager', supportedTargetTypes: ['model_benchmark'], providerCapability: 'run_model_benchmark', maxAttempts: 1 },
};

const SENSITIVE = [
  /(?:postgres(?:ql)?|mysql|redis):\/\/[^\s"']+/gi,
  /(?:bearer\s+)[a-z0-9._~+/=-]+/gi,
  /(?:sk|sb_secret|gho|ghp|xox[baprs])[_-][a-z0-9_-]+/gi,
  /(?:password|token|secret|api[-_]?key|authorization|cookie)\s*[:=]\s*[^\s,;"']+/gi,
];

export function redactOperationsValue(value: unknown): unknown {
  if (typeof value === 'string') return SENSITIVE.reduce((text, pattern) => text.replace(pattern, '[REDACTED]'), value);
  if (Array.isArray(value)) return value.map(redactOperationsValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      /password|token|secret|key|authorization|cookie|connection|string|url/i.test(key) && typeof item === 'string'
        ? '[REDACTED]'
        : redactOperationsValue(item),
    ]));
  }
  return value;
}

export function actionPlanDigest(request: SafeActionRequest): string {
  const canonical = JSON.stringify({
    actionType: request.actionType,
    projectId: request.projectId,
    environmentId: request.environmentId ?? null,
    targetType: request.targetType,
    targetId: request.targetId,
    targetVersion: request.targetVersion,
    parameters: redactOperationsValue(request.parameters ?? {}),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function initialActionStatus(definition: ActionDefinition, confirmed: boolean): ActionStatus {
  if (definition.confirmationRequired && !confirmed) return 'confirmation_required';
  if (definition.approvalRole) return 'approval_required';
  return 'queued';
}

export function approvalIsValid(input: {
  requesterId: string; approverId: string; decision: string; expiresAt: string;
  approvedTargetVersion: number; currentTargetVersion: number;
  approvedPlanDigest: string; currentPlanDigest: string;
}): { valid: boolean; reason?: string } {
  if (input.requesterId === input.approverId) return { valid: false, reason: 'requester_cannot_self_approve' };
  if (input.decision !== 'approved') return { valid: false, reason: 'approval_not_granted' };
  if (new Date(input.expiresAt).getTime() <= Date.now()) return { valid: false, reason: 'approval_expired' };
  if (input.approvedTargetVersion !== input.currentTargetVersion || input.approvedPlanDigest !== input.currentPlanDigest) {
    return { valid: false, reason: 'approved_target_changed' };
  }
  return { valid: true };
}

export function maintenanceBlocksAction(input: {
  actionType: string; now: Date; windows: Array<{ startsAt: string; endsAt: string; allowedActions: string[]; blockedActions: string[] }>;
}): boolean {
  return input.windows.some((window) => {
    const active = new Date(window.startsAt) <= input.now && new Date(window.endsAt) > input.now;
    if (!active) return false;
    if (window.allowedActions.includes(input.actionType)) return false;
    return window.blockedActions.length === 0 || window.blockedActions.includes(input.actionType);
  });
}

function isStale(staleAfter: string | null, now: Date): boolean {
  return Boolean(staleAfter && new Date(staleAfter).getTime() <= now.getTime());
}

const BAD_STATUSES = new Set(['failed','blocked','unavailable','incident','degraded','inconsistent','serving_wrong_application','drift_detected']);
const GOOD_STATUSES = new Set(['healthy','verified','ready','production_verified','matched','succeeded','processed','connected']);

export function deriveProductStatus(resources: OperationalResource[], incidentCount: number, now = new Date()): { status: TruthStatus; reason: string; stale: boolean } {
  if (incidentCount > 0) return { status: 'incident', reason: `${incidentCount} active incident(s)`, stale: false };
  const stale = resources.some((resource) => resource.freshness.stale || isStale(resource.freshness.staleAfter, now));
  if (resources.some((resource) => resource.freshness.reconciliationState === 'inconsistent')) {
    return { status: 'blocked', reason: 'desired and observed operational state disagree', stale };
  }
  const bad = resources.find((resource) => BAD_STATUSES.has(resource.status));
  if (bad) return { status: bad.status === 'degraded' ? 'degraded' : 'blocked', reason: `${bad.name}: ${bad.statusReason ?? bad.status}`, stale };
  if (stale) return { status: 'verification_required', reason: 'operational verification is stale', stale: true };
  if (!resources.length) return { status: 'unknown', reason: 'no operational evidence has been recorded', stale: false };
  const required = resources.filter((resource) => !['capacity','log_source','metric_source','trace_source'].includes(resource.kind));
  if (!required.length || required.some((resource) => !GOOD_STATUSES.has(resource.status))) {
    return { status: 'unknown', reason: 'required operational state is incomplete', stale: false };
  }
  return { status: 'healthy', reason: 'all required fresh operational evidence is verified', stale: false };
}

function resourceStatus(resources: OperationalResource[], kind: string): string {
  const resource = resources.find((item) => item.kind === kind);
  if (!resource) return 'unknown';
  return resource.freshness.stale ? 'stale' : resource.status;
}

export function aggregatePortfolioProduct(input: {
  project: { id: string; name: string; type: string; github_repo_name?: string | null };
  resources: OperationalResource[];
  environment?: { environment_key: string; observed_release_id?: string | null; observed_commit_sha?: string | null };
  incidentCount: number; alertCount: number; pendingApprovals: number;
  deploymentState?: string | null;
}): PortfolioProduct {
  const derived = deriveProductStatus(input.resources, input.incidentCount);
  const evidence = [...new Set(input.resources.map((item) => item.evidenceReference).filter((item): item is string => Boolean(item)))];
  const lastVerification = input.resources.map((item) => item.freshness.verifiedAt).filter((item): item is string => Boolean(item)).sort().at(-1) ?? null;
  return {
    id: input.project.id, name: input.project.name, type: input.project.type,
    repository: input.project.github_repo_name ?? null,
    primaryEnvironment: input.environment?.environment_key ?? null,
    currentRelease: input.environment?.observed_release_id ?? null,
    runningCommit: input.environment?.observed_commit_sha ?? null,
    status: derived.status, statusReason: derived.reason,
    deploymentState: input.deploymentState ?? 'unknown',
    applicationHealth: resourceStatus(input.resources, 'health_check'),
    databaseState: resourceStatus(input.resources, 'migration'),
    domainState: resourceStatus(input.resources, 'domain'),
    criticalWorkflowState: resourceStatus(input.resources, 'workflow_check'),
    incidentCount: input.incidentCount, alertCount: input.alertCount,
    pendingApprovals: input.pendingApprovals,
    backupState: resourceStatus(input.resources, 'backup'),
    lastVerification, stale: derived.stale, evidenceReferences: evidence,
    requiredAction: derived.status === 'healthy' ? null : derived.reason,
  };
}

export function automationDecision(input: {
  enabled: boolean; emergencyStopped: boolean; riskLevel: RiskLevel; recentRuns: number; maxRuns: number;
  maintenanceBlocked: boolean; duplicate: boolean;
}): 'execute' | 'approval_required' | 'disabled' | 'stopped' | 'rate_limited' | 'maintenance_blocked' | 'duplicate' {
  if (input.emergencyStopped) return 'stopped';
  if (!input.enabled) return 'disabled';
  if (input.duplicate) return 'duplicate';
  if (input.maintenanceBlocked) return 'maintenance_blocked';
  if (input.recentRuns >= input.maxRuns) return 'rate_limited';
  return ['high','critical'].includes(input.riskLevel) ? 'approval_required' : 'execute';
}

export function providerResultToStatus(result: ProviderResult): ActionStatus {
  if (result.status === 'verified') return 'verified';
  if (['blocked','unsupported','external_setup_required'].includes(result.status)) return 'blocked';
  return 'failed';
}

export function configurationPosture(input: {
  present: boolean; environment: string; credentialClass?: 'test' | 'live' | 'unknown'; verifiedAt?: string | null; staleAfter?: string | null; now?: Date;
}): 'verified' | 'missing' | 'wrong_environment' | 'stale' | 'unknown' {
  if (!input.present) return 'missing';
  if (input.environment === 'production' && input.credentialClass === 'test') return 'wrong_environment';
  if (['test','preview','development'].includes(input.environment) && input.credentialClass === 'live') return 'wrong_environment';
  if (input.staleAfter && new Date(input.staleAfter).getTime() <= (input.now ?? new Date()).getTime()) return 'stale';
  if (!input.verifiedAt) return 'unknown';
  return 'verified';
}
