export type OperationsPermission =
  | 'view_operations_portfolio' | 'view_product_operations' | 'view_environment_operations'
  | 'view_releases' | 'view_deployments' | 'view_health' | 'view_logs' | 'view_metrics'
  | 'view_traces' | 'view_errors' | 'view_incidents' | 'manage_incidents'
  | 'view_alerts' | 'manage_alerts' | 'view_jobs' | 'retry_jobs' | 'cancel_jobs'
  | 'manage_workers' | 'view_queues' | 'manage_queues' | 'view_webhooks' | 'retry_webhooks'
  | 'view_database_operations' | 'run_migration_dry_run' | 'apply_migration' | 'approve_migration'
  | 'view_backups' | 'run_restore_test' | 'view_domains' | 'manage_domains'
  | 'view_integrations' | 'verify_integrations' | 'remove_integrations'
  | 'view_provider_operations' | 'manage_provider_routing' | 'promote_release'
  | 'approve_release_promotion' | 'rollback_release' | 'approve_rollback'
  | 'start_repair' | 'approve_production_repair' | 'manage_automation'
  | 'approve_operations_action' | 'view_operational_evidence' | 'view_operational_audit';

export type OperationsRole = 'viewer' | 'operator' | 'release_manager' | 'recovery_manager' | 'admin';
export type RiskLevel = 'read_only' | 'low' | 'medium' | 'high' | 'critical';
export type ActionStatus =
  | 'requested' | 'precondition_check' | 'confirmation_required' | 'approval_required'
  | 'approved' | 'queued' | 'running' | 'verification_required' | 'verified'
  | 'failed' | 'cancelled' | 'expired' | 'blocked';
export type TruthStatus =
  | 'healthy' | 'degraded' | 'incident' | 'deployment_in_progress' | 'verification_required'
  | 'blocked' | 'externally_blocked' | 'unknown' | 'archived' | 'stale'
  | 'unavailable' | 'not_configured' | 'insufficient_data' | 'unsupported';

export interface Freshness {
  source: string;
  observedAt: string | null;
  verifiedAt: string | null;
  staleAfter: string | null;
  reconciliationState: 'matched' | 'inconsistent' | 'pending' | 'unknown';
  stale: boolean;
}

export interface OperationalResource {
  id: string;
  version: number;
  projectId: string;
  environmentId: string | null;
  kind: string;
  provider: string;
  name: string;
  status: string;
  statusReason: string | null;
  desiredState: Record<string, unknown>;
  observedState: Record<string, unknown>;
  evidenceReference: string | null;
  freshness: Freshness;
  availableActions: string[];
}

export interface PortfolioProduct {
  id: string;
  name: string;
  type: string;
  repository: string | null;
  primaryEnvironment: string | null;
  currentRelease: string | null;
  runningCommit: string | null;
  status: TruthStatus;
  statusReason: string;
  deploymentState: string;
  applicationHealth: string;
  databaseState: string;
  domainState: string;
  criticalWorkflowState: string;
  incidentCount: number;
  alertCount: number;
  pendingApprovals: number;
  backupState: string;
  lastVerification: string | null;
  stale: boolean;
  evidenceReferences: string[];
  requiredAction: string | null;
}

export interface ActionDefinition {
  type: string;
  permission: OperationsPermission;
  riskLevel: RiskLevel;
  confirmationRequired: boolean;
  approvalRole?: OperationsRole;
  supportedTargetTypes: string[];
  providerCapability: string;
  maxAttempts: number;
}

export interface ProviderResult {
  status: 'verified' | 'failed' | 'blocked' | 'unsupported' | 'external_setup_required' | 'provider_unavailable';
  safeSummary: string;
  providerReference?: string;
  observedState?: Record<string, unknown>;
  errorCategory?: string;
}

export interface ProviderAdapter {
  id: string;
  supportedCapabilities: readonly string[];
  authenticationRequirements: readonly string[];
  environmentSupport: readonly string[];
  readOperations: readonly string[];
  mutationOperations: readonly string[];
  verificationMethod: string;
  retryPolicy: { maxAttempts: number; retryableCategories: readonly string[] };
  rateLimitHandling: string;
  idempotencySupport: boolean;
  redactionPolicy: string;
  execute(capability: string, input: Record<string, unknown>): Promise<ProviderResult>;
}

export interface SafeActionRequest {
  actionType: string;
  projectId: string;
  environmentId?: string;
  targetType: string;
  targetId: string;
  targetVersion: number;
  idempotencyKey: string;
  confirmed: boolean;
  parameters?: Record<string, unknown>;
}

export interface OperationsErrorShape {
  code: 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict' | 'invalid_state'
    | 'precondition_failed' | 'approval_required' | 'external_setup_required'
    | 'provider_unavailable' | 'rate_limited' | 'verification_failed' | 'action_failed' | 'unknown';
  message: string;
  correlationId: string;
}
