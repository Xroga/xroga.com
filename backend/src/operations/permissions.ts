import type { OperationsPermission, OperationsRole } from './types.js';

const READ_PERMISSIONS: OperationsPermission[] = [
  'view_operations_portfolio', 'view_product_operations', 'view_environment_operations',
  'view_releases', 'view_deployments', 'view_health', 'view_logs', 'view_metrics',
  'view_traces', 'view_errors', 'view_incidents', 'view_alerts', 'view_jobs', 'view_queues',
  'view_webhooks', 'view_database_operations', 'view_backups', 'view_domains',
  'view_integrations', 'view_provider_operations', 'view_operational_evidence', 'view_operational_audit',
];

const OPERATOR_PERMISSIONS: OperationsPermission[] = [
  ...READ_PERMISSIONS, 'manage_incidents', 'manage_alerts', 'retry_jobs', 'cancel_jobs',
  'manage_workers', 'manage_queues', 'retry_webhooks', 'run_migration_dry_run',
  'run_restore_test', 'manage_domains', 'verify_integrations', 'start_repair', 'manage_automation',
];

const RELEASE_PERMISSIONS: OperationsPermission[] = [
  ...OPERATOR_PERMISSIONS, 'promote_release', 'rollback_release', 'approve_release_promotion',
  'approve_rollback', 'apply_migration', 'approve_migration', 'manage_provider_routing',
];

const RECOVERY_PERMISSIONS: OperationsPermission[] = [
  ...OPERATOR_PERMISSIONS, 'approve_production_repair', 'approve_operations_action',
];

const ROLE_PERMISSIONS: Record<OperationsRole, Set<OperationsPermission>> = {
  viewer: new Set(READ_PERMISSIONS),
  operator: new Set(OPERATOR_PERMISSIONS),
  release_manager: new Set(RELEASE_PERMISSIONS),
  recovery_manager: new Set(RECOVERY_PERMISSIONS),
  admin: new Set([...RELEASE_PERMISSIONS, ...RECOVERY_PERMISSIONS, 'remove_integrations']),
};

export function hasOperationsPermission(role: OperationsRole, permission: OperationsPermission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsForRole(role: OperationsRole): OperationsPermission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function roleForProjectAccess(input: { isAdmin: boolean; isOwner: boolean }): OperationsRole | null {
  if (input.isAdmin) return 'admin';
  if (input.isOwner) return 'operator';
  return null;
}

/** Membership is authoritative only when its persisted owner matches the parent. */
export function ownerBoundMembershipProjectIds(rows: readonly { project_id: unknown; user_id: unknown; projects: unknown }[]): string[] {
  return rows.flatMap(row => {
    const parent = Array.isArray(row.projects) ? (row.projects.length === 1 ? row.projects[0] : null) : row.projects;
    if (!parent || typeof parent !== 'object' || !('user_id' in parent) || parent.user_id !== row.user_id || typeof row.user_id !== 'string' || !row.user_id) return [];
    return typeof row.project_id === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(row.project_id) ? [row.project_id] : [];
  });
}
